/** Status reminder rules (mirrors run_status_reminders in the database). Pure, tested. */
import { STATUSES, STATUS_LABEL, type AppStatus } from "@/lib/jobs";

/** Final stages: the database refuses reminder rules for these. */
export const NEVER_REMINDED: readonly AppStatus[] = ["hired", "rejected", "do_not_hire", "unqualified"];
export const REMINDABLE: AppStatus[] = STATUSES.filter((s) => !NEVER_REMINDED.includes(s));

export type ReminderRule = { status: string; remind_after_days: number; is_active: boolean };
export type Overdue = { days: number; label: string };

const DAY = 86_400_000;

/** Whole days since the status last changed. */
export const daysInStatus = (changedAt: string, now: number = Date.now()) =>
  Math.max(0, Math.floor((now - new Date(changedAt).getTime()) / DAY));

/** Overdue when an active rule exists for the stage and the wait has reached its limit. */
export function overdueInfo(
  app: { status: AppStatus; status_changed_at: string | null },
  rules: ReminderRule[],
  now: number = Date.now(),
): Overdue | null {
  if (!app.status_changed_at || NEVER_REMINDED.includes(app.status)) return null;
  const rule = rules.find((r) => r.status === app.status && r.is_active);
  if (!rule) return null;
  const days = daysInStatus(app.status_changed_at, now);
  if (days < rule.remind_after_days) return null;
  return { days, label: `In ${STATUS_LABEL[app.status]} ${days} day${days === 1 ? "" : "s"}` };
}
