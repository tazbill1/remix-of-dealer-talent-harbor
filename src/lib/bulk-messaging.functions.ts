import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizeBulkEligibility } from "@/lib/bulk-messaging";

const selection = z.object({ orgId: z.string().uuid(), applicationIds: z.array(z.string().uuid()).min(1).max(2000), channel: z.enum(["email", "text", "both"]) });
const draft = selection.extend({ subject: z.string().trim().max(200), body: z.string().trim().min(1).max(10000) });

/** Readiness only: no queues, messages, audit rows or delivery calls. */
export const bulkReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof selection>) => selection.parse(d))
  .handler(async ({ data, context }) => {
    const { data: settings, error } = await context.supabase.from("messaging_settings")
      .select("bulk_messaging_enabled, mode, email_mode, send_start, send_end, send_days")
      .eq("org_id", data.orgId).maybeSingle();
    if (error || !settings?.bulk_messaging_enabled) throw new Error("Bulk messaging is disabled.");
    const ids = [...new Set(data.applicationIds)];
    const apps = [];
    for (let i = 0; i < ids.length; i += 100) {
      const result = await context.supabase.from("applications").select("id, dealership_id, job_id")
        .eq("org_id", data.orgId).in("id", ids.slice(i, i + 100));
      if (result.error) throw new Error("Could not check the selected applicants.");
      apps.push(...(result.data ?? []));
    }
    const allowed = new Set<string>();
    for (const storeId of new Set(apps.map((a) => a.dealership_id))) {
      const check = await context.supabase.rpc("can_bulk_message", { _org: data.orgId, _store: storeId, _uid: context.userId });
      if (check.error) throw new Error("Could not check store access.");
      if (check.data) allowed.add(storeId);
    }
    if (!allowed.size) throw new Error("None of those applicants are available to you for messaging.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const byId = new Map(apps.filter((a) => allowed.has(a.dealership_id)).map((a) => [a.id, a]));
    const channels = data.channel === "both" ? ["email", "text"] as const : [data.channel];
    const rows: { email?: string | null; text?: string | null; storeId?: string }[] = [];
    for (let i = 0; i < ids.length; i += 3) {
      rows.push(...await Promise.all(ids.slice(i, i + 3).map(async (id) => {
        const app = byId.get(id);
        const row: { email?: string | null; text?: string | null; storeId?: string } = app ? { storeId: app.dealership_id } : {};
        for (const ch of channels) {
          if (!app) { row[ch] = "Applicant unavailable"; continue; }
          const demo = ch === "email" ? settings.email_mode !== "live" : settings.mode !== "live";
          const check = await supabaseAdmin.rpc("bulk_skip_reason", { _app: id, _channel: ch === "text" ? "sms" : "email", _demo: demo });
          if (check.error) throw new Error("Could not check messaging eligibility.");
          row[ch] = check.data;
          if (ch === "text" && !demo && !row[ch]) {
            const store = await context.supabase.from("dealerships").select("timezone").eq("id", app.dealership_id).eq("org_id", data.orgId).single();
            if (store.error) throw new Error("Could not check texting hours.");
            const window = await supabaseAdmin.rpc("bulk_next_text_time", { _now: new Date().toISOString(), _zone: store.data.timezone, _start: settings.send_start, _end: settings.send_end, _days: settings.send_days });
            if (window.error) throw new Error("Could not check texting hours.");
            if (!window.data) row[ch] = "No texting days are turned on";
          }
        }
        return row;
      })));
    }
    return { ...summarizeBulkEligibility(rows, data.channel), emailDemo: settings.email_mode !== "live", textDemo: settings.mode !== "live" };
  });

/** Self-only preview: uses the same staff-preview delivery helper, never applicant queues. */
export const previewBulkMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof draft>) => draft.parse(d))
  .handler(async ({ data, context }) => {
    const { data: app } = await context.supabase.from("applications").select("id, full_name, job_id, dealership_id")
      .eq("org_id", data.orgId).eq("id", data.applicationIds[0] ?? "").maybeSingle();
    if (!app) throw new Error("Applicant unavailable.");
    const check = await context.supabase.rpc("can_bulk_message", { _org: data.orgId, _store: app.dealership_id, _uid: context.userId });
    const setting = await context.supabase.from("messaging_settings").select("bulk_messaging_enabled").eq("org_id", data.orgId).maybeSingle();
    if (check.error || !check.data || !setting.data?.bulk_messaging_enabled) throw new Error("Bulk messaging is not available.");
    const user = await context.supabase.auth.getUser();
    if (!user.data.user?.email || !user.data.user.email_confirmed_at) throw new Error("Confirm your account email before sending a preview.");
    const [job, store, org] = await Promise.all([
      context.supabase.from("jobs").select("title").eq("org_id", data.orgId).eq("id", app.job_id).single(),
      context.supabase.from("dealerships").select("name").eq("org_id", data.orgId).eq("id", app.dealership_id).single(),
      context.supabase.from("organizations").select("name").eq("id", data.orgId).single(),
    ]);
    if (job.error || store.error || org.error) throw new Error("Could not prepare a preview.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadEmailSettings } = await import("@/lib/email/outbox.server");
    const { sendStaffEmail } = await import("@/lib/weekly-summary.server");
    const { appBaseUrl } = await import("@/lib/email/provider.server");
    const render = async (text: string) => {
      const out = await supabaseAdmin.rpc("bulk_render", { _text: text, _name: app.full_name, _job: job.data.title, _store: store.data.name });
      if (out.error) throw new Error("Could not prepare a preview.");
      return out.data;
    };
    const result = await sendStaffEmail(supabaseAdmin, await loadEmailSettings(supabaseAdmin, data.orgId), {
      orgId: data.orgId, to: user.data.user.email,
      subject: `[Preview] ${data.channel === "text" ? "Text message" : await render(data.subject)}`,
      body: await render(data.body), footerName: org.data.name, appUrl: appBaseUrl(getRequest()), key: `bulk-preview:${context.userId}:${crypto.randomUUID()}`,
    });
    return { status: result.status, error: result.error, to: user.data.user.email };
  });