import { describe, expect, it } from "vitest";
import {
  computeAnalytics,
  filterScope,
  managerResponseHours,
  storeBrands,
  median,
  toCsv,
  type AApp,
  type AEvent,
  type AJob,
} from "@/lib/analytics";
import { statusEventMessage, statusFromEventMessage } from "@/lib/status-log";

const H = 3600e3;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString();

const stores = [
  { id: "s1", name: "Grand Rapids Ford" },
  { id: "s2", name: "Detroit Toyota" },
];
const jobs: AJob[] = [
  {
    id: "j1",
    title: "Service Technician",
    dealership_id: "s1",
    status: "open",
    division: "fixed_ops",
    department: "Service",
    hiring_manager: "Dana",
    created_at: iso(24 * 20),
  },
  {
    id: "j2",
    title: "Sales Consultant",
    dealership_id: "s2",
    status: "open",
    division: "variable",
    department: "Sales",
    hiring_manager: null,
    created_at: iso(24 * 10),
  },
  {
    id: "j3",
    title: "Porter",
    dealership_id: "s2",
    status: "closed",
    division: null,
    department: null,
    hiring_manager: null,
    created_at: iso(24 * 5),
  },
];
const app = (id: string, job: AJob, status: AApp["status"], appliedHoursAgo: number): AApp => ({
  id,
  job_id: job.id,
  dealership_id: job.dealership_id,
  status,
  source: "Indeed",
  created_at: iso(appliedHoursAgo),
  updated_at: iso(appliedHoursAgo),
});
const ev = (appId: string, to: AApp["status"], hoursAgo: number): AEvent => ({
  application_id: appId,
  kind: "status",
  message: statusEventMessage(to),
  created_at: iso(hoursAgo),
});

describe("status events", () => {
  it("round-trips the stage through the event message", () => {
    expect(statusFromEventMessage(statusEventMessage("screening"))).toBe("screening");
    expect(statusFromEventMessage(statusEventMessage("rejected"))).toBe("rejected");
    expect(statusFromEventMessage("Application received")).toBeNull();
  });
});

