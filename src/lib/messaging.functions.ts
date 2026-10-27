import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ orgId: z.string().uuid(), apply: z.boolean() });

/**
 * Going live: candidates already sitting in Screening would all get a manager summary
 * on the next run. This counts them, and (with apply) marks their summary as skipped so
 * managers only hear about candidates who reach Screening from now on.
 */
export const screeningBacklog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof input>) => input.parse(d))
  .handler(async ({ data, context }) => {
    const [admin, platform] = await Promise.all([
      context.supabase.rpc("has_org_role", {
        _org: data.orgId,
        _uid: context.userId,
        _role: "group_admin",
      }),
      context.supabase.rpc("is_platform_admin", { _uid: context.userId }),
    ]);
    if (!admin.data && !platform.data) throw new Error("Only group admins can change texting mode.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chunk, fetchAll } = await import("@/lib/fetch-all");
    const { PURPOSE } = await import("@/lib/workflows/rules");
    const apps = await fetchAll<{ id: string }>((f, t) =>
      supabaseAdmin
        .from("applications")
        .select("id")
        .eq("org_id", data.orgId)
        .eq("status", "screening")
        .range(f, t),
    );
    const summarized = new Set<string>();
    for (const ids of chunk(apps.map((a) => a.id))) {
      const { data: rows } = await supabaseAdmin
        .from("messages")
        .select("application_id")
        .in("application_id", ids)
        .eq("purpose", PURPOSE.summary);
      rows?.forEach((r) => summarized.add(r.application_id));
    }
    const waiting = apps.filter((a) => !summarized.has(a.id));
    if (data.apply && waiting.length) {
      for (const part of chunk(waiting, 500))
        await supabaseAdmin.from("messages").insert(
          part.map((a) => ({
            org_id: data.orgId,
            application_id: a.id,
            party: "manager",
            direction: "out",
            channel: "sms",
            body: "(Manager summary skipped when texting went live)",
            purpose: PURPOSE.summary,
            status: "blocked",
            error: "Skipped when texting went live",
          })),
        );
    }
    return { waiting: waiting.length, skipped: data.apply ? waiting.length : 0 };
  });
