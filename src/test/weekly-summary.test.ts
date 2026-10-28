import { describe, expect, it } from "vitest";
import { parseAutomations } from "@/lib/automations";
import {
  storeLines,
  storesFor,
  storeWeek,
  summaryDue,
  summaryEmail,
  weekOf,
  weeklySummarySettings,
  type SStore,
} from "@/lib/weekly-summary";

const TZ = "America/Chicago";
// Wednesday Oct 28 2026, 9:00 Chicago (CDT, UTC-5).
const NOW = Date.parse("2026-10-28T14:00:00Z");
const DAY = 24 * 3600e3;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const ahead = (days: number) => new Date(NOW + days * DAY).toISOString();

const stores: SStore[] = [
  { id: "s1", name: "ABC Ford", region_id: "r1", timezone: TZ },
  { id: "s2", name: "ABC Toyota", region_id: "r1", timezone: TZ },
  { id: "s3", name: "XYZ Honda", region_id: "r2", timezone: TZ },
];

describe("weekly summary timing", () => {
  it("is off until the group turns it on, Monday 8am by default", () => {
    expect(weeklySummarySettings(parseAutomations({}))).toEqual({ enabled: false, day: 1, hour: 8 });
    expect(weeklySummarySettings(parseAutomations({ weeklySummary: { enabled: true, day: 5, hour: 7 } }))).toEqual({
      enabled: true,
      day: 5,
      hour: 7,
    });
  });
  it("finds the local Monday of the week", () => {
    expect(weekOf(NOW, TZ)).toBe("2026-10-26");
    // Sunday night local is still the same week even though it's Monday in UTC.
    expect(weekOf(Date.parse("2026-11-02T04:00:00Z"), TZ)).toBe("2026-10-26");
    expect(weekOf(Date.parse("2026-11-02T14:00:00Z"), TZ)).toBe("2026-11-02");
  });
  it("is due once the send day and hour arrive in the store's time zone", () => {
    expect(summaryDue(NOW, TZ, 1, 8)).toBe(true); // Monday already passed
    expect(summaryDue(NOW, TZ, 3, 9)).toBe(true); // Wednesday 9:00, right now
    expect(summaryDue(NOW, TZ, 3, 10)).toBe(false);
    expect(summaryDue(NOW, TZ, 5, 8)).toBe(false); // Friday not yet
  });
});

describe("who covers which stores", () => {
  it("gives unscoped members every store and scoped members only theirs", () => {
    const m = { id: "m1", role: "recruiter", email: "a@b.co" };
    expect(storesFor(m, [], stores).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(
      storesFor(m, [{ member_id: "m1", dealership_id: "s3", region_id: null }], stores).map((s) => s.id),
    ).toEqual(["s3"]);
    expect(
      storesFor(m, [{ member_id: "m1", dealership_id: null, region_id: "r1" }], stores).map((s) => s.id),
    ).toEqual(["s1", "s2"]);
    // Someone else's coverage doesn't limit this member.
    expect(storesFor(m, [{ member_id: "m2", dealership_id: "s3", region_id: null }], stores)).toHaveLength(3);
  });
});

describe("store numbers", () => {
  const app = (id: string, over: Partial<Parameters<typeof storeWeek>[1]["apps"][number]> = {}) => ({
    id,
    dealership_id: "s1",
    status: "new",
    created_at: ago(30),
    hired_at: null,
    needs_attention: null,
    departed_at: null,
    ...over,
  });
  const rows = {
    apps: [
      app("a1", { created_at: ago(2) }),
      app("a2", { created_at: ago(3), status: "screening" }),
      app("a3", { status: "interview", needs_attention: "Asked about pay" }),
      app("a4", { status: "hired", hired_at: ago(1) }),
      app("a5", { status: "hired", hired_at: ago(60) }),
      app("a6", { status: "rejected", needs_attention: "old flag" }),
      app("b1", { dealership_id: "s2", created_at: ago(1) }),
    ],
    interviews: [
      { application_id: "a3", starts_at: ago(2), status: "scheduled" },
      { application_id: "a3", starts_at: ahead(2), status: "scheduled" },
      { application_id: "a2", starts_at: ahead(3), status: "cancelled" },
      { application_id: "a3", starts_at: ahead(10), status: "scheduled" },
    ],
    offers: [
      { application_id: "a4", created_at: ago(5), completed_at: ago(2), is_offer_letter: true },
      { application_id: "a4", created_at: ago(5), completed_at: ago(2), is_offer_letter: false },
    ],
    checkins: [
      { application_id: "a5", due_on: "2026-10-20", sent_at: ago(8), responded_at: null, still_employed: null },
      { application_id: "a5", due_on: "2026-11-20", sent_at: null, responded_at: null, still_employed: null },
    ],
  };
  it("counts the last 7 days for one store only", () => {
    expect(storeWeek(stores[0]!, rows, NOW)).toEqual({
      storeId: "s1",
      storeName: "ABC Ford",
      newApplicants: 2,
      waitingOnManager: 1,
      needsAttention: 1,
      interviewsHeld: 1,
      interviewsAhead: 1,
      offersSent: 1,
      offersSigned: 1,
      hires: 1,
      checkinsWaiting: 1,
      leftAtCheckin: 0,
    });
    expect(storeWeek(stores[1]!, rows, NOW).newApplicants).toBe(1);
  });
  it("leaves out zeros and says when a week was quiet", () => {
    const quiet = storeWeek(stores[2]!, rows, NOW);
    expect(storeLines(quiet)).toEqual(["Quiet week: nothing new."]);
    expect(storeLines({ ...quiet, newApplicants: 1, hires: 2 })).toEqual(["1 new applicant", "2 new hires"]);
  });
});

describe("summary email", () => {
  it("has a headline, a section per store and a link when people are waiting", () => {
    const base = storeWeek(stores[2]!, { apps: [], interviews: [], offers: [], checkins: [] }, NOW);
    const email = summaryEmail({
      groupName: "ABC Auto Group",
      weekOf: "2026-10-26",
      appUrl: "https://workwithwerk.com",
      stores: [
        { ...base, storeName: "ABC Ford", newApplicants: 3, waitingOnManager: 1 },
        { ...base, storeName: "ABC Toyota", hires: 1 },
      ],
    });
    expect(email.subject).toBe("Your hiring week: 3 new applicants · 0 interviews coming up · 1 hire");
    expect(email.body).toContain("week of Oct 26");
    expect(email.body).toContain("ABC Ford\n• 3 new applicants\n• 1 candidate waiting on a hiring manager decision");
    expect(email.body).toContain("ABC Toyota\n• 1 new hire");
    expect(email.body).toContain("1 candidate is waiting on someone. Open hireme to take a look: https://workwithwerk.com/applicants");
  });
});
