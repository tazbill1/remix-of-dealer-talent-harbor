import { STATUSES, type AppStatus } from "@/lib/jobs";
import { STATUS_EVENT_KIND, statusFromEventMessage } from "@/lib/status-log";

/** Inputs are plain rows from Supabase so the math can be unit tested without a database. */
export type AApp = {
  id: string;
  job_id: string;
  dealership_id: string;
  status: AppStatus;
  source: string;
  created_at: string;
  updated_at: string;
};
export type AJob = {
  id: string;
  title: string;
  dealership_id: string;
  status: string;
  division: string | null;
  department: string | null;
  hiring_manager: string | null;
  created_at: string;
};
export type AStore = { id: string; name: string };
export type AEvent = {
  application_id: string;
  kind: string;
  message: string | null;
  created_at: string;
};
export type AMessage = {
  application_id: string;
  party: string;
  direction: string;
  created_at: string;
};

export type Range = { from: number | null; to: number };
export type Filters = { storeId: string; division: string };
export type GroupBy = "location" | "role" | "manager" | "source";

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const ACTIVE: AppStatus[] = ["new", "screening", "interview", "offer"];

const t = (iso: string) => new Date(iso).getTime();
const inRange = (iso: string, r: Range) => {
  const v = t(iso);
  return (r.from === null || v >= r.from) && v <= r.to;
};
export const average = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Status events per application, oldest first. */
export function statusTimeline(events: AEvent[]) {
  const by = new Map<string, { at: number; to: AppStatus | null }[]>();
  for (const e of events) {
    if (e.kind !== STATUS_EVENT_KIND) continue;
    const list = by.get(e.application_id) ?? [];
    list.push({ at: t(e.created_at), to: statusFromEventMessage(e.message) });
    by.set(e.application_id, list);
  }
  for (const list of by.values()) list.sort((a, b) => a.at - b.at);
  return by;
}

/** Hours from application to the first stage change (the client's definition of first contact). */
export function firstContactHours(app: AApp, timeline: Map<string, { at: number }[]>) {
  const first = timeline.get(app.id)?.[0];
  return first ? Math.max(0, (first.at - t(app.created_at)) / HOUR) : null;
}

/** When the application reached its current stage. Falls back to the apply date for older records. */
export function stageSince(
  app: AApp,
  timeline: Map<string, { at: number; to: AppStatus | null }[]>,
) {
  const list = timeline.get(app.id) ?? [];
  const last = [...list].reverse().find((s) => s.to === app.status);
  return last ? last.at : t(app.created_at);
}

/** Time the application was marked hired, or null. Older hires without an event use updated_at. */
export function hiredAt(app: AApp, timeline: Map<string, { at: number; to: AppStatus | null }[]>) {
  if (app.status !== "hired") return null;
  const ev = (timeline.get(app.id) ?? []).find((s) => s.to === "hired");
  return ev ? ev.at : t(app.updated_at);
}

/**
 * Hours a hiring manager takes to answer the assistant: each outbound text to the manager
 * paired with the manager's next reply.
 */
export function managerResponseHours(messages: AMessage[]) {
  const by = new Map<string, AMessage[]>();
  for (const m of messages) {
    if (m.party !== "manager") continue;
    by.set(m.application_id, [...(by.get(m.application_id) ?? []), m]);
  }
  const out = new Map<string, number[]>();
  for (const [appId, list] of by) {
    const sorted = [...list].sort((a, b) => t(a.created_at) - t(b.created_at));
    const gaps: number[] = [];
    let waitingSince: number | null = null;
    for (const m of sorted) {
      if (m.direction === "out" && waitingSince === null) waitingSince = t(m.created_at);
      else if (m.direction === "in" && waitingSince !== null) {
        gaps.push((t(m.created_at) - waitingSince) / HOUR);
        waitingSince = null;
      }
    }
    if (gaps.length) out.set(appId, gaps);
  }
  return out;
}

export type Analytics = ReturnType<typeof computeAnalytics>;

