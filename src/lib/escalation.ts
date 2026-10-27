import type { AppStatus } from "@/lib/jobs";

/**
 * Escalation: a candidate nobody has touched for 3 business days is released to the
 * group's open pool (open_to_other_stores), so other stores' managers and the recruiter
 * can pick them up. "Touched" means any timeline event or text after they applied.
 */
export const ESCALATION_BUSINESS_DAYS = 3;
export const ESCALATION_EVENT_KIND = "escalation";
/** Only early stages escalate: once someone is interviewing, a person owns them. */
export const ESCALATING_STAGES: AppStatus[] = ["new", "screening"];

/** Business days are counted in US Central time, where the client's stores are. */
const TZ = "America/Chicago";
const DAY = 24 * 3600e3;

function localDay(ms: number) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}
const isWeekend = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

/**
 * Full business days (Mon-Fri) that have passed since `since`, not counting the day it
 * happened. Something touched Friday afternoon is 1 business day idle on Monday evening
 * and 3 on Wednesday evening.
 */
export function businessDaysSince(since: number, now: number) {
  let count = 0;
  const start = localDay(since);
  const today = localDay(now);
  // Walk forward a calendar day at a time from the day after `since` through today.
  for (let ms = Date.parse(`${start}T12:00:00Z`) + DAY; ; ms += DAY) {
    const ymd = new Date(ms).toISOString().slice(0, 10);
    if (ymd > today) break;
    if (!isWeekend(ymd)) count++;
  }
  return count;
}

export type EscApp = {
  id: string;
  status: AppStatus;
  created_at: string;
  open_to_other_stores: boolean;
};
export type Touch = { application_id: string; created_at: string; kind?: string };

export type Stalled = { id: string; lastActivity: number; idleBusinessDays: number };

/** Applications that should be (or have been) escalated, most idle first. */
export function findStalled(
  apps: EscApp[],
  touches: Touch[],
  now: number,
  threshold = ESCALATION_BUSINESS_DAYS,
) {
  const last = new Map<string, number>();
  const escalated = new Set<string>();
  for (const t of touches) {
    const at = Date.parse(t.created_at);
    if (t.kind === ESCALATION_EVENT_KIND) escalated.add(t.application_id);
    else if (at > (last.get(t.application_id) ?? 0)) last.set(t.application_id, at);
  }
  const stalled: Stalled[] = [];
  for (const a of apps) {
    if (!ESCALATING_STAGES.includes(a.status)) continue;
    if (a.open_to_other_stores || escalated.has(a.id)) continue;
    const lastActivity = Math.max(Date.parse(a.created_at), last.get(a.id) ?? 0);
    const idle = businessDaysSince(lastActivity, now);
    if (idle >= threshold) stalled.push({ id: a.id, lastActivity, idleBusinessDays: idle });
  }
  return stalled.sort((x, y) => x.lastActivity - y.lastActivity);
}

export function escalationEventRow(orgId: string, applicationId: string, idleDays: number) {
  return {
    org_id: orgId,
    application_id: applicationId,
    kind: ESCALATION_EVENT_KIND,
    message: `Untouched for ${idleDays} business days. Released to the open pool so other stores and Recruiting can pick them up.`,
  };
}
