import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hoursSchema, openSlots, parseHours, slotLabel, type Busy } from "@/lib/booking";

type DB = import("@supabase/supabase-js").SupabaseClient;
type Ctx = { supabase: DB; userId: string };
const tokenSchema = z.object({ token: z.string().min(10).max(120) });

/** Everything the booking page needs, or null if the link is bad. */
export async function loadBooking(db: DB, applicationId: string, now = Date.now()) {
  const { data: app } = await db
    .from("applications")
    .select("id, org_id, full_name, status, dealership_id, job_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return null;
  const [{ data: store }, { data: job }] = await Promise.all([
    db
      .from("dealerships")
      .select("id, name, address, city, state, timezone, interview_hours, interview_minutes")
      .eq("id", app.dealership_id)
      .single(),
    db.from("jobs").select("title").eq("id", app.job_id).maybeSingle(),
  ]);
  if (!store) return null;
  // Busy = scheduled interviews at this store (any applicant), from today on.
  const { data: storeApps } = await db.from("applications").select("id").eq("dealership_id", store.id);
  const ids = (storeApps ?? []).map((a) => a.id);
  const { data: ivs } = ids.length
    ? await db
        .from("interviews")
        .select("id, application_id, starts_at, duration_min, status")
        .in("application_id", ids)
        .eq("status", "scheduled")
        .gte("starts_at", new Date(now - 86400e3).toISOString())
    : { data: [] };
  const mine = (ivs ?? []).filter((i) => i.application_id === app.id && Date.parse(i.starts_at) > now);
  const busy: Busy[] = (ivs ?? [])
    .filter((i) => i.application_id !== app.id)
    .map((i) => ({ start: Date.parse(i.starts_at), end: Date.parse(i.starts_at) + (i.duration_min || 30) * 60e3 }));
  const timeZone = store.timezone || "America/Chicago";
  const minutes = store.interview_minutes || 30;
  const { loadSettings } = await import("@/lib/messaging/outbox.server");
  const { parseAutomations, bookingLeadHours, bookingDaysAhead } = await import("@/lib/automations");
  const auto = parseAutomations((await loadSettings(db, app.org_id)).automations);
  // Busy times on the managers' own calendars (linked on the store page).
  try {
    const { storeBusy } = await import("@/lib/busy-calendar.server");
    busy.push(...(await storeBusy(db, store.id, timeZone, now, now + 9 * 86400e3)));
  } catch {
    /* a calendar problem never blocks booking */
  }
  const slots = openSlots({
    hours: parseHours(store.interview_hours),
    minutes,
    timeZone,
    busy,
    now,
    days: bookingDaysAhead(auto),
    leadHours: bookingLeadHours(auto),
    max: 120,
  });
  const address = [store.address, [store.city, store.state].filter(Boolean).join(", ")].filter(Boolean).join(", ") || null;
  return { app, store, job, timeZone, minutes, slots, address, upcoming: mine[0] ?? null, auto };
}

/** Public: the open times for the candidate's booking link. */
export const getBooking = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { readBookToken } = await import("@/lib/offers-token.server");
    const appId = await readBookToken(data.token);
    if (!appId) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const b = await loadBooking(supabaseAdmin, appId);
    if (!b) return null;
    return {
      first: b.app.full_name.split(" ")[0] ?? "",
      store: b.store.name,
      job: b.job?.title ?? null,
      address: b.address,
      timeZone: b.timeZone,
      minutes: b.minutes,
      closed: ["rejected", "hired"].includes(b.app.status),
      upcoming: b.upcoming ? b.upcoming.starts_at : null,
      slots: b.slots.map((t) => new Date(t).toISOString()),
    };
  });

