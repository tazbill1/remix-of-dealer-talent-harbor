/**
 * Email outbox. Emails are saved in `messages` (channel "email") next to texts, so they
 * show on the candidate's timeline and go out through the same delivery job. Practice
 * mode logs them as "Practice · not sent"; live mode sends through Lovable's delivery.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { emailFooter, normalizeEmail } from "@/lib/email/core";
import {
  EmailSendError,
  emailConfigured,
  sendLovable,
  unsubscribeToken,
  withoutOurUnsubscribe,
} from "@/lib/email/provider.server";
import { applyEmailOptOut } from "@/lib/email/unsubscribe.server";

type DB = SupabaseClient<Database>;

export type EmailSettings = {
  email_mode: "practice" | "live";
  email_from_name: string | null;
  email_reply_to: string | null;
  email_from_address: string | null;
};

export async function loadEmailSettings(sb: DB, orgId: string): Promise<EmailSettings> {
  const { data } = await sb
    .from("messaging_settings")
    .select("email_mode, email_from_name, email_reply_to, email_from_address")
    .eq("org_id", orgId)
    .maybeSingle();
  return {
    email_mode: data?.email_mode === "live" ? "live" : "practice",
    email_from_name: data?.email_from_name ?? null,
    email_reply_to: data?.email_reply_to ?? null,
    email_from_address: data?.email_from_address ?? null,
  };
}

export async function isEmailOptedOut(sb: DB, orgId: string, email: string) {
  const { data } = await sb
    .from("email_opt_outs")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", email)
    .maybeSingle();
  return !!data;
}

/**
 * Put an email to a candidate in the outbox. Adds the store footer and a signed
 * unsubscribe link. Blocked (saved with the reason) if the address is missing or
 * unsubscribed. `baseUrl` is the app's public address for the unsubscribe link.
 */
export async function queueEmail(
  sb: DB,
  input: {
    applicationId: string;
    subject: string;
    body: string;
    purpose: string;
    baseUrl: string;
    campaignId?: string | null;
    now?: number;
  },
) {
  const now = input.now ?? Date.now();
  const { data: app, error } = await sb
    .from("applications")
    .select("id, org_id, dealership_id, email")
    .eq("id", input.applicationId)
    .single();
  if (error || !app) throw new Error("Applicant not found.");
  const { data: store } = await sb
    .from("dealerships")
    .select("name, address")
    .eq("id", app.dealership_id)
    .maybeSingle();
  const to = normalizeEmail(app.email);
  const optedOut = to ? await isEmailOptedOut(sb, app.org_id, to) : false;
  const reason = !to ? "No valid email address" : optedOut ? "This address unsubscribed" : null;
  const unsubscribeUrl = to
    ? `${input.baseUrl}/u/${await unsubscribeToken(app.org_id, to)}`
    : `${input.baseUrl}/u`;
  const body = `${input.body.trim()}\n\n${emailFooter({
    storeName: store?.name ?? "Hiring team",
    address: store?.address ?? null,
    unsubscribeUrl,
  })}`;

  const { data: row, error: insertError } = await sb
    .from("messages")
    .insert({
      org_id: app.org_id,
      application_id: app.id,
      party: "candidate",
      direction: "out",
      channel: "email",
      subject: input.subject.trim(),
      body,
      purpose: input.purpose,
      to_email: to,
      from_email: null,
      campaign_id: input.campaignId ?? null,
      status: reason ? "blocked" : "queued",
      scheduled_for: reason ? null : new Date(now).toISOString(),
      error: reason,
    })
    .select("id, status, error")
    .single();
  if (insertError) throw new Error(insertError.message);
  return row;
}

/** Send (or simulate) one claimed email. Called by deliverDue for channel "email". */
export async function deliverEmail(
  sb: DB,
  m: {
    id: string;
    org_id: string;
    application_id: string;
    to_email: string | null;
    subject: string | null;
    body: string;
    purpose?: string | null;
  },
  settings: EmailSettings,
): Promise<"sent" | "simulated" | "failed" | "blocked"> {
  const sentAt = new Date().toISOString();
  if (m.to_email && (await isEmailOptedOut(sb, m.org_id, m.to_email))) {
    await sb
      .from("messages")
      .update({ status: "blocked", error: "This address unsubscribed" })
      .eq("id", m.id);
    return "blocked";
  }
  if (settings.email_mode !== "live") {
    await sb
      .from("messages")
      .update({ status: "simulated", provider: "practice", sent_at: sentAt })
      .eq("id", m.id);
    return "simulated";
  }
  // Lovable's app email is one-to-one only; blasts wait for a bulk sender (Resend/SES).
  if (m.purpose === "bulk_email") {
    await sb
      .from("messages")
      .update({
        status: "blocked",
        error: "Bulk email needs a bulk email service (Resend or Amazon SES), not set up yet",
      })
      .eq("id", m.id);
    return "blocked";
  }
  const fromAddress = settings.email_from_address?.trim() || null;
  if (!emailConfigured() || !fromAddress || !m.to_email) {
    const error = !emailConfigured()
      ? "Email sending isn't connected yet"
      : !fromAddress
        ? "No sending address set — add one on the Integrations page"
        : "No valid email address";
    await sb.from("messages").update({ status: "failed", error }).eq("id", m.id);
    return "failed";
  }
  try {
    const { data: app } = await sb
      .from("applications")
      .select("dealership_id")
      .eq("id", m.application_id)
      .maybeSingle();
    const { data: store } = app
      ? await sb.from("dealerships").select("name").eq("id", app.dealership_id).maybeSingle()
      : { data: null };
    const { providerMessageId } = await sendLovable({
      fromAddress,
      fromName: settings.email_from_name || store?.name || "Hiring team",
      to: m.to_email,
      subject: m.subject || "(no subject)",
      text: withoutOurUnsubscribe(m.body),
      replyTo: settings.email_reply_to,
      idempotencyKey: `email-${m.id}`,
      label: m.purpose ?? "email",
    });
    await sb
      .from("messages")
      .update({
        status: "sent",
        provider: "lovable",
        from_email: fromAddress,
        provider_message_id: providerMessageId,
        sent_at: sentAt,
      })
      .eq("id", m.id);
    return "sent";
  } catch (e) {
    // Unsubscribed through Lovable's own link: record it here too, for the whole group.
    if (e instanceof EmailSendError && e.suppressed) {
      await applyEmailOptOut(sb, m.org_id, m.to_email, "lovable_suppression");
      await sb
        .from("messages")
        .update({ status: "blocked", provider: "lovable", error: e.message })
        .eq("id", m.id);
      return "blocked";
    }
    await sb
      .from("messages")
      .update({ status: "failed", provider: "lovable", error: (e as Error).message })
      .eq("id", m.id);
    return "failed";
  }
}
