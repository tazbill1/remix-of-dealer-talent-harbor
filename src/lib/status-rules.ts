/**
 * Status rules Recruiting/HR set up themselves: "when X happens, move the applicant to
 * Y", e.g. "no reply for 5 days → Not selected". Plain functions over rows so every rule
 * is testable; the scheduled job (status-rules.server.ts) applies the moves. Rules are
 * saved in messaging_settings.automations.statusRules, so no schema change is needed.
 *
 * A rule's clock starts when it's turned on (unless "include applicants already
 * waiting" is ticked), so turning a rule on never moves a backlog all at once.
 */
import { z } from "zod";
import { STATUS_LABEL, type AppStatus } from "@/lib/jobs";

const DAY = 24 * 3600e3;

export const RULE_TRIGGERS = {
  no_reply: {
    label: "Candidate hasn't replied",
    help: "Days since the last text to the candidate, with no reply from them.",
  },
  no_change: {
    label: "No change in stage",
    help: "Days the applicant has sat in the same stage.",
  },
  knockout: {
    label: "Didn't meet a screening requirement",
    help: "They answered a screening (knockout) question in a way the job doesn't allow.",
  },
} as const;
export type RuleTrigger = keyof typeof RULE_TRIGGERS;
export const TRIGGER_KEYS = Object.keys(RULE_TRIGGERS) as RuleTrigger[];

/** Stages a rule can move people out of (decided stages are left alone). */
export const FROM_STAGES = [
  "new",
  "screening",
  "interview",
  "offer",
] as const satisfies readonly AppStatus[];
/** Stages a rule can move people to. Hiring always needs a person. */
export const TO_STAGES = [
  "screening",
  "interview",
  "offer",
  "rejected",
] as const satisfies readonly AppStatus[];

export const MAX_RULES = 20;
export const MAX_DAYS = 90;

export const statusRuleSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().max(80).optional(),
  enabled: z.boolean(),
  /** Set by the server when the rule is turned on; the clock starts here. */
  enabledAt: z.string().optional(),
  trigger: z.enum(["no_reply", "no_change", "knockout"]),
  days: z.number().int().min(0).max(MAX_DAYS),
  from: z.array(z.enum(FROM_STAGES)).min(1).max(FROM_STAGES.length),
  to: z.enum(TO_STAGES),
  includeExisting: z.boolean().optional(),
  emailApplicant: z.boolean().optional(),
});
export type StatusRule = z.infer<typeof statusRuleSchema>;
export const statusRulesSchema = z.array(statusRuleSchema).max(MAX_RULES);

/** Smallest wait for each trigger (a knockout can act right away). */
export const minDays = (t: RuleTrigger) => (t === "knockout" ? 0 : 1);

/** A new rule starts off, with a sensible example filled in. */
export function newRule(id: string, trigger: RuleTrigger = "no_reply"): StatusRule {
  const base = { id, enabled: false, includeExisting: false, emailApplicant: false };
  if (trigger === "knockout")
    return { ...base, trigger, days: 0, from: ["new", "screening"], to: "rejected" };
  if (trigger === "no_change") return { ...base, trigger, days: 14, from: ["new"], to: "rejected" };
  return { ...base, trigger, days: 5, from: ["new", "screening"], to: "rejected" };
}

/** Problems that stop a rule from saving, in plain words. */
export function ruleProblem(r: StatusRule): string | null {
  if (!r.from.length) return "Pick at least one stage it applies to.";
  if (r.from.includes(r.to as never))
    return `It can't move people from ${STATUS_LABEL[r.to]} to ${STATUS_LABEL[r.to]}.`;
  if (r.days < minDays(r.trigger)) return "Pick at least 1 day.";
  return null;
}

const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const stages = (s: readonly AppStatus[]) => s.map((x) => STATUS_LABEL[x]).join(" or ");

