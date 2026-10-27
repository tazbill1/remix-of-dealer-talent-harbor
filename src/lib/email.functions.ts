import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sendSchema = z.object({
  orgId: z.string().uuid(),
  applicationIds: z.array(z.string().uuid()).min(1).max(2000),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  templateId: z.string().uuid().nullable().optional(),
});

/**
 * Email one applicant or many. Only applicants the signed-in person can see are
 * included (checked with their own login). Each address gets one email, merge fields
 * are filled in per person, and unsubscribed addresses are skipped.
 */
export const sendEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof sendSchema>) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chunk } = await import("@/lib/fetch-all");
    const { mergeValues, normalizeEmail, renderTemplate } = await import("@/lib/email/core");
    const { appBaseUrl } = await import("@/lib/email/provider.server");
    const { queueEmail, loadEmailSettings } = await import("@/lib/email/outbox.server");
    const { deliverDue } = await import("@/lib/messaging/outbox.server");

    // Visibility check with the user's own login (RLS limits this to their stores).
    type A = {
      id: string;
      org_id: string;
      full_name: string;
      email: string;
      job_id: string;
      dealership_id: string;
    };
    const apps: A[] = [];
    for (const ids of chunk(data.applicationIds)) {
      const { data: rows, error } = await context.supabase
        .from("applications")
        .select("id, org_id, full_name, email, job_id, dealership_id")
        .in("id", ids)
        .eq("org_id", data.orgId);
      if (error) throw new Error(error.message);
      apps.push(...(rows ?? []));
    }
    if (!apps.length) throw new Error("None of those applicants are available to you.");

    const [{ data: jobs }, { data: stores }] = await Promise.all([
      supabaseAdmin
        .from("jobs")
        .select("id, title")
        .in("id", [...new Set(apps.map((a) => a.job_id))]),
      supabaseAdmin
        .from("dealerships")
        .select("id, name")
        .in("id", [...new Set(apps.map((a) => a.dealership_id))]),
    ]);
    const title = new Map((jobs ?? []).map((j) => [j.id, j.title]));
    const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));

    // One email per address (a candidate can have several applications).
    const seen = new Set<string>();
    const recipients = apps.filter((a) => {
      const e = normalizeEmail(a.email);
      if (!e) return true; // still logged, as "No valid email address"
      if (seen.has(e)) return false;
      seen.add(e);
      return true;
    });
    const duplicates = apps.length - recipients.length;

    const bulk = recipients.length > 1;
    const { loadEmailSettings: settingsFor } = await import("@/lib/email/outbox.server");
    if (bulk && (await settingsFor(supabaseAdmin, data.orgId)).email_mode === "live")
      throw new Error(
        "Email blasts need a bulk email service (Resend or Amazon SES), which isn't set up yet. Email applicants one at a time from their profile for now.",
      );
    let campaignId: string | null = null;
    if (bulk) {
      const { data: c, error } = await supabaseAdmin
        .from("email_campaigns")
        .insert({
          org_id: data.orgId,
          created_by: context.userId,
          template_id: data.templateId ?? null,
          subject: data.subject,
          body: data.body,
          recipient_count: recipients.length,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      campaignId = c.id;
    }

    const baseUrl = appBaseUrl(getRequest());
    const queued: string[] = [];
    let blocked = 0;
    for (const a of recipients) {
      const values = mergeValues({
        full_name: a.full_name,
        job_title: title.get(a.job_id) ?? null,
        store_name: storeName.get(a.dealership_id) ?? null,
      });
      const row = await queueEmail(supabaseAdmin, {
        applicationId: a.id,
        subject: renderTemplate(data.subject, values),
        body: renderTemplate(data.body, values),
        purpose: bulk ? "bulk_email" : "email",
        baseUrl,
        campaignId,
      });
      if (row?.status === "queued") queued.push(row.id);
      else blocked++;
    }
    if (campaignId)
      await supabaseAdmin
        .from("email_campaigns")
        .update({ queued_count: queued.length, skipped_count: blocked + duplicates })
        .eq("id", campaignId);
    for (const ids of chunk(queued)) await deliverDue(supabaseAdmin, { ids, limit: ids.length });

    const settings = await loadEmailSettings(supabaseAdmin, data.orgId);
    return { sent: queued.length, blocked, duplicates, mode: settings.email_mode };
  });

/** What's connected, for the Integrations page. Never returns secret values. */
export const integrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [member, admin] = await Promise.all([
      context.supabase.rpc("is_org_member", { _org: data.orgId, _uid: context.userId }),
      context.supabase.rpc("is_platform_admin", { _uid: context.userId }),
    ]);
    if (!member.data && !admin.data) throw new Error("Not a member of this group.");
    const has = (k: string) => !!process.env[k];
    const { data: ms } = await context.supabase
      .from("messaging_settings")
      .select("email_from_address")
      .eq("org_id", data.orgId)
      .maybeSingle();
    return {
      twilio: has("TWILIO_ACCOUNT_SID") && has("TWILIO_AUTH_TOKEN"),
      email: has("LOVABLE_API_KEY"),
      emailFrom: ms?.email_from_address ?? null,
      anthropic: has("ANTHROPIC_API_KEY"),
      publicUrl: has("PUBLIC_APP_URL"),
    };
  });

/** Public: the unsubscribe page. Records the opt-out for the whole dealer group. */
export const unsubscribe = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; confirm: boolean }) =>
    z.object({ token: z.string().min(10).max(600), confirm: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readUnsubscribeToken } = await import("@/lib/email/provider.server");
    const { applyEmailOptOut } = await import("@/lib/email/unsubscribe.server");
    const t = await readUnsubscribeToken(data.token);
    if (!t) return { ok: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", t.orgId)
      .maybeSingle();
    if (data.confirm) await applyEmailOptOut(supabaseAdmin, t.orgId, t.email, "unsubscribe_page");
    return {
      ok: true as const,
      orgName: org?.name ?? "this dealer group",
      email: t.email,
      done: data.confirm,
    };
  });

const notifySchema = z.object({
  orgId: z.string().uuid(),
  applicationIds: z.array(z.string().uuid()).min(1).max(500),
  event: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("interview"), startsAt: z.string().datetime().nullable() }),
    z.object({ kind: z.literal("status"), status: z.enum(["new", "screening", "interview", "offer", "hired", "rejected"]) }),
  ]),
});

/** Automatic applicant email after a stage change or interview booked in the app. */
export const notifyApplicants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof notifySchema>) => notifySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("applications")
      .select("id")
      .in("id", data.applicationIds)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emailApplicant } = await import("@/lib/email/applicant.server");
    // Moving to Interview without a time still sends the invite.
    const event =
      data.event.kind === "status" && data.event.status === "interview"
        ? ({ kind: "interview", startsAt: null } as const)
        : data.event;
    let sent = 0;
    for (const r of rows ?? []) if (await emailApplicant(supabaseAdmin, r.id, event)) sent++;
    return { sent };
  });
