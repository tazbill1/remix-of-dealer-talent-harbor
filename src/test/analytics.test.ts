import { describe, expect, it } from "vitest";
import {
  computeAnalytics,
  managerResponseHours,
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
