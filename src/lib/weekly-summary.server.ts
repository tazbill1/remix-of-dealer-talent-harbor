/**
 * Sends the weekly HR summary. Each team member gets one email for the stores they can
 * see, once per week, logged in `weekly_summaries` (one row per member per week, so a
 * second run can't send twice). These go to staff, not applicants, so they don't use
 * queueEmail (which is tied to an application), but they follow the same rules:
 * practice mode only simulates, unsubscribed addresses are skipped, and every email
 * carries the footer with a signed unsubscribe link.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { emailFooter, normalizeEmail } from "@/lib/email/core";
import { isEmailOptedOut, loadEmailSettings, type EmailSettings } from "@/lib/email/outbox.server";
import {
  EmailSendError,
  emailConfigured,
  sendLovable,
  unsubscribeToken,
  withoutOurUnsubscribe,
} from "@/lib/email/provider.server";
import { applyEmailOptOut } from "@/lib/email/unsubscribe.server";
import { fetchAll } from "@/lib/fetch-all";
import { parseAutomations } from "@/lib/automations";
import {
  memberTimeZone,
  storesFor,
  storeWeek,
  summaryDue,
  summaryEmail,
  weekOf,
  weeklySummarySettings,
  type SApp,
  type SCheckin,
  type SInterview,
  type SMember,
  type SOffer,
  type SScope,
  type SStore,
} from "@/lib/weekly-summary";

type DB = SupabaseClient<Database>;
const DAY = 24 * 3600e3;
export const FROM_NAME = "hireme by WerkandMe";

type OrgData = {
  groupName: string;
  stores: SStore[];
  members: SMember[];
  scopes: SScope[];
};

async function loadOrg(admin: DB, orgId: string): Promise<OrgData> {
  const [org, stores, members, scopes] = await Promise.all([
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    admin
      .from("dealerships")
      .select("id, name, region_id, timezone")
      .eq("org_id", orgId)
      .order("name"),
    admin.from("org_members").select("id, role, email, user_id").eq("org_id", orgId),
    admin
      .from("org_member_scopes")
      .select("member_id, dealership_id, region_id")
      .eq("org_id", orgId),
  ]);
  return {
    groupName: org.data?.name ?? "your dealer group",
    stores: (stores.data ?? []) as SStore[],
    members: (members.data ?? []) as SMember[],
    scopes: (scopes.data ?? []) as SScope[],
  };
}

/** The rows the numbers are counted from: the last 7 days (and interviews in the next 7). */
async function loadActivity(admin: DB, orgId: string, now: number) {
  const weekAgo = new Date(now - 7 * DAY).toISOString();
  const weekAhead = new Date(now + 7 * DAY).toISOString();
  const [apps, interviews, offers, checkins] = await Promise.all([
    fetchAll<SApp>((f, t) =>
      admin
        .from("applications")
        .select("id, dealership_id, status, created_at, hired_at, needs_attention, departed_at")
        .eq("org_id", orgId)
        .order("created_at")
        .range(f, t),
    ),
    fetchAll<SInterview>((f, t) =>
      admin
        .from("interviews")
        .select("application_id, starts_at, status")
        .eq("org_id", orgId)
        .gte("starts_at", weekAgo)
        .lte("starts_at", weekAhead)
        .order("starts_at")
        .range(f, t),
    ),
    fetchAll<SOffer>((f, t) =>
      admin
        .from("offers")
        .select("application_id, created_at, completed_at, is_offer_letter")
        .eq("org_id", orgId)
        .or(`created_at.gte.${weekAgo},completed_at.gte.${weekAgo}`)
        .order("created_at")
        .range(f, t),
    ),
    fetchAll<SCheckin>((f, t) =>
      admin
        .from("retention_checkins")
        .select("application_id, due_on, sent_at, responded_at, still_employed")
        .eq("org_id", orgId)
        .not("sent_at", "is", null)
        .or(`responded_at.is.null,responded_at.gte.${weekAgo}`)
        .order("due_on")
        .range(f, t),
    ),
  ]);
  return { apps, interviews, offers, checkins };
}

type Activity = Awaited<ReturnType<typeof loadActivity>>;

/** One member's summary, or null if they have no email or no stores. */
export function buildFor(
  org: OrgData,
  activity: Activity,
  member: SMember,
  now: number,
  appUrl: string,
) {
  const to = normalizeEmail(member.email);
  const stores = storesFor(member, org.scopes, org.stores);
  if (!to || !stores.length) return null;
  const tz = memberTimeZone(stores);
  const week = weekOf(now, tz);
  const email = summaryEmail({
    groupName: org.groupName,
    weekOf: week,
    appUrl,
    stores: stores.map((s) => storeWeek(s, activity, now)),
  });
  return { to, tz, week, ...email };
}

