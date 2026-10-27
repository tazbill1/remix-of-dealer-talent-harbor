/**
 * Texting workflows: what should be texted, to whom, and when. Plain functions over
 * rows so every rule is testable. The scheduled job (run.server.ts) turns the plans
 * into texts through the outbox, which still applies consent, STOP and texting hours.
 */
import { isInSendWindow, nextSendTime, type SendWindow } from "@/lib/messaging/core";

export const PURPOSE = {
  welcome: "welcome",
  summary: "manager_summary",
  nudge: "manager_nudge",
  escalation: "manager_escalation",
  decisionAck: "manager_decision_ack",
  inviteCandidate: "candidate_interview_invite",
  declineCandidate: "candidate_decline",
  reminderDay: "interview_reminder_day",
  reminderSoon: "interview_reminder_2h",
  reminderManager: "interview_reminder_manager",
  checkin: (mark: number) => `checkin_${mark}`,
} as const;

const HOUR = 3600e3;

export type Msg = {
  application_id: string;
  party: string;
  direction: string;
  purpose: string | null;
  status: string;
  created_at: string;
};

/** Hours that fall inside the texting window between two instants (15-minute steps). */
export function windowHoursBetween(from: number, to: number, w: SendWindow, capHours = Infinity) {
  if (to <= from) return 0;
  const step = 15 * 60e3;
  const cap = capHours * HOUR;
  let inside = 0;
  for (let t = from; t < to && inside < cap; t += step)
    if (isInSendWindow(t, w)) inside += Math.min(step, to - t);
  return inside / HOUR;
}

const sentOk = (m: Msg) => m.status !== "blocked" && m.status !== "failed";

// ---------------------------------------------------------------------------
// Manager follow-up: summary once screening is done, then a nudge, then escalation.
// ---------------------------------------------------------------------------

export type ManagerStep = "summary" | "nudge" | "escalation";

/**
 * Next manager step for one application, or null. Summary goes out once the candidate
 * reaches Screening. The nudge and escalation clocks count only texting hours since
 * the summary, and stop as soon as the manager (or escalation contact) replies or the
 * candidate moves past Screening.
 */
export function nextManagerStep(input: {
  status: string;
  messages: Msg[];
  nudgeAfterHours: number;
  escalateAfterHours: number;
  hasEscalationContact: boolean;
  window: SendWindow;
  now: number;
}): ManagerStep | null {
  if (input.status !== "screening") return null;
  const mine = input.messages.filter((m) => m.party === "manager");
  const summary = mine.find(
    (m) => m.direction === "out" && m.purpose === PURPOSE.summary && sentOk(m),
  );
  if (!summary) {
    // Don't re-send if a summary was attempted and blocked (e.g. no number): that needs a person.
    return mine.some((m) => m.purpose === PURPOSE.summary) ? null : "summary";
  }
  const since = Date.parse(summary.created_at);
  const replied = mine.some((m) => m.direction === "in" && Date.parse(m.created_at) > since);
  if (replied) return null;
  const has = (p: string) => mine.some((m) => m.purpose === p);
  const canEscalate = input.hasEscalationContact && !has(PURPOSE.escalation);
  const canNudge = !has(PURPOSE.nudge) && !has(PURPOSE.escalation);
  if (!canEscalate && !canNudge) return null;
  const cap = Math.max(input.escalateAfterHours, input.nudgeAfterHours);
  const waited = windowHoursBetween(since, input.now, input.window, cap);
  if (canEscalate && waited >= input.escalateAfterHours) return "escalation";
  if (canNudge && waited >= input.nudgeAfterHours) return "nudge";
  return null;
}

// ---------------------------------------------------------------------------
// Replies with a fixed meaning
// ---------------------------------------------------------------------------

/** "1" = interview, "2" = pass. Also accepts a few obvious words. */
export function managerDecision(body: string): "interview" | "pass" | null {
  const t = body
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  if (["1", "interview", "yes interview", "set it up"].includes(t)) return "interview";
  if (["2", "pass", "no", "no thanks", "not a fit"].includes(t)) return "pass";
  return null;
}

export function yesNo(body: string): boolean | null {
  const t = body
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  if (["y", "yes", "yep", "yeah", "still here", "still with us"].includes(t)) return true;
  if (["n", "no", "nope", "gone", "left", "quit"].includes(t)) return false;
  return null;
}

/** What the last text to this manager was asking, so a short reply can be understood. */
export function pendingManagerQuestion(
  messages: Msg[],
): { kind: "decision" } | { kind: "checkin"; mark: number } | null {
  const lastOut = [...messages]
    .filter((m) => m.party === "manager" && m.direction === "out" && m.purpose)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!lastOut?.purpose) return null;
  if ([PURPOSE.summary, PURPOSE.nudge, PURPOSE.escalation].includes(lastOut.purpose as never))
    return { kind: "decision" };
  const m = /^checkin_(\d+)$/.exec(lastOut.purpose);
  return m ? { kind: "checkin", mark: Number(m[1]) } : null;
}

// ---------------------------------------------------------------------------
// Interview reminders
// ---------------------------------------------------------------------------

export type ReminderStep = { purpose: string; party: "candidate" | "manager" };

/**
 * Reminders due for one interview right now: the candidate the day before and 2 hours
 * before, the manager 2 hours before. Skipped if texting hours would delay them past
 * the interview.
 */
