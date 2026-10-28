import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { automationsSchema } from "@/lib/automations";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

/** Current automatic text settings (anyone on the team can view). */
export const getAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const [m, p, a] = await Promise.all([
      ctx.supabase.rpc("is_org_member", { _org: data.orgId, _uid: ctx.userId }),
      ctx.supabase.rpc("is_platform_admin", { _uid: ctx.userId }),
      ctx.supabase.rpc("has_org_role", { _org: data.orgId, _uid: ctx.userId, _role: "group_admin" }),
    ]);
    if (!m.data && !p.data) throw new Error("Not a member of this group.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { loadSettings } = await import("@/lib/messaging/outbox.server");
    const { parseAutomations } = await import("@/lib/automations");
    const s = await loadSettings(db, data.orgId);
    return {
      canEdit: !!a.data || !!p.data,
      automations: parseAutomations(s.automations),
      nudgeHours: s.nudge_after_hours,
      escalateHours: s.escalate_after_hours,
    };
  });

/** Group admins: save wording, on/off and timing. */
export const saveAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; automations: unknown; nudgeHours: number; escalateHours: number }) =>
    z
      .object({
        orgId: z.string().uuid(),
        automations: automationsSchema,
        nudgeHours: z.number().int().min(1).max(168),
        escalateHours: z.number().int().min(1).max(336),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const [a, p] = await Promise.all([
      ctx.supabase.rpc("has_org_role", { _org: data.orgId, _uid: ctx.userId, _role: "group_admin" }),
      ctx.supabase.rpc("is_platform_admin", { _uid: ctx.userId }),
    ]);
    if (!a.data && !p.data) throw new Error("Only group admins can change automatic texts.");
    if (data.escalateHours <= data.nudgeHours)
      throw new Error("The escalation should come after the nudge. Make its hours bigger.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    // Drop wording that matches the default, so future default improvements still apply.
    const { AUTOMATIONS } = await import("@/lib/automations");
    const texts: Record<string, { enabled?: boolean | undefined; text?: string | undefined; hours?: number | undefined }> = {};
    for (const [k, v] of Object.entries(data.automations.texts)) {
      const def = AUTOMATIONS[k as keyof typeof AUTOMATIONS];
      if (!def) continue;
      const entry = { ...v };
      if (!entry.text || entry.text.trim() === def.text) delete entry.text;
      if (entry.enabled !== false) delete entry.enabled;
      if (entry.hours === undefined || ("timing" in def && entry.hours === def.timing.default)) delete entry.hours;
      if (Object.keys(entry).length) texts[k] = entry;
    }
    const { error } = await db.from("messaging_settings").upsert(
      {
        org_id: data.orgId,
        automations: { ...data.automations, texts },
        nudge_after_hours: data.nudgeHours,
        escalate_after_hours: data.escalateHours,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