describe("computeAnalytics", () => {
  const [tech, sales] = jobs as [AJob, AJob, AJob];
  const apps = [
    app("a1", tech, "screening", 100), // contacted 4h after applying
    app("a2", tech, "hired", 24 * 15), // hired 5 days ago
    app("a3", sales, "new", 10), // untouched
    app("a4", sales, "interview", 24 * 9), // in interview for 8 days
  ];
  const events = [
    ev("a1", "screening", 96),
    ev("a2", "screening", 24 * 15 - 2),
    ev("a2", "hired", 24 * 5),
    ev("a4", "interview", 24 * 8),
  ];
  const run = (over: Partial<Parameters<typeof computeAnalytics>[0]> = {}) =>
    computeAnalytics({
      apps,
      jobs,
      stores,
      events,
      messages: [],
      range: { from: NOW - 30 * 24 * H, to: NOW },
      filters: { storeId: "all", division: "all" },
      now: NOW,
      ...over,
    });

  it("counts applicants, contacted and hires in the period", () => {
    const a = run();
    expect(a.totals.applicants).toBe(4);
    expect(a.totals.contacted).toBe(3);
    expect(a.totals.hired).toBe(1);
    expect(a.totals.openRoles).toBe(2);
  });

  it("measures time to first contact from the first stage change", () => {
    const a = run();
    // a1: 4 hrs, a2: 2 hrs, a4: 24 hrs -> median 4
    expect(a.totals.medianFirstContactHrs).toBeCloseTo(4);
    expect(a.totals.firstContactMeasured).toBe(3);
  });

  it("measures time to hire from applying to being marked hired", () => {
    // a2 applied 15 days ago and was hired 5 days ago
    expect(run().totals.medianTimeToHireDays).toBeCloseTo(10);
    expect(run().totals.avgTimeToHireDays).toBeCloseTo(10);
    expect(
      run({ apps: apps.filter((a) => a.status !== "hired") }).totals.medianTimeToHireDays,
    ).toBeNull();
  });

  it("filters by store brand and by role", () => {
    const branded = [
      { id: "s1", name: "Grand Rapids Ford", brand: "Ford" },
      { id: "s2", name: "Detroit Toyota", brand: " Toyota " },
    ];
    const ford = run({
      stores: branded,
      filters: { storeId: "all", division: "all", brand: "Ford" },
    });
    expect(ford.totals.applicants).toBe(2);
    expect(ford.totals.hired).toBe(1);
    const toyota = run({
      stores: branded,
      filters: { storeId: "all", division: "all", brand: "Toyota" },
    });
    expect(toyota.totals.applicants).toBe(2);
    expect(toyota.totals.hired).toBe(0);
    const sales = run({ filters: { storeId: "all", division: "all", role: "Sales Consultant" } });
    expect(sales.totals.applicants).toBe(2);
    expect(sales.totals.openRoles).toBe(1);
    expect(storeBrands(branded)).toEqual(["Ford", "Toyota"]);
  });

  it("filterScope matches the same applications the analytics count", () => {
    const scope = filterScope(stores, jobs, { storeId: "all", division: "all", role: "Porter" });
    expect(scope.jobMatches(jobs[2])).toBe(true);
    expect(scope.appMatches({ dealership_id: "s2", job_id: "j2" })).toBe(false);
    expect(scope.storeMatches("s1")).toBe(true);
  });

  it("ages candidates from when they entered their current stage", () => {
    const interview = run().aging.find((r) => r.stage === "interview")!;
    expect(interview.count).toBe(1);
    expect(interview.avgDays).toBeCloseTo(8);
    expect(interview.over7).toBe(1);
    const fresh = run().aging.find((r) => r.stage === "new")!;
    expect(fresh.over3).toBe(0);
  });

  it("measures time to fill from req creation to first hire", () => {
    const a = run();
    expect(a.timeToFillByRole).toEqual([{ label: "Service Technician", filled: 1, avgDays: 15 }]);
    expect(a.timeToFillByStore[0]?.label).toBe("Grand Rapids Ford");
  });

  it("splits open roles by division and filters by store", () => {
    expect(run().openByDivision).toEqual({ fixed_ops: 1, variable: 1, general: 0 });
    const gr = run({ filters: { storeId: "s1", division: "all" } });
    expect(gr.totals.applicants).toBe(2);
    expect(gr.totals.openRoles).toBe(1);
  });

  it("breaks down by location and hiring manager", () => {
    const byLoc = run().breakdown("location");
    expect(byLoc.find((r) => r.label === "Detroit Toyota")).toMatchObject({
      applicants: 2,
      contacted: 1,
      hired: 0,
      openRoles: 1,
    });
    const byMgr = run().breakdown("manager");
    expect(byMgr.map((r) => r.label).sort()).toEqual(["Dana", "Not assigned"]);
  });
});

describe("managerResponseHours", () => {
  it("pairs each text to the manager with the next reply", () => {
    const m = managerResponseHours([
      { application_id: "a1", party: "manager", direction: "out", created_at: iso(10) },
      { application_id: "a1", party: "manager", direction: "out", created_at: iso(9) },
      { application_id: "a1", party: "manager", direction: "in", created_at: iso(4) },
      { application_id: "a1", party: "candidate", direction: "in", created_at: iso(3) },
    ]);
    expect(m.get("a1")).toEqual([6]);
  });
});

describe("helpers", () => {
  it("computes medians and safe CSV", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
    expect(toCsv(["Name"], [['Smith, "Bo"']])).toBe('"Name"\n"Smith, ""Bo"""');
  });
});

