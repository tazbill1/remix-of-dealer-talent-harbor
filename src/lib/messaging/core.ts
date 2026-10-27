/**
 * Texting engine rules. Everything here is plain functions so the rules can be tested
 * without a database or a phone provider. Delivery lives in outbox.server.ts.
 */

/** US phone numbers to E.164 (+15551234567). Returns null if it isn't a usable number. */
export function toE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+"))
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// ---------------------------------------------------------------------------
// Texting window: only send between send_start and send_end on send_days,
// in the store's time zone. ISO weekday: 1 = Monday ... 7 = Sunday.
// ---------------------------------------------------------------------------

export type SendWindow = { start: string; end: string; days: number[]; timeZone: string };

const DAY = 24 * 3600e3;
const minutes = (hhmm: string) => {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
};

/** Local calendar date, ISO weekday and minutes-after-midnight of an instant in a time zone. */
export function localParts(ms: number, timeZone: string) {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(ms)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday!) + 1;
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** The UTC instant of a local wall-clock time (e.g. 08:00 on 2026-10-27 in America/Chicago). */
export function zonedTime(ymd: string, hhmm: string, timeZone: string) {
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, mo - 1, d) + minutes(hhmm) * 60e3;
  // Correct twice for the zone's offset (handles daylight saving changes).
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = localParts(guess, timeZone);
    const [py, pm, pd] = p.ymd.split("-").map(Number) as [number, number, number];
    const seen = Date.UTC(py, pm - 1, pd) + p.minute * 60e3;
    guess += wall - seen;
  }
  return guess;
}

export function isInSendWindow(now: number, w: SendWindow) {
  const p = localParts(now, w.timeZone);
  return w.days.includes(p.weekday) && p.minute >= minutes(w.start) && p.minute < minutes(w.end);
}

/** `now` if it's inside the window, otherwise the start of the next allowed window. */
export function nextSendTime(now: number, w: SendWindow) {
  if (isInSendWindow(now, w)) return now;
  if (!w.days.length) return null;
  const today = localParts(now, w.timeZone);
  for (let offset = 0; offset <= 7; offset++) {
    // Step through local calendar days by taking noon UTC of today's date plus offset days.
    const [y, m, d] = today.ymd.split("-").map(Number) as [number, number, number];
    const ymd = new Date(Date.UTC(y, m - 1, d) + offset * DAY).toISOString().slice(0, 10);
    const weekday = ((today.weekday - 1 + offset) % 7) + 1;
    if (!w.days.includes(weekday)) continue;
    const start = zonedTime(ymd, w.start, w.timeZone);
    if (start > now) return start;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Keywords carriers require us to honor (CTIA guidance).
// ---------------------------------------------------------------------------

export type Keyword = "stop" | "start" | "help";
const STOP = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"];
const START = ["START", "UNSTOP"];
const HELP = ["HELP", "INFO"];

/** Whole-message keyword match, ignoring case, spaces and trailing punctuation. */
export function keywordOf(body: string): Keyword | null {
  const word = body
    .trim()
    .toUpperCase()
    .replace(/[.!?\s]+$/g, "")
    .replace(/\s+/g, "");
  if (STOP.includes(word)) return "stop";
  if (START.includes(word)) return "start";
  if (HELP.includes(word)) return "help";
  return null;
}

export function keywordReply(k: Keyword, storeName: string) {
  if (k === "stop")
    return `${storeName}: You're unsubscribed and won't get more texts from us. Reply START to resubscribe.`;
  if (k === "start")
    return `${storeName}: You're resubscribed to hiring updates. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`;
  return `${storeName} hiring texts: updates about your application. Msg & data rates may apply. Reply STOP to opt out.`;
}

// ---------------------------------------------------------------------------
// Should this text go out, wait for the window, or not go at all?
// ---------------------------------------------------------------------------

export type DeliveryDecision =
  { status: "queued"; scheduledFor: number } | { status: "blocked"; reason: string };

export function decideDelivery(input: {
  to: string | null;
  party: "candidate" | "manager";
  optedOut: boolean;
  candidateConsent: boolean;
  /** Keyword confirmations (STOP/START/HELP replies) go out once even after an opt-out, and immediately. */
  isKeywordReply?: boolean | undefined;
  now: number;
  window: SendWindow;
}): DeliveryDecision {
  if (!input.to) return { status: "blocked", reason: "No valid mobile number" };
  if (input.isKeywordReply) return { status: "queued", scheduledFor: input.now };
  if (input.optedOut) return { status: "blocked", reason: "This number replied STOP" };
  if (input.party === "candidate" && !input.candidateConsent)
    return { status: "blocked", reason: "Candidate hasn't agreed to texts" };
  const at = nextSendTime(input.now, input.window);
  if (at === null) return { status: "blocked", reason: "No texting days are turned on" };
  return { status: "queued", scheduledFor: at };
}
