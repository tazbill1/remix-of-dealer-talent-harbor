import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  defaultMessagingSettings,
  messagingSettingsSchema,
  type MessagingSettings,
} from "@/lib/messaging-settings";
import { decideDelivery, keywordReply, toE164, type Keyword } from "@/lib/messaging/core";
import { sendTwilio, twilioConfigured } from "@/lib/messaging/twilio.server";

type DB = SupabaseClient<Database>;
export type Party = "candidate" | "manager";

export async function loadSettings(sb: DB, orgId: string): Promise<MessagingSettings> {
  const { data } = await sb
    .from("messaging_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  const parsed = data ? messagingSettingsSchema.safeParse(data) : null;
  return parsed?.success ? parsed.data : defaultMessagingSettings();
}

/** The store's hiring contact, with job-level overrides winning. */
export function managerContact(
  store: { manager_name: string | null; manager_phone: string | null },
  job: { hiring_manager: string | null; hiring_manager_phone: string | null } | null,
) {
  return {
    name: job?.hiring_manager?.trim() || store.manager_name?.trim() || "the hiring manager",
    phone: toE164(job?.hiring_manager_phone) ?? toE164(store.manager_phone),
  };
}

/** Who gets escalations: job override, then the store's escalation contact. */
export function escalationContact(
  store: { escalation_name: string | null; escalation_phone: string | null },
  job: { escalation_name: string | null; escalation_phone: string | null } | null,
) {
  return {
    name: job?.escalation_name?.trim() || store.escalation_name?.trim() || null,
    phone: toE164(job?.escalation_phone) ?? toE164(store.escalation_phone),
  };
}

/**
 * Put a text in the outbox. Checks the number, opt-outs, candidate consent and the
 * texting window; texts outside the window wait for the next one. The delivery job
 * (deliverDue) sends what's due: simulated in practice mode, through Twilio when live.
 */
export async function queueText(
  sb: DB,
  input: {
    applicationId: string;
    party: Party;
    body: string;
    purpose: string;
    /** Defaults: the candidate's phone, or the job/store hiring contact for managers. */
    to?: string | null;
    isKeywordReply?: boolean;
    now?: number;
  },
) {
  const now = input.now ?? Date.now();
  const { data: app, error } = await sb
    .from("applications")
    .select("id, org_id, dealership_id, job_id, phone, candidate_id")
    .eq("id", input.applicationId)
    .single();
  if (error || !app) throw new Error("Applicant not found.");
  const [{ data: store }, { data: job }, settings] = await Promise.all([
    sb
      .from("dealerships")
      .select("name, sms_number, timezone, manager_name, manager_phone")
      .eq("id", app.dealership_id)
      .single(),
    sb
      .from("jobs")
      .select("hiring_manager, hiring_manager_phone")
      .eq("id", app.job_id)
      .maybeSingle(),
    loadSettings(sb, app.org_id),
  ]);
  const defaultTo =
    input.party === "candidate"
      ? app.phone
      : store
        ? managerContact(store, job ?? null).phone
        : null;
  const to = toE164(input.to === undefined ? defaultTo : input.to);

  const [optOut, candidate] = await Promise.all([
    to
      ? sb.from("sms_opt_outs").select("id").eq("org_id", app.org_id).eq("phone", to).maybeSingle()
      : Promise.resolve({ data: null }),
    input.party === "candidate" && app.candidate_id
      ? sb
          .from("candidates")
          .select("sms_opt_in, sms_opted_out_at")
          .eq("id", app.candidate_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const consent = !!candidate.data?.sms_opt_in && !candidate.data?.sms_opted_out_at;
  const window = {
    start: settings.send_start,
    end: settings.send_end,
    days: settings.send_days,
    timeZone: store?.timezone || "America/Chicago",
  };
  const decide = (phone: string | null) =>
    decideDelivery({
      to: phone,
      party: input.party,
      optedOut: !!optOut.data || !!candidate.data?.sms_opted_out_at,
      candidateConsent: consent,
      isKeywordReply: input.isKeywordReply,
      now,
      window,
    });
  let decision = decide(to);
  let note: string | null = null;
  // Practice mode: test stores often have no phone numbers yet, so let those through
  // (consent, STOP and the texting window still apply). Live mode always blocks them.
  if (settings.mode === "practice" && !to) {
    decision = decide("+10000000000");
    note = "No mobile number on file (practice only)";
  }

  const { data: row, error: insertError } = await sb
    .from("messages")
    .insert({
      org_id: app.org_id,
      application_id: app.id,
      party: input.party,
      direction: "out",
      channel: "sms",
      body: input.body,
      purpose: input.purpose,
      to_phone: to,
      from_phone: toE164(store?.sms_number),
      status: decision.status,
      scheduled_for:
        decision.status === "queued" ? new Date(decision.scheduledFor).toISOString() : null,
      error: decision.status === "blocked" ? decision.reason : note,
    })
    .select("id, status, scheduled_for, error")
    .single();
  if (insertError) throw new Error(insertError.message);
  return row;
}

/**
 * Send every queued text that's due. Practice mode marks them "simulated" (shown in the
 * app, never sent). Live mode sends through Twilio. Rechecks opt-outs at send time.
 * Uses the admin client; called by the scheduled job and right after a text is queued.
 */
export async function deliverDue(
  sb: DB,
  opts: { now?: number; statusCallback?: string; limit?: number; ids?: string[] } = {},
) {
  const now = opts.now ?? Date.now();
  let q = sb
    .from("messages")
    .select("id, org_id, to_phone, from_phone, body, purpose")
    .eq("status", "queued")
    .lte("scheduled_for", new Date(now).toISOString())
    .order("scheduled_for")
    .limit(opts.limit ?? 200);
  if (opts.ids) q = q.in("id", opts.ids);
  const { data: due } = await q;
  const settingsByOrg = new Map<string, MessagingSettings>();
  const result = { sent: 0, simulated: 0, failed: 0, blocked: 0 };

  for (const m of due ?? []) {
    // Claim the message so two runs never send it twice.
    const { data: claimed } = await sb
      .from("messages")
      .update({ status: "sending" })
      .eq("id", m.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed?.length) continue;

    if (m.purpose !== "keyword" && m.to_phone) {
      const { data: out } = await sb
        .from("sms_opt_outs")
        .select("id")
        .eq("org_id", m.org_id)
        .eq("phone", m.to_phone)
        .maybeSingle();
      if (out) {
        await sb
          .from("messages")
          .update({ status: "blocked", error: "This number replied STOP" })
          .eq("id", m.id);
        result.blocked++;
        continue;
      }
    }

    if (!settingsByOrg.has(m.org_id)) settingsByOrg.set(m.org_id, await loadSettings(sb, m.org_id));
    const settings = settingsByOrg.get(m.org_id)!;
    const sentAt = new Date().toISOString();

    if (settings.mode !== "live") {
      await sb
        .from("messages")
        .update({ status: "simulated", provider: "practice", sent_at: sentAt })
        .eq("id", m.id);
      result.simulated++;
      continue;
    }
    if (!twilioConfigured() || !m.from_phone || !m.to_phone) {
      const error = !twilioConfigured()
        ? "Texting provider isn't connected yet"
        : !m.from_phone
          ? "This store has no texting number"
          : "No valid mobile number";
      await sb.from("messages").update({ status: "failed", error }).eq("id", m.id);
      result.failed++;
      continue;
    }
    try {
      const { providerMessageId } = await sendTwilio({
        to: m.to_phone,
        from: m.from_phone,
        body: m.body,
        statusCallback: opts.statusCallback,
      });
      await sb
        .from("messages")
        .update({
          status: "sent",
          provider: "twilio",
          provider_message_id: providerMessageId,
          sent_at: sentAt,
        })
        .eq("id", m.id);
      result.sent++;
    } catch (e) {
      await sb
        .from("messages")
        .update({ status: "failed", provider: "twilio", error: (e as Error).message })
        .eq("id", m.id);
      result.failed++;
    }
  }
  return result;
}

/**
 * STOP / START / HELP from a phone. Needs the admin client: opt-outs are server-only.
 * Records the opt-out for the whole dealer group and updates the candidate's consent.
 */
export async function applyKeyword(
  admin: DB,
  input: {
    orgId: string;
    phone: string;
    keyword: Keyword;
    candidateId?: string | null;
    source: string;
  },
) {
  const nowIso = new Date().toISOString();
  if (input.keyword === "stop") {
    await admin
      .from("sms_opt_outs")
      .upsert(
        { org_id: input.orgId, phone: input.phone, source: input.source, opted_out_at: nowIso },
        { onConflict: "org_id,phone" },
      );
    if (input.candidateId)
      await admin
        .from("candidates")
        .update({ sms_opt_in: false, sms_opted_out_at: nowIso })
        .eq("id", input.candidateId);
  } else if (input.keyword === "start") {
    await admin.from("sms_opt_outs").delete().eq("org_id", input.orgId).eq("phone", input.phone);
    if (input.candidateId)
      await admin
        .from("candidates")
        .update({
          sms_opt_in: true,
          sms_opt_in_at: nowIso,
          sms_opted_out_at: null,
          consent_source: `sms_start:${input.source}`,
        })
        .eq("id", input.candidateId);
  }
}

export { keywordReply };
