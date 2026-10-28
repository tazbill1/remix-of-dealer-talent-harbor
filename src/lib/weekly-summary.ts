/**
 * Weekly HR summary: one email per team member covering the stores they can see.
 * Plain functions over rows so the numbers and wording are testable; the scheduled
 * job (weekly-summary.server.ts) loads the rows and sends through the email outbox.
 */
import { localParts, zonedTime } from "@/lib/messaging/core";
import type { Automations } from "@/lib/automations";

const DAY = 24 * 3600e3;

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Group settings (stored in messaging_settings.automations.weeklySummary). Off until turned on. */
export function weeklySummarySettings(a: Automations) {
  const w = a.weeklySummary ?? {};
  return {
    enabled: w.enabled === true,
    /** ISO weekday, 1 = Monday. */
    day: w.day ?? 1,
    hour: w.hour ?? 8,
  };
}

/** The Monday (YYYY-MM-DD) of the local week an instant falls in. */
export function weekOf(now: number, timeZone: string) {
  const p = localParts(now, timeZone);
  const [y, m, d] = p.ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - (p.weekday - 1) * DAY).toISOString().slice(0, 10);
}

/** True once the chosen send day and hour have arrived this week (local time). */
export function summaryDue(now: number, timeZone: string, day: number, hour: number) {
  const monday = weekOf(now, timeZone);
  const [y, m, d] = monday.split("-").map(Number) as [number, number, number];
  const sendDay = new Date(Date.UTC(y, m - 1, d) + (day - 1) * DAY).toISOString().slice(0, 10);
  const at = zonedTime(sendDay, `${String(hour).padStart(2, "0")}:00`, timeZone);
  return now >= at;
}

export type SMember = { id: string; role: string; email: string | null };
export type SScope = { member_id: string; dealership_id: string | null; region_id: string | null };
export type SStore = { id: string; name: string; region_id: string | null; timezone: string | null };

/** Stores a member covers. No coverage rows means the whole group (same as the access rules). */
export function storesFor(member: SMember, scopes: SScope[], stores: SStore[]) {
  const mine = scopes.filter((s) => s.member_id === member.id);
  if (!mine.length) return stores;
  return stores.filter((st) =>
    mine.some((s) => s.dealership_id === st.id || (!!s.region_id && s.region_id === st.region_id)),
  );
}

export type SApp = {
  id: string;
  dealership_id: string;
  status: string;
  created_at: string;
  hired_at: string | null;
  needs_attention: string | null;
  departed_at: string | null;
};
export type SInterview = { application_id: string; starts_at: string; status: string };
export type SOffer = {
  application_id: string;
  created_at: string;
  completed_at: string | null;
  is_offer_letter: boolean;
};
export type SCheckin = {
  application_id: string;
  due_on: string;
  sent_at: string | null;
  responded_at: string | null;
  still_employed: boolean | null;
};

export type StoreWeek = {
  storeId: string;
  storeName: string;
  newApplicants: number;
  waitingOnManager: number;
  needsAttention: number;
  interviewsHeld: number;
  interviewsAhead: number;
  offersSent: number;
  offersSigned: number;
  hires: number;
  checkinsWaiting: number;
  leftAtCheckin: number;
};