/** One-line description, e.g. "No reply for 5 days in New or Screening → Not selected". */
export function describeRule(r: StatusRule) {
  const where = `in ${stages(r.from)}`;
  const to = STATUS_LABEL[r.to];
  if (r.trigger === "no_reply") return `No reply for ${dayWord(r.days)} ${where} → ${to}`;
  if (r.trigger === "no_change") return `${dayWord(r.days)} with no change ${where} → ${to}`;
  return `Didn't meet a screening requirement ${where}${r.days ? `, after ${dayWord(r.days)}` : ""} → ${to}`;
}

export const ruleName = (r: StatusRule) => r.name?.trim() || describeRule(r);

/**
 * Keeps each rule's "turned on" time: stamped when a rule is switched on, kept while it
 * stays on, cleared when it's switched off.
 */
export function stampRules(next: StatusRule[], saved: StatusRule[], nowIso: string): StatusRule[] {
  return next.map((r) => {
    const { enabledAt: _drop, ...rest } = r;
    if (!r.enabled) return rest;
    const before = saved.find((s) => s.id === r.id);
    return { ...rest, enabledAt: before?.enabled && before.enabledAt ? before.enabledAt : nowIso };
  });
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export type RuleMsg = {
  party: string;
  direction: string;
  status: string;
  created_at: string;
  channel?: string | null;
};

export type RuleApp = {
  status: string;
  created_at: string;
  knockout_failed: boolean | null;
};

/**
 * When the clock for this rule started for this applicant, or null if the rule
 * doesn't apply. `stageSince` is when they entered their current stage.
 */
export function ruleClockStart(
  rule: StatusRule,
  input: {
    app: RuleApp;
    stageSince: number;
    messages: RuleMsg[];
    ignoreEnabledAt?: boolean | undefined;
  },
): number | null {
  const { app } = input;
  if (!rule.from.includes(app.status as never) || rule.to === app.status) return null;
  const guard =
    input.ignoreEnabledAt || rule.includeExisting
      ? -Infinity
      : rule.enabledAt
        ? Date.parse(rule.enabledAt)
        : Infinity;
  if (guard === Infinity) return null;
  let start = input.stageSince;
  if (rule.trigger === "knockout") {
    if (!app.knockout_failed) return null;
  } else if (rule.trigger === "no_reply") {
    const texts = input.messages.filter(
      (m) => m.party === "candidate" && (m.channel ?? "sms") !== "email",
    );
    const lastOut = texts
      .filter((m) => m.direction === "out" && m.status !== "blocked" && m.status !== "failed")
      .reduce((max, m) => Math.max(max, Date.parse(m.created_at)), -Infinity);
    if (lastOut === -Infinity) return null; // never texted: there's nothing to reply to
    const replied = texts.some((m) => m.direction === "in" && Date.parse(m.created_at) > lastOut);
    if (replied) return null;
    start = Math.max(start, lastOut);
  }
  return Math.max(start, guard);
}

/** The first rule (in the order HR listed them) that's due for this applicant now. */
export function dueRule(
  rules: StatusRule[],
  input: {
    app: RuleApp;
    stageSince: number;
    messages: RuleMsg[];
    now: number;
    ignoreEnabledAt?: boolean | undefined;
  },
): StatusRule | null {
  for (const rule of rules) {
    if (!rule.enabled && !input.ignoreEnabledAt) continue;
    if (ruleProblem(rule)) continue;
    const start = ruleClockStart(rule, input);
    if (start !== null && input.now - start >= rule.days * DAY) return rule;
  }
  return null;
}

/**
 * When the applicant entered their current stage: the latest logged move to it, or
 * when they applied if no move was logged.
 */
export function stageSince(
  app: { status: string; created_at: string },
  events: { created_at: string; to: string | null }[],
) {
  const moves = events.filter((e) => e.to === app.status).map((e) => Date.parse(e.created_at));
  return moves.length ? Math.max(...moves) : Date.parse(app.created_at);
}

export const ruleEventMessage = (r: StatusRule) =>
  `Moved automatically by status rule: ${ruleName(r)}`;
