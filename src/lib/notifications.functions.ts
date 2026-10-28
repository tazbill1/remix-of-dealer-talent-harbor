import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string; claims: { email?: string } };

/** Emails a sample "wants a person" alert to the signed-in person only. No texts. */
export const previewHumanAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: ok } = await ctx.supabase.rpc("can_post_jobs", { _org: data.orgId, _uid: ctx.userId });
    if (!ok) throw new Error("Only HR and group admins can send a preview.");
    const to = ctx.claims?.email;
    if (!to) throw new Error("Your login has no email address.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { appBaseUrl } = await import("@/lib/email/provider.server");
    const { loadEmailSettings } = await import("@/lib/email/outbox.server");
    const { sendStaffEmail } = await import("@/lib/weekly-summary.server");
    const { wantsPersonMessage } = await import("@/lib/notifications");
    const appUrl = appBaseUrl(getRequest());
    const message = wantsPersonMessage("Jordan Sample", "Your Store");
    const out = await sendStaffEmail(supabaseAdmin, await loadEmailSettings(supabaseAdmin, data.orgId), {
      orgId: data.orgId, to, subject: `[Preview] ${message}`, footerName: "hireme by WerkandMe", appUrl,
      body: `${message}\n\nOpen the applicant: ${appUrl}/applicants\n\nThis is a preview. No texts were sent.`,
      key: `wants-person-preview-${ctx.userId}-${Date.now()}`,
    });
    return { to, status: out.status, error: out.error };
  });
