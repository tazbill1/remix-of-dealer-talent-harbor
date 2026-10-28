import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { statusRuleSchema, statusRulesSchema } from "@/lib/status-rules";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

/** Recruiting/HR (the people who can post jobs) own the status rules. */
async function access(ctx: Ctx, orgId: string) {
  const [m, p, post] = await Promise.all([
    ctx.supabase.rpc("is_org_member", { _org: orgId, _uid: ctx.userId }),
    ctx.supabase.rpc("is_platform_admin", { _uid: ctx.userId }),
    ctx.supabase.rpc("can_post_jobs", { _org: orgId, _uid: ctx.userId }),
  ]);
  return { member: !!m.data || !!p.data, canEdit: !!post.data || !!p.data };
}

async function storedAutomations(orgId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db
    .from("messaging_settings")
    .select("automations")
    .eq("org_id", orgId)
    .maybeSingle();
  return { db, automations: (data?.automations ?? {}) as Record<string, unknown> };
}

/** The group's status rules (anyone on the team can view). */
export const getStatusRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await access(context as Ctx, data.orgId);
    if (!a.member) throw new Error("Not a member of this group.");
    const { rulesFrom } = await import("@/lib/status-rules.server");
    const { automations } = await storedAutomations(data.orgId);
    return { canEdit: a.canEdit, rules: rulesFrom(automations) };
  });

/** Recruiting/HR: save the rules. Turning a rule on starts its clock now. */
export const saveStatusRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; rules: unknown }) =>
    z.object({ orgId: z.string().uuid(), rules: statusRulesSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const a = await access(context as Ctx, data.orgId);
    if (!a.canEdit) throw new Error("Only Recruiting/HR and group admins can change status rules.");
    const { ruleProblem, ruleName, stampRules } = await import("@/lib/status-rules");
    for (const r of data.rules) {
      const problem = ruleProblem(r);
      if (problem) throw new Error(`${ruleName(r)}: ${problem}`);
    }
    const { rulesFrom } = await import("@/lib/status-rules.server");
    const { db, automations } = await storedAutomations(data.orgId);
    const rules = stampRules(data.rules, rulesFrom(automations), new Date().toISOString());
    const { error } = await db.from("messaging_settings").upsert(
      {
        org_id: data.orgId,
        automations: { ...automations, statusRules: rules } as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
    if (error) throw new Error(error.message);
    return { rules };
  });

/** Who already fits a rule right now (nothing is moved). */
export const previewStatusRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; rule: unknown }) =>
    z.object({ orgId: z.string().uuid(), rule: statusRuleSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const a = await access(context as Ctx, data.orgId);
    if (!a.member) throw new Error("Not a member of this group.");
    const { ruleProblem } = await import("@/lib/status-rules");
    const problem = ruleProblem(data.rule);
    if (problem) throw new Error(problem);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { planMoves } = await import("@/lib/status-rules.server");
    const moves = await planMoves(db, {
      orgId: data.orgId,
      rules: [{ ...data.rule, enabled: true }],
      now: Date.now(),
      ignoreEnabledAt: true,
    });
    return { count: moves.length, names: moves.slice(0, 8).map((m) => m.app.full_name) };
  });
