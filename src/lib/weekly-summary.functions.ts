import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

/** Group admins: email yourself this week's summary now, to check it before turning it on. */
export const previewWeeklySummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const [a, p] = await Promise.all([
      ctx.supabase.rpc("has_org_role", {
        _org: data.orgId,
        _uid: ctx.userId,
        _role: "group_admin",
      }),
      ctx.supabase.rpc("is_platform_admin", { _uid: ctx.userId }),
    ]);
    if (!a.data && !p.data) throw new Error("Only group admins can send a preview.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { appBaseUrl } = await import("@/lib/email/provider.server");
    const { sendPreview } = await import("@/lib/weekly-summary.server");
    return sendPreview(supabaseAdmin, {
      orgId: data.orgId,
      userId: ctx.userId,
      appUrl: appBaseUrl(getRequest()),
    });
  });
