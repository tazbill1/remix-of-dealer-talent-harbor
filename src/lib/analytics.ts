import { sourceLabel } from "@/lib/sources";
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
  hired_at?: string | null;
  start_date?: string | null;
  departed_at?: string | null;
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
export type AStore = { id: string; name: string; region_id?: string | null };
export type ARegion = { id: string; name: string };
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
export type Filters = { storeId: string; division: string; regionId?: string };
export type GroupBy = "location" | "region" | "role" | "manager" | "source";

export const RETENTION_MARKS = [30, 60, 90] as const;
export type RetentionMark = (typeof RETENTION_MARKS)[number];
export type RetentionCell = { eligible: number; retained: number; rate: number | null };
export type RetentionRow = { label: string; hires: number } & Record<RetentionMark, RetentionCell>;

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const ACTIVE: AppStatus[] = ["new", "screening", "interview", "offer"];
const NO_REGION = "No region";

const t = (iso: string) => new Date(iso).getTime();
/** Date-only columns (YYYY-MM-DD) are read as midnight UTC so they don't shift by time zone. */
const dateOnly = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
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

/**
 * Time the application was marked hired, or null. Uses the hired_at column when set,
 * then the stage-change event, then updated_at for older hires.
 */
export function hiredAt(app: AApp, timeline: Map<string, { at: number; to: AppStatus | null }[]>) {
  if (app.status !== "hired") return null;
  if (app.hired_at) return t(app.hired_at);
  const ev = (timeline.get(app.id) ?? []).find((s) => s.to === "hired");
  return ev ? ev.at : t(app.updated_at);
}

/**
 * Retention at 30/60/90 days. The clock starts at the start date (or the hire date if no
 * start date was entered). A hire counts toward a mark once that many days have passed,
 * and is retained if they hadn't left before the mark.
 */
export function retentionFor(
  hires: { start: number; departed: number | null }[],
  now: number,
): Record<RetentionMark, RetentionCell> {
  const out = {} as Record<RetentionMark, RetentionCell>;
  for (const mark of RETENTION_MARKS) {
    const due = hires.filter((h) => now - h.start >= mark * DAY);
    const retained = due.filter((h) => h.departed === null || h.departed >= h.start + mark * DAY);
    out[mark] = {
      eligible: due.length,
      retained: retained.length,
      rate: due.length ? retained.length / due.length : null,
    };
  }
  return out;
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
  regions?: ARegion[];
  events: AEvent[];
  messages: AMessage[];
  range: Range;
  filters: Filters;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const regionFilter = input.filters.regionId ?? "all";
  const jobById = new Map(input.jobs.map((j) => [j.id, j]));
  const storeById = new Map(input.stores.map((s) => [s.id, s]));
  const regionById = new Map((input.regions ?? []).map((r) => [r.id, r]));
  const storeName = (id: string) => storeById.get(id)?.name ?? "Unknown store";
  const regionOf = (storeId: string) => storeById.get(storeId)?.region_id ?? null;
  const regionName = (storeId: string) => {
    const rid = regionOf(storeId);
    return (rid && regionById.get(rid)?.name) || NO_REGION;
  };
  const storeMatches = (storeId: string) =>
    (input.filters.storeId === "all" || storeId === input.filters.storeId) &&
    (regionFilter === "all" ||
      (regionFilter === "none" ? !regionOf(storeId) : regionOf(storeId) === regionFilter));
  const divisionMatches = (division: string | null | undefined) =>
    input.filters.division === "all" || (division ?? "general") === input.filters.division;
  const jobMatches = (j: AJob | undefined) =>
    !!j && storeMatches(j.dealership_id) && divisionMatches(j.division);
  const appMatches = (a: AApp) =>
    storeMatches(a.dealership_id) && divisionMatches(jobById.get(a.job_id)?.division);

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

  // Retention: every hire to date that matches the store/region/division filters
  const hires = allApps.flatMap((a) => {
    const h = hiredAt(a, timeline);
    if (h === null) return [];
    const start = a.start_date ? dateOnly(a.start_date) : h;
    return [{ app: a, start, departed: a.departed_at ? dateOnly(a.departed_at) : null }];
  });
  const retentionBy = (key: (a: AApp) => string): RetentionRow[] => {
    const groups = new Map<string, typeof hires>();
    for (const h of hires) groups.set(key(h.app), [...(groups.get(key(h.app)) ?? []), h]);
    return [...groups]
      .map(([label, list]) => ({ label, hires: list.length, ...retentionFor(list, now) }))
      .sort((a, b) => b.hires - a.hires || a.label.localeCompare(b.label));
  };
  const retention = {
    enterprise: { hires: hires.length, ...retentionFor(hires, now) },
    departed: hires.filter((h) => h.departed !== null).length,
    byLocation: retentionBy((a) => storeName(a.dealership_id)),
    byRegion: retentionBy((a) => regionName(a.dealership_id)),
  };

  // Breakdowns for the table + CSV export
  const groupKey: Record<GroupBy, (a: AApp) => string> = {
    location: (a) => storeName(a.dealership_id),
    region: (a) => regionName(a.dealership_id),
    role: (a) => jobById.get(a.job_id)?.title ?? "Unknown role",
    manager: (a) => jobById.get(a.job_id)?.hiring_manager?.trim() || "Not assigned",
    source: (a) => sourceLabel(a.source),
  };
  const openKey: Partial<Record<GroupBy, (j: AJob) => string>> = {
    location: (j) => storeName(j.dealership_id),
    region: (j) => regionName(j.dealership_id),
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
      .filter((s) => storeMatches(s.id))
      .map((s) => ({
        label: s.name,
        count: openJobs.filter((j) => j.dealership_id === s.id).length,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    timeToFillByRole: fillBy((j) => j.title),
    timeToFillByStore: fillBy((j) => storeName(j.dealership_id)),
    retention,
    breakdown,
  };
}

/** Builds a CSV string; quotes every field so commas and quotes in names are safe. */
export function toCsv(headers: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

export const STAGE_ORDER = STATUSES;