export function dueReminders(input: {
  startsAt: number;
  messages: Msg[];
  window: SendWindow;
  now: number;
}): ReminderStep[] {
  const { startsAt, now } = input;
  if (startsAt <= now) return [];
  const sent = (p: string) => input.messages.some((m) => m.purpose === p);
  const until = startsAt - now;
  const out: ReminderStep[] = [];
  const canLand = () => {
    const at = nextSendTime(now, input.window);
    return at !== null && at < startsAt - 15 * 60e3;
  };
  if (until <= 2 * HOUR) {
    if (!sent(PURPOSE.reminderSoon) && canLand())
      out.push({ purpose: PURPOSE.reminderSoon, party: "candidate" });
    if (!sent(PURPOSE.reminderManager) && canLand())
      out.push({ purpose: PURPOSE.reminderManager, party: "manager" });
  } else if (until <= 26 * HOUR && !sent(PURPOSE.reminderDay) && canLand()) {
    out.push({ purpose: PURPOSE.reminderDay, party: "candidate" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Message text
// ---------------------------------------------------------------------------

/** Every manager text names the program, as registered with the carriers. */
export const BRAND = "hireme by WerkandMe";

export const text = {
  welcome: (a: { first: string; store: string; assistant: string; job: string }) =>
    `Hi ${a.first}! This is ${a.assistant}, the hiring assistant for ${a.store} (hireme by WerkandMe). Thanks for applying for ${a.job}! A few quick questions so we can get you in front of the team. First: how many years of experience do you have? Reply STOP to opt out.`,
  summary: (a: {
    assistant: string;
    name: string;
    job: string;
    store: string;
    summary: string;
    rating: number | null;
  }) =>
    `${BRAND}: ${a.name} applied for ${a.job} at ${a.store}. ${trim(a.summary, 130)}${a.rating ? ` Fit: ${a.rating}/5.` : ""} Reply 1 to interview, 2 to pass, or text me a question. Reply STOP to opt out.`,
  nudge: (a: { name: string; job: string }) =>
    `${BRAND}: Friendly reminder, ${a.name} (${a.job}) is waiting on you. Reply 1 to interview or 2 to pass.`,
  escalation: (a: { manager: string; name: string; job: string; hours: number }) =>
    `${BRAND}: Heads up, ${a.manager} hasn't answered about ${a.name} (${a.job}) in ${a.hours} texting hours. Reply 1 to interview or 2 to pass. Reply STOP to opt out.`,
  ackInterview: (a: { name: string }) =>
    `Got it! I'll reach out to ${a.name} to set up the interview and confirm the time with you.`,
  ackPass: (a: { name: string }) => `Got it, I'll let ${a.name} know. Thanks!`,
  inviteCandidate: (a: { first: string; store: string }) =>
    `Great news, ${a.first}! The team at ${a.store} would like to interview you. What days and times work best for you this week?`,
  declineCandidate: (a: { first: string; job: string; store: string }) =>
    `Hi ${a.first}, thank you for your interest in the ${a.job} role at ${a.store}. We've decided to go another direction for now, but we'd love to keep you in mind for future openings.`,
  reminderDay: (a: { first: string; when: string; store: string; address: string | null }) =>
    `Hi ${a.first}! Reminder: your interview at ${a.store} is ${a.when}.${a.address ? ` Address: ${a.address}.` : ""} Reply if you need to reschedule.`,
  reminderSoon: (a: { first: string; when: string; store: string }) =>
    `See you soon, ${a.first}! Your interview at ${a.store} is at ${a.when}. Reply if you're running late.`,
  reminderManager: (a: { name: string; job: string; when: string }) =>
    `${BRAND}: Reminder, you're interviewing ${a.name} for ${a.job} at ${a.when}.`,
  checkin: (a: { name: string; mark: number; store: string }) =>
    `${BRAND}: Quick ${a.mark}-day check-in. Is ${a.name} still on your team at ${a.store}? Reply Y or N. Reply STOP to opt out.`,
  checkinThanks: (stillHere: boolean) =>
    stillHere
      ? "Thanks! Glad to hear it."
      : "Thanks for letting me know. I've noted it so HR can follow up.",
};

function trim(s: string, n: number) {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : `${clean.slice(0, n - 1).replace(/\s+\S*$/, "")}…`;
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] || "there";

// ---------------------------------------------------------------------------
// 30/60/90 check-ins
// ---------------------------------------------------------------------------

/**
 * The check-in to text the manager today, if any: a mark that's due, not yet sent or
 * answered, and no more than a week overdue (so turning this on doesn't text managers
 * about hires from months ago).
 */
export function dueCheckin(input: {
  schedule: { mark: number; due: string }[];
  rows: { day_mark: number; sent_at: string | null; responded_at: string | null }[];
  today: string;
  graceDays?: number;
}) {
  const grace = (input.graceDays ?? 7) * 24 * HOUR;
  const oldest = new Date(Date.parse(`${input.today}T00:00:00Z`) - grace)
    .toISOString()
    .slice(0, 10);
  const open = input.schedule.filter((s) => {
    const row = input.rows.find((r) => r.day_mark === s.mark);
    return s.due <= input.today && s.due >= oldest && !row?.sent_at && !row?.responded_at;
  });
  return open.at(-1) ?? null;
}
