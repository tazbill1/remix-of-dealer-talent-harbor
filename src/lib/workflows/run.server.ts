/**
 * Runs the texting workflows: welcome on apply, manager summary / nudge / escalation,
 * interview reminders and 30/60/90 check-ins. Every text goes through queueText, so
 * consent, STOP and texting hours always apply. Safe to run repeatedly: each step
 * checks what's already been sent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chunk, fetchAll } from "@/lib/fetch-all";
import type { SendWindow } from "@/lib/messaging/core";
import {
  deliverDue,
  escalationContact,
  loadSettings,
  managerContact,
  queueText,
  type Party,
} from "@/lib/messaging/outbox.server";
import type { MessagingSettings } from "@/lib/messaging-settings";
import { checkinSchedule } from "@/lib/retention";
import {
  dueCheckin,
  dueReminders,
  firstName,
  nextManagerStep,
  PURPOSE,
  text,
  type Msg,
} from "@/lib/workflows/rules";

type DB = SupabaseClient<Database>;
const HOUR = 3600e3;

/** Queue a text and send it right away when it's inside texting hours. */
export async function sendText(
  sb: DB,
  admin: DB,
  input: {
    applicationId: string;
    party: Party;
    body: string;
    purpose: string;
    to?: string | null;
    now?: number;
  },
) {
  const now = input.now ?? Date.now();
  const row = await queueText(sb, { ...input, now });
  if (row?.status === "queued" && row.scheduled_for && Date.parse(row.scheduled_for) <= now)
    await deliverDue(admin, { ids: [row.id], now });
  return row;
}

export const windowFor = (s: MessagingSettings, timeZone: string | null): SendWindow => ({
  start: s.send_start,
  end: s.send_end,
  days: s.send_days,
  timeZone: timeZone || "America/Chicago",
});

export const localDate = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(ms);

export const whenText = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const STORE_COLS =
  "id, name, assistant_name, address, timezone, manager_name, manager_phone, escalation_name, escalation_phone";
const JOB_COLS =
  "id, title, hiring_manager, hiring_manager_phone, escalation_name, escalation_phone";
type Store = {
  id: string;
  name: string;
  assistant_name: string | null;
  address: string | null;
  timezone: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  escalation_name: string | null;
  escalation_phone: string | null;
};
type Job = {
  id: string;
  title: string;
  hiring_manager: string | null;
  hiring_manager_phone: string | null;
  escalation_name: string | null;
  escalation_phone: string | null;
};

/** Text a new applicant right after they apply. Never throws: applying must not fail. */
export async function welcomeOnApply(admin: DB, applicationId: string, now = Date.now()) {
  try {
    const { data: app } = await admin
      .from("applications")
      .select("id, full_name, dealership_id, job_id")
      .eq("id", applicationId)
      .single();
    if (!app) return null;
    const [{ data: store }, { data: job }] = await Promise.all([
      admin.from("dealerships").select("name, assistant_name").eq("id", app.dealership_id).single(),
      admin.from("jobs").select("title").eq("id", app.job_id).maybeSingle(),
    ]);
    return await sendText(admin, admin, {
      applicationId,
      party: "candidate",
      purpose: PURPOSE.welcome,
      now,
      body: text.welcome({
        first: firstName(app.full_name),
        store: store?.name ?? "our",
        assistant: store?.assistant_name ?? "the hiring assistant",
        job: job?.title ?? "the role",
      }),
    });
  } catch (e) {
    console.error("welcome text failed", e);
    return null;
  }
}

/** Loads stores, jobs and settings once per run. */
function lookups(admin: DB) {
  const stores = new Map<string, Store>();
  const jobs = new Map<string, Job>();
  const settings = new Map<string, MessagingSettings>();
  return {
    async load(storeIds: string[], jobIds: string[]) {
      const s = [...new Set(storeIds)].filter((id) => !stores.has(id));
      const j = [...new Set(jobIds)].filter((id) => !jobs.has(id));
      for (const ids of chunk(s)) {
        const { data } = await admin.from("dealerships").select(STORE_COLS).in("id", ids);
        (data as Store[] | null)?.forEach((r) => stores.set(r.id, r));
      }
      for (const ids of chunk(j)) {
        const { data } = await admin.from("jobs").select(JOB_COLS).in("id", ids);
        (data as Job[] | null)?.forEach((r) => jobs.set(r.id, r));
      }
    },
    store: (id: string) => stores.get(id),
    job: (id: string) => jobs.get(id) ?? null,
    async settings(orgId: string) {
      if (!settings.has(orgId)) settings.set(orgId, await loadSettings(admin, orgId));
      return settings.get(orgId)!;
    },
  };
}