/** The numbers for one store over the past 7 days (and interviews in the next 7). */
export function storeWeek(
  store: SStore,
  rows: { apps: SApp[]; interviews: SInterview[]; offers: SOffer[]; checkins: SCheckin[] },
  now: number,
): StoreWeek {
  const apps = rows.apps.filter((a) => a.dealership_id === store.id);
  const ids = new Set(apps.map((a) => a.id));
  const lastWeek = (iso: string | null) => !!iso && Date.parse(iso) > now - 7 * DAY && Date.parse(iso) <= now;
  const nextWeek = (iso: string) => Date.parse(iso) > now && Date.parse(iso) <= now + 7 * DAY;
  const interviews = rows.interviews.filter((i) => ids.has(i.application_id) && i.status !== "cancelled");
  const offers = rows.offers.filter((o) => ids.has(o.application_id) && o.is_offer_letter);
  const today = localParts(now, store.timezone || "America/Chicago").ymd;
  const checkins = rows.checkins.filter((c) => ids.has(c.application_id));
  return {
    storeId: store.id,
    storeName: store.name,
    newApplicants: apps.filter((a) => lastWeek(a.created_at)).length,
    waitingOnManager: apps.filter((a) => a.status === "screening").length,
    needsAttention: apps.filter((a) => !!a.needs_attention && ["new", "screening", "interview", "offer"].includes(a.status)).length,
    interviewsHeld: interviews.filter((i) => lastWeek(i.starts_at)).length,
    interviewsAhead: interviews.filter((i) => i.status === "scheduled" && nextWeek(i.starts_at)).length,
    offersSent: offers.filter((o) => lastWeek(o.created_at)).length,
    offersSigned: offers.filter((o) => lastWeek(o.completed_at)).length,
    hires: apps.filter((a) => a.status === "hired" && lastWeek(a.hired_at)).length,
    checkinsWaiting: checkins.filter((c) => c.sent_at && !c.responded_at && c.due_on <= today).length,
    leftAtCheckin: checkins.filter((c) => c.still_employed === false && lastWeek(c.responded_at)).length,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One store's lines, leaving out anything that's zero. */
export function storeLines(w: StoreWeek) {
  const lines = [
    w.newApplicants && `${plural(w.newApplicants, "new applicant")}`,
    w.waitingOnManager && `${plural(w.waitingOnManager, "candidate")} waiting on a hiring manager decision`,
    w.needsAttention && `${plural(w.needsAttention, "candidate")} flagged for a person to follow up`,
    w.interviewsHeld && `${plural(w.interviewsHeld, "interview")} last week`,
    w.interviewsAhead && `${plural(w.interviewsAhead, "interview")} booked for the next 7 days`,
    w.offersSent && `${plural(w.offersSent, "offer letter")} sent`,
    w.offersSigned && `${plural(w.offersSigned, "offer letter")} signed`,
    w.hires && `${plural(w.hires, "new hire")}`,
    w.checkinsWaiting && `${plural(w.checkinsWaiting, "new-hire check-in")} still waiting on an answer`,
    w.leftAtCheckin && `${plural(w.leftAtCheckin, "new hire")} reported as no longer on the team`,
  ].filter(Boolean) as string[];
  return lines.length ? lines : ["Quiet week: nothing new."];
}

/** Subject and plain-text body for one person's summary. */
export function summaryEmail(input: {
  groupName: string;
  weekOf: string;
  stores: StoreWeek[];
  appUrl: string;
}) {
  const [y, m, d] = input.weekOf.split("-").map(Number) as [number, number, number];
  const week = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  const total = (k: keyof Omit<StoreWeek, "storeId" | "storeName">) =>
    input.stores.reduce((n, s) => n + s[k], 0);
  const headline = [
    plural(total("newApplicants"), "new applicant"),
    plural(total("interviewsAhead"), "interview") + " coming up",
    plural(total("hires"), "hire"),
  ].join(" · ");
  const sections = input.stores.map((s) =>
    [s.storeName, ...storeLines(s).map((l) => `• ${l}`)].join("\n"),
  );
  const waiting = total("waitingOnManager") + total("needsAttention");
  const body = [
    `Here's your hiring week at ${input.groupName} (week of ${week}).`,
    headline,
    ...sections,
    waiting
      ? `${plural(waiting, "candidate is", "candidates are")} waiting on someone. Open hireme to take a look: ${input.appUrl}/applicants`
      : `Open hireme: ${input.appUrl}/applicants`,
    "You get this because you're on the hiring team in hireme by WerkandMe.",
  ].join("\n\n");
  return { subject: `Your hiring week: ${headline}`, body };
}
