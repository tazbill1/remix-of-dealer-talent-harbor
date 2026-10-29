import { describe, expect, it } from "vitest";
import { followUpIndex, inCalendarWeek, matchesFollowUp } from "@/lib/applicant-follow-up";
import { filterApplicants } from "@/lib/applicant-filters";
import { listFilterPatch, listFilterSchema, normalizeListFilters } from "@/lib/applicant-list-filters";

const now = Date.parse("2026-10-29T12:00:00Z");
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();
const contact = { lastContacted: daysAgo(3), lastReply: null, interviewThisWeek: false };
describe("applicant follow-up rules", () => {
  it("no reply in 3+ days includes the 3-day boundary, not newer or replied-to contacts", () => {
    expect(matchesFollowUp(contact, { noReply: "3" }, now)).toBe(true);
    expect(matchesFollowUp({ ...contact, lastContacted: daysAgo(2) }, { noReply: "3" }, now)).toBe(false);
    expect(matchesFollowUp({ ...contact, lastReply: daysAgo(1) }, { noReply: "3" }, now)).toBe(false);
    expect(matchesFollowUp(undefined, { noReply: "3" }, now)).toBe(false);
  });
  it.each([3, 7, 14])("last contacted %i days excludes never and recent contacts", (days) => {
    expect(matchesFollowUp({ ...contact, lastContacted: daysAgo(days) }, { contacted: String(days) }, now)).toBe(true);
    expect(matchesFollowUp({ ...contact, lastContacted: daysAgo(days - 1) }, { contacted: String(days) }, now)).toBe(false);
    expect(matchesFollowUp(undefined, { contacted: String(days) }, now)).toBe(false);
  });
  it("never contacted is separate from older contact", () => {
    expect(matchesFollowUp(undefined, { contacted: "never" }, now)).toBe(true);
    expect(matchesFollowUp(contact, { contacted: "never" }, now)).toBe(false);
  });
  it("only sent/delivered/demo messages count; queued and failed do not", () => {
    const index = followUpIndex([
      { application_id: "a", direction: "outbound", status: "simulated", created_at: daysAgo(5), sent_at: daysAgo(5) },
      { application_id: "a", direction: "outbound", status: "queued", created_at: daysAgo(0), sent_at: null },
      { application_id: "a", direction: "outbound", status: "failed", created_at: daysAgo(0), sent_at: null },
    ], [], now);
    expect(index["a"]?.lastContacted).toBe(daysAgo(5));
  });
  it("this week includes same-day and earlier weekday interviews but excludes cancellation and next week", () => {
    const index = followUpIndex([], [
      { application_id: "today", starts_at: "2026-10-29T10:00:00Z", status: "scheduled" },
      { application_id: "cancelled", starts_at: "2026-10-30T10:00:00Z", status: "cancelled" },
      { application_id: "next", starts_at: "2026-11-02T10:00:00Z", status: "scheduled" },
    ], now, () => "America/Chicago");
    expect(matchesFollowUp(index["today"], { interviewWeek: true }, now)).toBe(true);
    expect(matchesFollowUp(index["cancelled"], { interviewWeek: true }, now)).toBe(false);
    expect(matchesFollowUp(index["next"], { interviewWeek: true }, now)).toBe(false);
    expect(inCalendarWeek("2026-10-26T00:30:00Z", now, "America/Chicago")).toBe(false);
  });
  it("this month is a calendar month rather than trailing 30 days", () => {
    const apps = ["2026-09-30", "2026-10-01", "2026-10-29"].map((date) => ({ full_name: date, email: "", phone: null, job_id: "j", source: "indeed", created_at: date + "T12:00:00Z", needs_attention: null }));
    expect(filterApplicants(apps, { applied: "month", timeZone: "America/Chicago" }, () => "Tech", now).map((a) => a.full_name)).toEqual(["2026-10-01", "2026-10-29"]);
  });
});

const catalog = { stores: [{ id: "dallas", name: "ABC Motors Dallas", brand: null }], jobs: [{ id: "tech", title: "Technician", dealership_id: "dallas" }], regions: [], sources: ["indeed"] };
const empty = { status: null, stores: [], jobs: [], region: null, source: null, query: null, applied: null, contacted: null, noReply: null, interviewWeek: false, overdue: false, attention: false, unmapped: [] };
describe("list AI filter-only contract", () => {
  it("rejects selection, applicant IDs and messaging actions", () => {
    for (const extra of [{ applicantIds: ["a"] }, { selectAll: true }, { sendMessage: true }]) expect(listFilterSchema.safeParse({ ...empty, ...extra }).success).toBe(false);
  });
  it("only accepts stores and jobs in the authenticated catalog, explaining unmapped parts", () => {
    const normalized = normalizeListFilters({ ...empty, stores: ["dallas", "forbidden"], jobs: ["outside"], applied: "month" }, catalog);
    expect(normalized.stores).toEqual(["dallas"]); expect(normalized.jobs).toEqual([]);
    expect(normalized.unmapped).toHaveLength(2); expect(normalized.applied).toBe("month");
  });
  it("maps a 5-day no-reply request separately from last-contacted and never creates action fields", () => {
    const patch = listFilterPatch({ ...empty, status: "interview", stores: ["dallas"], noReply: 5 });
    expect(patch.status).toBe("interview"); expect(patch.store).toBe("dallas"); expect(patch.noReply).toBe("5"); expect(patch.contacted).toBeUndefined();
    expect(Object.keys(patch)).not.toContain("applicant"); expect(Object.keys(patch)).not.toContain("selected");
  });
});