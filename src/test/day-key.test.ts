import { describe, expect, it } from "vitest";
import { dayKey, filterApplicants } from "@/lib/applicant-filters";

describe("applied today uses the store's time zone", () => {
  // 03:00 UTC on Oct 29 is still Oct 28 evening in Chicago.
  const now = Date.parse("2026-10-29T03:00:00Z");
  const app = { full_name: "A", email: "", phone: null, job_id: "j", source: "x", created_at: "2026-10-28T20:00:00Z", needs_attention: null };
  it("counts an evening applicant as today in Chicago", () => {
    expect(dayKey(now, "America/Chicago")).toBe("2026-10-28");
    expect(filterApplicants([app], { applied: "today", timeZone: "America/Chicago" }, () => "", now)).toHaveLength(1);
  });
  it("does not count it as today in Tokyo", () => {
    expect(filterApplicants([app], { applied: "today", timeZone: "Asia/Tokyo" }, () => "", now)).toHaveLength(0);
  });
});