export function computeAnalytics(input: {
  apps: AApp[];
  jobs: AJob[];
  stores: AStore[];
  events: AEvent[];
  messages: AMessage[];
  range: Range;
  filters: Filters;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const jobById = new Map(input.jobs.map((j) => [j.id, j]));
  const storeName = (id: string) => input.stores.find((s) => s.id === id)?.name ?? "Unknown store";
  const jobMatches = (j: AJob | undefined) =>
    !!j &&
    (input.filters.storeId === "all" || j.dealership_id === input.filters.storeId) &&
    (input.filters.division === "all" || (j.division ?? "general") === input.filters.division);
  const appMatches = (a: AApp) =>
    (input.filters.storeId === "all" || a.dealership_id === input.filters.storeId) &&
    (input.filters.division === "all" ||
      (jobById.get(a.job_id)?.division ?? "general") === input.filters.division);

  const timeline = statusTimeline(input.events);
  const responses = managerResponseHours(input.messages);
  const allApps = input.apps.filter(appMatches);
  const periodApps = allApps.filter((a) => inRange(a.created_at, input.range));
  const jobs = input.jobs.filter(jobMatches);
  const openJobs = jobs.filter((j) => j.status === "open");

  // Headline numbers
  const contacted = periodApps.filter((a) => a.status !== "new");
  const firstContact = periodApps
    .map((a) => firstContactHours(a, timeline))
    .filter((h): h is number => h !== null);
  const hiresInPeriod = allApps.filter((a) => {
    const h = hiredAt(a, timeline);
    return (
      h !== null && (input.range.from === null || h >= input.range.from) && h <= input.range.to
    );
  });
  const managerGaps = allApps.flatMap((a) => responses.get(a.id) ?? []);

  // Candidate aging by stage (active pipeline, regardless of period)
  const aging = ACTIVE.map((stage) => {
    const days = allApps
      .filter((a) => a.status === stage)
      .map((a) => (now - stageSince(a, timeline)) / DAY);
    return {
      stage,
      count: days.length,
      avgDays: average(days),
      over3: days.filter((d) => d > 3).length,
      over7: days.filter((d) => d > 7).length,
    };
  });

  // Time to fill: job posted until its first hire
  const fills = jobs.flatMap((j) => {
    const hires = allApps
      .filter((a) => a.job_id === j.id)
      .map((a) => hiredAt(a, timeline))
      .filter((h): h is number => h !== null);
    if (!hires.length) return [];
    const first = Math.min(...hires);
    if (input.range.from !== null && first < input.range.from) return [];
    return [{ job: j, days: Math.max(0, (first - t(j.created_at)) / DAY) }];
  });
  const fillBy = (key: (j: AJob) => string) => {
    const m = new Map<string, number[]>();
    for (const f of fills) m.set(key(f.job), [...(m.get(key(f.job)) ?? []), f.days]);
    return [...m]
      .map(([label, days]) => ({ label, filled: days.length, avgDays: average(days) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  // Open roles
  const openByDivision = {
    fixed_ops: openJobs.filter((j) => j.division === "fixed_ops").length,
    variable: openJobs.filter((j) => j.division === "variable").length,
    general: openJobs.filter((j) => !j.division || j.division === "general").length,
  };

  // Breakdowns for the table + CSV export
  const groupKey: Record<GroupBy, (a: AApp) => string> = {
    location: (a) => storeName(a.dealership_id),
    role: (a) => jobById.get(a.job_id)?.title ?? "Unknown role",
    manager: (a) => jobById.get(a.job_id)?.hiring_manager?.trim() || "Not assigned",
    source: (a) => a.source || "Unknown",
  };
  const openKey: Partial<Record<GroupBy, (j: AJob) => string>> = {
    location: (j) => storeName(j.dealership_id),
    role: (j) => j.title,
    manager: (j) => j.hiring_manager?.trim() || "Not assigned",
  };
  const breakdown = (by: GroupBy) => {
    const rows = new Map<
      string,
      {
        label: string;
        applicants: number;
        contacted: number;
        hired: number;
        firstContact: number[];
        response: number[];
        openRoles: number;
      }
    >();
    const row = (label: string) => {
      if (!rows.has(label))
        rows.set(label, {
          label,
          applicants: 0,
          contacted: 0,
          hired: 0,
          firstContact: [],
          response: [],
          openRoles: 0,
        });
      return rows.get(label)!;
    };
    for (const a of periodApps) {
      const r = row(groupKey[by](a));
      r.applicants++;
      if (a.status !== "new") r.contacted++;
      const fc = firstContactHours(a, timeline);
      if (fc !== null) r.firstContact.push(fc);
    }
    for (const a of hiresInPeriod) row(groupKey[by](a)).hired++;
    for (const a of allApps)
      for (const g of responses.get(a.id) ?? []) row(groupKey[by](a)).response.push(g);
    const ok = openKey[by];
    if (ok) for (const j of openJobs) row(ok(j)).openRoles++;
    return [...rows.values()]
      .map((r) => ({
        label: r.label,
        applicants: r.applicants,
        contacted: r.contacted,
        hired: r.hired,
        avgFirstContactHrs: average(r.firstContact),
        avgManagerResponseHrs: average(r.response),
        openRoles: ok ? r.openRoles : null,
      }))
      .sort((a, b) => b.applicants - a.applicants || a.label.localeCompare(b.label));
  };

  return {
    totals: {
      applicants: periodApps.length,
      contacted: contacted.length,
      hired: hiresInPeriod.length,
      openRoles: openJobs.length,
      medianFirstContactHrs: median(firstContact),
      firstContactMeasured: firstContact.length,
      avgManagerResponseHrs: average(managerGaps),
      managerResponsesMeasured: managerGaps.length,
      avgTimeToFillDays: average(fills.map((f) => f.days)),
      filledJobs: fills.length,
    },
    aging,
    openByDivision,
    openByStore: input.stores
      .filter((s) => input.filters.storeId === "all" || s.id === input.filters.storeId)
      .map((s) => ({
        label: s.name,
        count: openJobs.filter((j) => j.dealership_id === s.id).length,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    timeToFillByRole: fillBy((j) => j.title),
    timeToFillByStore: fillBy((j) => storeName(j.dealership_id)),
    breakdown,
  };
}

/** Builds a CSV string; quotes every field so commas and quotes in names are safe. */
export function toCsv(headers: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

export const STAGE_ORDER = STATUSES;
