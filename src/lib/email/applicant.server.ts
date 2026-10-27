/**
 * Automatic applicant emails. Builds the email, skips it if already sent for that
 * event, queues it through queueEmail (footer, unsubscribe, opt-outs) and delivers it
 * right away. Never throws: an email problem must not break applying or moving stages.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { applicantEmail, applicantEmailPurpose, type ApplicantEmailKind } from "@/lib/email/applicant-copy";
import { appBaseUrl } from "@/lib/email/provider.server";
import { queueEmail } from "@/lib/email/outbox.server";

type DB = SupabaseClient<Database>;

export async function emailApplicant(sb: DB, applicationId: string, e: ApplicantEmailKind) {
  try {
    const purpose = applicantEmailPurpose(e);
    const { data: dup } = await sb
      .from("messages")
      .select("id")
      .eq("application_id", applicationId)
      .eq("channel", "email")
      .eq("purpose", purpose)
      .limit(1);
    if (dup?.length) return null;
    const { data: app } = await sb
      .from("applications")
      .select("id, full_name, job_id, dealership_id, status_token")
      .eq("id", applicationId)
      .maybeSingle();
    if (!app) return null;
    const [{ data: job }, { data: store }] = await Promise.all([
      sb.from("jobs").select("title").eq("id", app.job_id).maybeSingle(),
      sb.from("dealerships").select("name, assistant_name, timezone").eq("id", app.dealership_id).maybeSingle(),
    ]);
    const baseUrl = appBaseUrl();
    const content = applicantEmail(e, {
      first: app.full_name.trim().split(/\s+/)[0] || "there",
      job: job?.title ?? "the role",
      store: store?.name ?? "our team",
      assistant: store?.assistant_name ?? "Penny",
      statusUrl: `${baseUrl}/status/${app.status_token}`,
      timezone: store?.timezone || "America/Chicago",
    });
    if (!content) return null;
    const row = await queueEmail(sb, { applicationId, ...content, purpose, baseUrl });
    if (row?.status === "queued") {
      const { deliverDue } = await import("@/lib/messaging/outbox.server");
      await deliverDue(sb, { ids: [row.id] });
    }
    return row;
  } catch (err) {
    console.error("applicant email failed", applicationId, err);
    return null;
  }
}