describe("retention and regions", () => {
  const DAY = 24 * H;
  const day = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);
  const rStores = [
    { id: "s1", name: "Grand Rapids Ford", region_id: "west" },
    { id: "s2", name: "Detroit Toyota", region_id: "east" },
    { id: "s3", name: "Lansing Kia", region_id: null },
  ];
  const regions = [
    { id: "west", name: "West Michigan" },
    { id: "east", name: "Metro Detroit" },
  ];
  const rJobs: AJob[] = rStores.map((s, i) => ({
    id: `j${i}`,
    title: "Service Technician",
    dealership_id: s.id,
    status: "open",
    division: "fixed_ops",
    department: "Service",
    hiring_manager: null,
    created_at: iso(24 * 200),
  }));
  const hire = (
    id: string,
    job: AJob,
    startDaysAgo: number,
    departedDaysAgo: number | null,
  ): AApp => ({
    id,
    job_id: job.id,
    dealership_id: job.dealership_id,
    status: "hired",
    source: "Referral",
    created_at: iso(24 * (startDaysAgo + 10)),
    updated_at: iso(24 * startDaysAgo),
    hired_at: iso(24 * (startDaysAgo + 3)),
    start_date: day(startDaysAgo),
    departed_at: departedDaysAgo === null ? null : day(departedDaysAgo),
  });
  const [west, east, none] = rJobs as [AJob, AJob, AJob];
  const apps = [
    hire("h1", west, 120, null), // stayed past 90
    hire("h2", west, 100, 80), // left on day 20: fails 30/60/90
    hire("h3", east, 70, 5), // left on day 65: passes 30 and 60; started 70 days ago, so not due for 90
    hire("h4", east, 10, null), // too new for any mark
    hire("h5", none, 45, null), // passes 30; not due for 60
  ];
  const run = (filters = { storeId: "all", division: "all", regionId: "all" }) =>
    computeAnalytics({
      apps,
      jobs: rJobs,
      stores: rStores,
      regions,
      events: [],
      messages: [],
      range: { from: null, to: NOW },
      filters,
      now: NOW,
    });

  it("computes enterprise 30/60/90 retention from start and departure dates", () => {
    const e = run().retention.enterprise;
    expect(e.hires).toBe(5);
    // 30-day: h1, h2, h3, h5 due; h2 left before day 30 -> 3/4
    expect(e[30]).toEqual({ eligible: 4, retained: 3, rate: 0.75 });
    // 60-day: h1, h2, h3 due; h3 left on day 65 so still counts -> 2/3
    expect(e[60]).toMatchObject({ eligible: 3, retained: 2 });
    // 90-day: h1, h2 due -> 1/2
    expect(e[90]).toEqual({ eligible: 2, retained: 1, rate: 0.5 });
  });

  it("breaks retention down by region and location", () => {
    const r = run().retention;
    expect(r.byRegion.map((x) => x.label).sort()).toEqual([
      "Metro Detroit",
      "No region",
      "West Michigan",
    ]);
    const westRow = r.byRegion.find((x) => x.label === "West Michigan")!;
    expect(westRow[30]).toEqual({ eligible: 2, retained: 1, rate: 0.5 });
    expect(r.byLocation.find((x) => x.label === "Lansing Kia")?.[30].rate).toBe(1);
  });

  it("filters everything by region", () => {
    const w = run({ storeId: "all", division: "all", regionId: "west" });
    expect(w.retention.enterprise.hires).toBe(2);
    expect(w.openByStore.map((s) => s.label)).toEqual(["Grand Rapids Ford"]);
    const n = run({ storeId: "all", division: "all", regionId: "none" });
    expect(n.retention.enterprise.hires).toBe(1);
    expect(
      run()
        .breakdown("region")
        .find((x) => x.label === "Metro Detroit")?.openRoles,
    ).toBe(1);
  });

  it("uses hired_at for time to fill when present", () => {
    const fill = run().timeToFillByStore.find((x) => x.label === "Grand Rapids Ford")!;
    // job created 200 days ago; first hire (h1) hired_at 123 days ago -> 77 days
    expect(fill.avgDays).toBeCloseTo(77);
  });
});