/** Send one staff email (or simulate it in practice mode). Never throws. */
export async function sendStaffEmail(
  admin: DB,
  settings: EmailSettings,
  input: {
    orgId: string;
    to: string;
    subject: string;
    body: string;
    footerName: string;
    appUrl: string;
    key: string;
  },
): Promise<{
  status: "sent" | "simulated" | "blocked" | "failed";
  error: string | null;
  body: string;
}> {
  let body = input.body;
  try {
    const unsubscribeUrl = `${input.appUrl}/u/${await unsubscribeToken(input.orgId, input.to)}`;
    body = `${input.body.trim()}\n\n${emailFooter({ storeName: input.footerName, address: null, unsubscribeUrl })}`;
    if (await isEmailOptedOut(admin, input.orgId, input.to))
      return { status: "blocked", error: "This address unsubscribed", body };
    if (settings.email_mode !== "live") return { status: "simulated", error: null, body };
    const fromAddress = settings.email_from_address?.trim() || null;
    if (!emailConfigured())
      return { status: "failed", error: "Email sending isn't connected yet", body };
    if (!fromAddress)
      return {
        status: "failed",
        error: "No sending address set — add one on the Integrations page",
        body,
      };
    await sendLovable({
      fromAddress,
      fromName: FROM_NAME,
      to: input.to,
      subject: input.subject,
      text: withoutOurUnsubscribe(body),
      replyTo: settings.email_reply_to,
      idempotencyKey: input.key,
      label: "weekly_summary",
    });
    return { status: "sent", error: null, body };
  } catch (e) {
    if (e instanceof EmailSendError && e.suppressed) {
      await applyEmailOptOut(admin, input.orgId, input.to, "lovable_suppression").catch(() => {});
      return { status: "blocked", error: e.message, body };
    }
    return { status: "failed", error: (e as Error).message, body };
  }
}

/**
 * Scheduled: for every group that turned the summary on, email each team member whose
 * send time has arrived this week and who hasn't had this week's summary yet.
 */
export async function runWeeklySummaries(admin: DB, opts: { now?: number; appUrl: string }) {
  const now = opts.now ?? Date.now();
  const result = { sent: 0, simulated: 0, blocked: 0, failed: 0, errors: 0 };
  const { data: rows } = await admin.from("messaging_settings").select("org_id, automations");
  for (const row of rows ?? []) {
    try {
      const ws = weeklySummarySettings(parseAutomations(row.automations));
      if (!ws.enabled) continue;
      const org = await loadOrg(admin, row.org_id);
      // Who is due and not yet sent this week.
      const candidates = org.members.flatMap((m) => {
        const stores = storesFor(m, org.scopes, org.stores);
        if (!normalizeEmail(m.email) || !stores.length) return [];
        const tz = memberTimeZone(stores);
        return summaryDue(now, tz, ws.day, ws.hour) ? [{ m, week: weekOf(now, tz) }] : [];
      });
      if (!candidates.length) continue;
      const { data: done } = await admin
        .from("weekly_summaries")
        .select("member_id, week_of")
        .eq("org_id", row.org_id)
        .in("week_of", [...new Set(candidates.map((c) => c.week))]);
      const sent = new Set((done ?? []).map((d) => `${d.member_id}|${d.week_of}`));
      const due = candidates.filter((c) => !sent.has(`${c.m.id}|${c.week}`));
      if (!due.length) continue;

      const [activity, settings] = await Promise.all([
        loadActivity(admin, row.org_id, now),
        loadEmailSettings(admin, row.org_id),
      ]);
      for (const { m } of due) {
        try {
          const email = buildFor(org, activity, m, now, opts.appUrl);
          if (!email) continue;
          // Claim the week first: the unique (member, week) key stops a double send.
          const { data: claim, error } = await admin
            .from("weekly_summaries")
            .insert({
              org_id: row.org_id,
              member_id: m.id,
              week_of: email.week,
              to_email: email.to,
              subject: email.subject,
            })
            .select("id")
            .single();
          if (error || !claim) continue;
          const out = await sendStaffEmail(admin, settings, {
            orgId: row.org_id,
            to: email.to,
            subject: email.subject,
            body: email.body,
            footerName: org.groupName,
            appUrl: opts.appUrl,
            key: `weekly-${claim.id}`,
          });
          await admin
            .from("weekly_summaries")
            .update({
              status: out.status,
              error: out.error,
              body: out.body,
              sent_at:
                out.status === "sent" || out.status === "simulated"
                  ? new Date().toISOString()
                  : null,
            })
            .eq("id", claim.id);
          result[out.status]++;
        } catch (e) {
          result.errors++;
          console.error("weekly summary failed for member", m.id, e);
        }
      }
    } catch (e) {
      result.errors++;
      console.error("weekly summary failed for group", row.org_id, e);
    }
  }
  return result;
}

/** A preview of one person's summary, sent to them right away. Not logged, so the real one still goes out. */
export async function sendPreview(
  admin: DB,
  input: { orgId: string; userId: string; appUrl: string; now?: number },
) {
  const now = input.now ?? Date.now();
  const org = await loadOrg(admin, input.orgId);
  const member = org.members.find((m) => m.user_id === input.userId);
  if (!member)
    throw new Error("You're not on this group's team, so there's no summary to preview.");
  const activity = await loadActivity(admin, input.orgId, now);
  const email = buildFor(org, activity, member, now, input.appUrl);
  if (!email)
    throw new Error(
      "Your team login has no email address or no stores, so there's nothing to send.",
    );
  const settings = await loadEmailSettings(admin, input.orgId);
  const out = await sendStaffEmail(admin, settings, {
    orgId: input.orgId,
    to: email.to,
    subject: `[Preview] ${email.subject}`,
    body: email.body,
    footerName: org.groupName,
    appUrl: input.appUrl,
    key: `weekly-preview-${member.id}-${now}`,
  });
  return { to: email.to, status: out.status, error: out.error };
}