async function messagesFor(admin: DB, ids: string[]) {
  const out: Msg[] = [];
  for (const part of chunk(ids)) {
    out.push(
      ...(await fetchAll<Msg>((f, t) =>
        admin
          .from("messages")
          .select("application_id, party, direction, purpose, status, created_at")
          .in("application_id", part)
          .range(f, t),
      )),
    );
  }
  const by = new Map<string, Msg[]>();
  for (const m of out) by.set(m.application_id, [...(by.get(m.application_id) ?? []), m]);
  return by;
}

export async function runWorkflows(admin: DB, opts: { now?: number } = {}) {
  const now = opts.now ?? Date.now();
  const result = { summaries: 0, nudges: 0, escalations: 0, reminders: 0, checkins: 0, errors: 0 };
  const look = lookups(admin);
  const safely = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      result.errors++;
      console.error("workflow step failed", e);
    }
  };

  // 1. Manager summary, nudge and escalation for candidates in Screening.
  type ScreenApp = {
    id: string;
    org_id: string;
    dealership_id: string;
    job_id: string;
    full_name: string;
    ai_summary: string | null;
    rating: number | null;
  };
  const screening = await fetchAll<ScreenApp>((f, t) =>
    admin
      .from("applications")
      .select("id, org_id, dealership_id, job_id, full_name, ai_summary, rating")
      .eq("status", "screening")
      .order("created_at")
      .range(f, t),
  );
  await look.load(
    screening.map((a) => a.dealership_id),
    screening.map((a) => a.job_id),
  );
  const screeningMsgs = await messagesFor(
    admin,
    screening.map((a) => a.id),
  );
  for (const app of screening) {
    await safely(async () => {
      const store = look.store(app.dealership_id);
      if (!store) return;
      const job = look.job(app.job_id);
      const s = await look.settings(app.org_id);
      const esc = escalationContact(store, job);
      const step = nextManagerStep({
        status: "screening",
        messages: screeningMsgs.get(app.id) ?? [],
        nudgeAfterHours: s.nudge_after_hours,
        escalateAfterHours: s.escalate_after_hours,
        hasEscalationContact: !!(esc.phone || esc.name),
        window: windowFor(s, store.timezone),
        now,
      });
      if (!step) return;
      const title = job?.title ?? "an open role";
      if (step === "summary") {
        await sendText(admin, admin, {
          applicationId: app.id,
          party: "manager",
          purpose: PURPOSE.summary,
          now,
          body: text.summary({
            assistant: store.assistant_name ?? "Your hiring assistant",
            name: app.full_name,
            job: title,
            summary: app.ai_summary || "They've finished the screening questions.",
            rating: app.rating,
          }),
        });
        result.summaries++;
      } else if (step === "nudge") {
        await sendText(admin, admin, {
          applicationId: app.id,
          party: "manager",
          purpose: PURPOSE.nudge,
          now,
          body: text.nudge({ name: app.full_name, job: title }),
        });
        result.nudges++;
      } else {
        await sendText(admin, admin, {
          applicationId: app.id,
          party: "manager",
          purpose: PURPOSE.escalation,
          to: esc.phone ?? null,
          now,
          body: text.escalation({
            manager: managerContact(store, job).name,
            name: app.full_name,
            job: title,
            hours: s.escalate_after_hours,
          }),
        });
        await admin.from("application_events").insert({
          org_id: app.org_id,
          application_id: app.id,
          kind: "texting",
          message: `No reply from the hiring manager; texted ${esc.name ?? "the escalation contact"}`,
        });
        result.escalations++;
      }
    });
  }

  // 2. Interview reminders for the next ~day.
  type Iv = { id: string; application_id: string; starts_at: string; created_at: string };
  const interviews = await fetchAll<Iv>((f, t) =>
    admin
      .from("interviews")
      .select("id, application_id, starts_at, created_at")
      .eq("status", "scheduled")
      .gte("starts_at", new Date(now).toISOString())
      .lte("starts_at", new Date(now + 27 * HOUR).toISOString())
      .order("starts_at")
      .range(f, t),
  );
  if (interviews.length) {
    const ids = [...new Set(interviews.map((i) => i.application_id))];
    type IvApp = {
      id: string;
      org_id: string;
      dealership_id: string;
      job_id: string;
      full_name: string;
    };
    const apps = new Map<string, IvApp>();
    for (const part of chunk(ids)) {
      const { data } = await admin
        .from("applications")
        .select("id, org_id, dealership_id, job_id, full_name")
        .in("id", part);
      data?.forEach((a) => apps.set(a.id, a));
    }
    await look.load(
      [...apps.values()].map((a) => a.dealership_id),
      [...apps.values()].map((a) => a.job_id),
    );
    const msgs = await messagesFor(admin, ids);
    for (const iv of interviews) {
      await safely(async () => {
        const app = apps.get(iv.application_id);
        const store = app && look.store(app.dealership_id);
        if (!app || !store) return;
        const s = await look.settings(app.org_id);
        const tz = store.timezone || "America/Chicago";
        // Only count reminders sent for this booking (a reschedule starts fresh).
        const since = Date.parse(iv.created_at);
        const mine = (msgs.get(app.id) ?? []).filter((m) => Date.parse(m.created_at) >= since);
        const when = whenText(iv.starts_at, tz);
        for (const r of dueReminders({
          startsAt: Date.parse(iv.starts_at),
          messages: mine,
          window: windowFor(s, tz),
          now,
        })) {
          const body =
            r.purpose === PURPOSE.reminderDay
              ? text.reminderDay({
                  first: firstName(app.full_name),
                  when,
                  store: store.name,
                  address: store.address,
                })
              : r.purpose === PURPOSE.reminderSoon
                ? text.reminderSoon({ first: firstName(app.full_name), when, store: store.name })
                : text.reminderManager({
                    name: app.full_name,
                    job: look.job(app.job_id)?.title ?? "the role",
                    when,
                  });
          await sendText(admin, admin, {
            applicationId: app.id,
            party: r.party,
            purpose: r.purpose,
            body,
            now,
          });
          result.reminders++;
        }
      });
    }
  }

  // 3. 30/60/90 check-ins to the hiring manager.
  type Hire = {
    id: string;
    org_id: string;
    dealership_id: string;
    job_id: string;
    full_name: string;
    start_date: string | null;
    hired_at: string | null;
    departed_at: string | null;
  };
  const hires = (
    await fetchAll<Hire>((f, t) =>
      admin
        .from("applications")
        .select("id, org_id, dealership_id, job_id, full_name, start_date, hired_at, departed_at")
        .eq("status", "hired")
        .order("created_at")
        .range(f, t),
    )
  ).filter((h) => !h.departed_at && (h.start_date || h.hired_at));
  if (hires.length) {
    await look.load(
      hires.map((h) => h.dealership_id),
      hires.map((h) => h.job_id),
    );
    type Row = {
      application_id: string;
      day_mark: number;
      sent_at: string | null;
      responded_at: string | null;
    };
    const rows: Row[] = [];
    for (const part of chunk(hires.map((h) => h.id))) {
      const { data } = await admin
        .from("retention_checkins")
        .select("application_id, day_mark, sent_at, responded_at")
        .in("application_id", part);
      rows.push(...(data ?? []));
    }
    for (const h of hires) {
      await safely(async () => {
        const store = look.store(h.dealership_id);
        if (!store) return;
        const due = dueCheckin({
          schedule: checkinSchedule(h.start_date, h.hired_at),
          rows: rows.filter((r) => r.application_id === h.id),
          today: localDate(now, store.timezone || "America/Chicago"),
        });
        if (!due) return;
        await sendText(admin, admin, {
          applicationId: h.id,
          party: "manager",
          purpose: PURPOSE.checkin(due.mark),
          body: text.checkin({ name: h.full_name, mark: due.mark }),
          now,
        });
        await admin.from("retention_checkins").upsert(
          {
            org_id: h.org_id,
            application_id: h.id,
            day_mark: due.mark,
            due_on: due.due,
            sent_at: new Date(now).toISOString(),
          },
          { onConflict: "application_id,day_mark" },
        );
        result.checkins++;
      });
    }
  }

  return result;
}
