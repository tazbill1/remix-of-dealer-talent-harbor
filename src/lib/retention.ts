import { RETENTION_MARKS } from "@/lib/analytics";

const DAY = 24 * 3600e3;
export const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dateOnly = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

/** The 30/60/90 dates for a hire, counted from the start date (or hire date). */
export function checkinSchedule(
  startDate: string | null,
  hiredAt: string | null,
  marks: readonly number[] = RETENTION_MARKS,
) {
  const base = startDate ? dateOnly(startDate) : hiredAt ? dateOnly(hiredAt) : null;
  if (base === null) return [];
  return marks.map((mark) => ({ mark, due: ymd(base + mark * DAY) }));
}

/**
 * When a check-in says the hire is gone, record the departure no later than the day before
 * that mark, so they don't count as retained at it.
 */
export function departureFromCheckin(due: string, today = ymd(Date.now())) {
  const dayBefore = ymd(dateOnly(due) - DAY);
  return today < dayBefore ? today : dayBefore;
}