/** Public: book (or move) the candidate's interview into an open time. */
export const bookInterview = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; startsAt: string }) =>
    tokenSchema.extend({ startsAt: z.string().datetime() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readBookToken } = await import("@/lib/offers-token.server");
    const appId = await readBookToken(data.token);
    if (!appId) throw new Error("This booking link isn't valid.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const b = await loadBooking(db, appId);
    if (!b) throw new Error("This booking link isn't valid.");
    if (["rejected", "hired"].includes(b.app.status)) throw new Error("This interview request is closed.");
    const start = Date.parse(data.startsAt);
    if (!b.slots.includes(start)) throw new Error("Sorry, that time was just taken. Please pick another.");

    const moved = b.upcoming;
    if (moved) await db.from("interviews").update({ status: "cancelled" }).eq("id", moved.id);
    const { error } = await db.from("interviews").insert({
      org_id: b.app.org_id,
      application_id: b.app.id,
      starts_at: new Date(start).toISOString(),
      duration_min: b.minutes,
      location: b.address,
      source: "self_scheduled",
      status: "scheduled",
    });
    if (error) throw new Error("Couldn't book that time. Please try again.");

    const when = slotLabel(start, b.timeZone);
    const events: { org_id: string; application_id: string; kind: string; message: string }[] = [
      {
        org_id: b.app.org_id,
        application_id: b.app.id,
        kind: "interview",
        message: moved ? `Candidate moved their interview to ${when}` : `Candidate booked an interview for ${when}`,
      },
    ];
    if (["new", "screening"].includes(b.app.status)) {
      await db.from("applications").update({ status: "interview" }).eq("id", b.app.id);
      const { statusEventRows } = await import("@/lib/status-log");
      events.push(...statusEventRows(b.app.org_id, [b.app.id], "interview"));
    }
    await db.from("application_events").insert(events);

    try {
      const { queueText, deliverDue } = await import("@/lib/messaging/outbox.server");
      const { textFor } = await import("@/lib/automations");
      const first = b.app.full_name.split(" ")[0] ?? "";
      const candidateBody = textFor(b.auto, "booked", { first, store: b.store.name, when, address: b.address });
      const managerBody = textFor(b.auto, "bookedManager", {
        name: b.app.full_name,
        change: moved ? "moved their interview to" : "booked an interview for",
        when,
        job: b.job?.title ?? "",
      });
      const rows = await Promise.all([
        ...(candidateBody
          ? [queueText(db, { applicationId: b.app.id, party: "candidate", purpose: "candidate_interview_booked", body: candidateBody })]
          : []),
        ...(managerBody
          ? [queueText(db, { applicationId: b.app.id, party: "manager", purpose: "manager_interview_booked", body: managerBody })]
          : []),
      ]);
      const due = rows.filter((r) => r.status === "queued").map((r) => r.id);
      if (due.length) await deliverDue(db, { ids: due });
    } catch {
      /* booking stands even if a confirmation text can't go out */
    }
    // Confirmation email with the time (once per time picked).
    try {
      const { emailApplicant } = await import("@/lib/email/applicant.server");
      await emailApplicant(db, b.app.id, { kind: "interview", startsAt: new Date(start).toISOString() });
    } catch {
      /* the booking stands either way */
    }
    return { when, moved: !!moved };
  });

/** Staff: text the candidate their booking link (e.g. to reschedule). */
export const sendBookingLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { applicationId: string }) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: ok } = await ctx.supabase.rpc("can_access_application", { _app: data.applicationId, _uid: ctx.userId });
    if (!ok) throw new Error("You don't have access to this applicant.");
    const link = await bookingLink(data.applicationId, getRequest());
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: app } = await db.from("applications").select("full_name, dealership_id, org_id").eq("id", data.applicationId).single();
    const { data: store } = await db.from("dealerships").select("name").eq("id", app?.dealership_id ?? "").maybeSingle();
    const { queueText, deliverDue, loadSettings } = await import("@/lib/messaging/outbox.server");
    const { parseAutomations, wordingFor } = await import("@/lib/automations");
    const auto = parseAutomations((await loadSettings(db, app?.org_id ?? "")).automations);
    // Staff asked for this, so it goes even if the automatic invite is turned off.
    const row = await queueText(db, {
      applicationId: data.applicationId,
      party: "candidate",
      purpose: "candidate_booking_link",
      body: wordingFor(auto, "invite", { first: app?.full_name.split(" ")[0] ?? "", store: store?.name ?? "the dealership", link }),
    });
    if (row.status === "queued") await deliverDue(db, { ids: [row.id] });
    return { link, note: row.status === "blocked" ? `Text not sent: ${row.error ?? "blocked"}` : null };
  });

/** The candidate's booking link. */
export async function bookingLink(applicationId: string, request?: Request) {
  const { bookToken } = await import("@/lib/offers-token.server");
  const { appBaseUrl } = await import("@/lib/email/provider.server");
  return `${appBaseUrl(request)}/book/${await bookToken(applicationId)}`;
}

/** Staff: when a store takes interviews, and how long they are. */
export const saveInterviewHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; storeId: string; hours: unknown; minutes: number }) =>
    z
      .object({
        orgId: z.string().uuid(),
        storeId: z.string().uuid(),
        hours: hoursSchema,
        minutes: z.number().int().min(10).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const [{ data: canPost }, { data: canStore }] = await Promise.all([
      ctx.supabase.rpc("can_post_jobs", { _org: data.orgId, _uid: ctx.userId }),
      ctx.supabase.rpc("can_access_store", { _org: data.orgId, _store: data.storeId, _uid: ctx.userId }),
    ]);
    if (!canPost && !canStore) throw new Error("You can't change this store's settings.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db
      .from("dealerships")
      .update({ interview_hours: data.hours, interview_minutes: data.minutes })
      .eq("id", data.storeId)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
