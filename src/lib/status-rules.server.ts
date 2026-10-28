/**
 * Applies the group's status rules (status-rules.ts) from the scheduled job. Each move
 * is logged to the timeline like any other stage change. The applicant is only emailed
 * when the rule says so (off by default), through emailApplicant. Safe to run
 * repeatedly: a moved applicant no longer matches the rule that moved them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chunk, fetchAll } from "@/lib/fetch-all";
import type { AppStatus } from "@/lib/jobs";
import { STATUS_EVENT_KIND, statusEventRows, statusFromEventMessage } from "@/lib/status-log";
import {
  dueRule,
  ruleEventMessage,
  stageSince,
  statusRulesSchema,
  type RuleMsg,
  type StatusRule,
} from "@/lib/status-rules";

type DB = SupabaseClient<Database>;

type App = {
  id: string;
  org_id: string;
  full_name: string;
  status: string;
  created_at: string;
  knockout_failed: boolean | null;
};
export type PlannedMove = { app: App; rule: StatusRule };

/** The rules saved for a group (an unreadable list counts as none). */
export function rulesFrom(automations: unknown): StatusRule[] {
  const raw = (automations as { statusRules?: unknown } | null)?.statusRules;
  const r = statusRulesSchema.safeParse(raw ?? []);
  return r.success ? r.data : [];
}

/** Who each rule would move right now. `ignoreEnabledAt` is for previews of rules not yet on. */
export async function planMoves(
  admin: DB,
  input: { orgId: string; rules: StatusRule[]; now: number; ignoreEnabledAt?: boolean },
): Promise<PlannedMove[]> {
  const rules = input.rules.filter((r) => r.enabled || input.ignoreEnabledAt);
  if (!rules.length) return [];
  const stages = [...new Set(rules.flatMap((r) => r.from))];
  const apps = await fetchAll<App>((f, t) =>
    admin
      .from("applications")
      .select("id, org_id, full_name, status, created_at, knockout_failed")
      .eq("org_id", input.orgId)
      .in("status", stages as AppStatus[])
      .order("created_at")
      .range(f, t),
  );
  if (!apps.length) return [];
  const ids = apps.map((a) => a.id);
  const events = new Map<string, { created_at: string; to: string | null }[]>();
  const msgs = new Map<string, RuleMsg[]>();
  const needMsgs = rules.some((r) => r.trigger === "no_reply");
  for (const part of chunk(ids)) {
    const ev = await fetchAll<{ application_id: string; created_at: string; message: string }>(
      (f, t) =>
        admin
          .from("application_events")
          .select("application_id, created_at, message")
          .eq("kind", STATUS_EVENT_KIND)
          .in("application_id", part)
          .range(f, t),
    );
    for (const e of ev)
      events.set(e.application_id, [
        ...(events.get(e.application_id) ?? []),
        { created_at: e.created_at, to: statusFromEventMessage(e.message) },
      ]);
    if (!needMsgs) continue;
    const ms = await fetchAll<RuleMsg & { application_id: string }>((f, t) =>
      admin
        .from("messages")
        .select("application_id, party, direction, status, created_at, channel")
        .eq("party", "candidate")
        .in("application_id", part)
        .range(f, t),
    );
    for (const m of ms) msgs.set(m.application_id, [...(msgs.get(m.application_id) ?? []), m]);
  }
  const out: PlannedMove[] = [];
  for (const app of apps) {
    const rule = dueRule(rules, {
      app,
      stageSince: stageSince(app, events.get(app.id) ?? []),
      messages: msgs.get(app.id) ?? [],
      now: input.now,
      ignoreEnabledAt: input.ignoreEnabledAt,
    });
    if (rule) out.push({ app, rule });
  }
  return out;
}

/** Scheduled: apply every group's switched-on status rules. Never throws. */
export async function runStatusRules(admin: DB, opts: { now?: number } = {}) {
  const now = opts.now ?? Date.now();
  const result = { moved: 0, emailed: 0, errors: 0 };
  let settings: { org_id: string; automations: unknown }[] = [];
  try {
    settings = await fetchAll((f, t) =>
      admin.from("messaging_settings").select("org_id, automations").range(f, t),
    );
  } catch (e) {
    console.error("status rules: settings failed", e);
    result.errors++;
    return result;
  }
  for (const s of settings) {
    const rules = rulesFrom(s.automations).filter((r) => r.enabled);
    if (!rules.length) continue;
    try {
      for (const move of await planMoves(admin, { orgId: s.org_id, rules, now })) {
        try {
          if (!(await applyMove(admin, move))) continue;
          result.moved++;
          if (move.rule.emailApplicant && (await emailFor(admin, move))) result.emailed++;
        } catch (e) {
          result.errors++;
          console.error("status rule move failed", move.app.id, e);
        }
      }
    } catch (e) {
      result.errors++;
      console.error("status rules failed for group", s.org_id, e);
    }
  }
  return result;
}

async function applyMove(admin: DB, { app, rule }: PlannedMove) {
  // Only move them if nobody changed the stage since we looked.
  const { data, error } = await admin
    .from("applications")
    .update({ status: rule.to })
    .eq("id", app.id)
    .eq("status", app.status as AppStatus)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return false;
  await admin.from("application_events").insert([
    ...statusEventRows(app.org_id, [app.id], rule.to),
    {
      org_id: app.org_id,
      application_id: app.id,
      kind: "automation",
      message: ruleEventMessage(rule),
    },
  ]);
  return true;
}

async function emailFor(admin: DB, { app, rule }: PlannedMove) {
  const { emailApplicant } = await import("@/lib/email/applicant.server");
  const row = await emailApplicant(
    admin,
    app.id,
    rule.to === "interview"
      ? { kind: "interview", startsAt: null }
      : { kind: "status", status: rule.to },
  );
  return !!row;
}
