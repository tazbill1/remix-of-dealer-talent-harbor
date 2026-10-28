import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { interviewInviteKey, interviewRecipient } from "@/lib/interview-invite";
import { storeInterviewers } from "@/lib/member-calendars.functions";
import { interviewInviteToken } from "@/lib/interview-invite-token.server";
import { appBaseUrl } from "@/lib/email/provider.server";
import { isEmailOptedOut, loadEmailSettings } from "@/lib/email/outbox.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { slotLabel } from "@/lib/booking";

type DB = SupabaseClient<Database>;

/** One persisted booking event → one recipient. Email failure never undoes a booking. */
export async function emailInterviewStaff(db: DB, interviewId: string, moved = false) {
  try {
    const { data: iv, error } = await db.from("interviews").select("*").eq("id", interviewId).maybeSingle();
    if (error || !iv || iv.status !== "scheduled") return { status: "skipped" as const };
    const { data: app } = await db.from("applications").select("id, org_id, full_name, job_id, dealership_id, needs_attention").eq("id", iv.application_id).eq("org_id", iv.org_id).maybeSingle();
    if (!app) return { status: "skipped" as const };
    const people = await storeInterviewers(db, iv.org_id, app.dealership_id);
    const recipient = interviewRecipient(people);
    if (!recipient) {
      const note = "Interview invite needs a recipient: assign one store interviewer with an email address on Team.";
      if (!app.needs_attention) await db.from("applications").update({ needs_attention: note }).eq("id", app.id).is("needs_attention", null);
      return { status: "skipped" as const, note };
    }
    const key = interviewInviteKey(iv.id, iv.starts_at, recipient.id);
    const { data: duplicate } = await db.from("messages").select("id").eq("application_id", app.id).eq("purpose", key).in("status", ["sent", "simulated", "blocked"]).limit(1);
    if (duplicate?.length) return { status: "skipped" as const };
    const [{ data: store }, { data: job }, settings] = await Promise.all([
      db.from("dealerships").select("name, address, city, state, timezone").eq("id", app.dealership_id).eq("org_id", iv.org_id).maybeSingle(),
      db.from("jobs").select("title").eq("id", app.job_id).eq("org_id", iv.org_id).maybeSingle(),
      loadEmailSettings(db, iv.org_id),
    ]);
    const base = appBaseUrl();
    if (!base.startsWith("https://")) throw new Error("Public app address is not configured");
    const subject = `${moved ? "Interview moved" : "Interview booked"}: ${app.full_name}`;
    const location = iv.location || [store?.name, store?.address, store?.city, store?.state].filter(Boolean).join(", ");
    const when = slotLabel(Date.parse(iv.starts_at), store?.timezone || "America/Chicago");
    const calendarUrl = `${base}/api/public/interview-invite/${interviewInviteToken(iv.id, recipient.id, iv.starts_at)}.ics`;
    let status: "sent" | "simulated" | "blocked" | "failed" = "simulated";
    let failure: string | null = null;
    if (await isEmailOptedOut(db, iv.org_id, recipient.email)) status = "blocked";
    else if (settings.email_mode === "live") {
      try {
        if (!settings.email_from_address) throw new Error("No sending address configured");
        const result = await sendTemplateEmail("staff-interview", recipient.email, {
          idempotencyKey: key,
          fromAddress: settings.email_from_address,
          replyTo: settings.email_reply_to ?? undefined,
          templateData: { applicant: app.full_name, job: job?.title, store: store?.name, when, minutes: iv.duration_min, location, calendarUrl, appUrl: base, moved },
        });
        status = result.sent ? "sent" : "blocked";
      } catch (e) { status = "failed"; failure = (e as Error).message; }
    }
    // Audit only: synchronous managed delivery, no email queue or scheduler.
    await db.from("messages").insert({ org_id: iv.org_id, application_id: app.id, channel: "email", party: "manager", direction: "out", purpose: key, to_email: recipient.email, subject, body: `${subject}\n${when} · ${iv.duration_min} minutes\n${location}\nAdd to calendar: ${calendarUrl}`, status, provider: status === "simulated" ? "practice" : "lovable", error: failure, sent_at: ["sent", "simulated"].includes(status) ? new Date().toISOString() : null });
    return { status, note: failure ?? (status === "blocked" ? "Staff email was not sent because this address unsubscribed." : undefined) };
  } catch (e) {
    console.error("staff interview email failed", interviewId, e);
    return { status: "failed" as const, note: "Interview saved, but the staff invite could not be emailed." };
  }
}