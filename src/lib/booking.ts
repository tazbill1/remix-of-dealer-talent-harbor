/**
 * Interview self-scheduling: the open interview times at a store, worked out in the
 * store's own time zone, skipping times already booked. Pure, so it's easy to test.
 */
import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const hoursSchema = z
  .object({
    /** 0 = Sunday … 6 = Saturday */
    days: z.array(z.number().int().min(0).max(6)).max(7),
    start: hhmm,
    end: hhmm,
  })
  .refine((h) => h.start < h.end, { message: "End time must be after start time.", path: ["end"] });
export type InterviewHours = z.infer<typeof hoursSchema>;

export const DEFAULT_HOURS: InterviewHours = { days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" };
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function parseHours(raw: unknown): InterviewHours {
  const r = hoursSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_HOURS;
}

/** The time zone's offset from UTC (ms) at a moment. */
function tzOffset(ts: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(ts / 1000) * 1000;
}

/** A wall-clock time at the store, as a UTC timestamp (handles daylight saving). */
export function zonedTime(y: number, m: number, d: number, hh: number, mm: number, timeZone: string) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - tzOffset(guess, timeZone);
  return guess - tzOffset(first, timeZone);
}

/** The store's calendar date (y, m, d) and weekday for a moment. */
export function zonedDate(ts: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(new Date(ts));
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(v("year")),
    m: Number(v("month")),
    d: Number(v("day")),
    weekday: DAY_NAMES.indexOf(v("weekday") as (typeof DAY_NAMES)[number]),
  };
}

export type Busy = { start: number; end: number };

export function openSlots(a: {
  hours: InterviewHours;
  minutes: number;
  timeZone: string;
  busy: Busy[];
  now: number;
  /** How many calendar days ahead to offer. */
  days?: number;
  /** No slots sooner than this many hours from now. */
  leadHours?: number;
  max?: number;
}) {
  const minutes = Math.min(120, Math.max(10, a.minutes || 30));
  const days = a.days ?? 7;
  const earliest = a.now + (a.leadHours ?? 12) * 3600e3;
  const [sh, sm] = a.hours.start.split(":").map(Number) as [number, number];
  const [eh, em] = a.hours.end.split(":").map(Number) as [number, number];
  const out: number[] = [];
  const today = zonedDate(a.now, a.timeZone);
  for (let i = 0; i <= days; i++) {
    // Walk calendar days at the store (noon avoids daylight-saving edges).
    const noon = zonedTime(today.y, today.m, today.d, 12, 0, a.timeZone) + i * 86400e3;
    const day = zonedDate(noon, a.timeZone);
    if (!a.hours.days.includes(day.weekday)) continue;
    const dayEnd = zonedTime(day.y, day.m, day.d, eh, em, a.timeZone);
    for (let t = zonedTime(day.y, day.m, day.d, sh, sm, a.timeZone); t + minutes * 60e3 <= dayEnd; t += minutes * 60e3) {
      if (t < earliest) continue;
      const end = t + minutes * 60e3;
      if (a.busy.some((b) => t < b.end && end > b.start)) continue;
      out.push(t);
      if (a.max && out.length >= a.max) return out;
    }
  }
  return out;
}

export function slotLabel(ts: number, timeZone: string) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dayLabel(ts: number, timeZone: string) {
  return new Date(ts).toLocaleDateString("en-US", { timeZone, weekday: "long", month: "short", day: "numeric" });
}

export function timeLabel(ts: number, timeZone: string) {
  return new Date(ts).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

export function bookingInviteText(a: { first: string; store: string; link: string }) {
  return `Great news, ${a.first}! The team at ${a.store} would like to interview you. Pick a time that works for you: ${a.link}`;
}

export function bookedText(a: { first: string; store: string; when: string; address: string | null }) {
  return `You're booked, ${a.first}! Your interview at ${a.store} is ${a.when}.${a.address ? ` Address: ${a.address}.` : ""} Reply if you need to change it.`;
}
