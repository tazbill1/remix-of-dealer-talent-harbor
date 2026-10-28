import { describe, expect, it } from "vitest";
import { SOURCE_CHANNELS, isSourceChannel, sourceReport } from "@/lib/sources";

describe("applicant sources", () => {
  it("has the client's 9 sources", () => {
    expect(SOURCE_CHANNELS).toEqual(["Indeed", "ZipRecruiter", "Company website", "Employee referral", "Event", "Store QR code", "Walk-in", "Manual entry", "Other"]);
    expect(isSourceChannel("indeed")).toBe(false);
  });
  const rows = [
    { store_id: null, source: "Indeed", applicants: 4, hires: 1, org_total: true },
    { store_id: "s1", source: "Indeed", applicants: 3, hires: 1, org_total: false },
    { store_id: "s2", source: "Indeed", applicants: 1, hires: 0, org_total: false },
  ];
  it("computes hire rate for the group", () => expect(sourceReport(rows, "all")).toEqual([{ source: "Indeed", applicants: 4, hires: 1, hireRate: 25 }]));
  it("filters to one store", () => expect(sourceReport(rows, "s1")[0]?.hireRate).toBe(33));
});
