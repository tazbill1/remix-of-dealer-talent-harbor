import { describe, expect, it } from "vitest";
import { applicationScan, cleanScanCode, scanDestination, scanLink } from "@/lib/scan";

describe("QR scans", () => {
  it("explicit Indeed source overrides a remembered store scan", () => {
    expect(applicationScan("indeed", undefined, "6A9608F6")).toBeUndefined();
  });
  it("uses the remembered scan only when the current URL has no source", () => {
    expect(applicationScan(undefined, undefined, "6A9608F6")).toBe("6A9608F6");
    expect(applicationScan("", undefined, "6A9608F6")).toBeUndefined();
  });
  it("preserves the current event QR scan over remembered history", () => {
    expect(applicationScan(undefined, "AB12CD34", "6A9608F6")).toBe("AB12CD34");
    expect(applicationScan("event", "AB12CD34", "6A9608F6")).toBe("AB12CD34");
  });
  it("builds short links", () => {
    expect(scanLink("https://x.com", "event", "AB12CD34")).toBe("https://x.com/e/AB12CD34");
    expect(scanLink("https://x.com", "store", "6A9608F6")).toBe("https://x.com/s/6A9608F6");
  });
  it("cleans codes", () => {
    expect(cleanScanCode(" ab12cd34 ")).toBe("AB12CD34");
    expect(cleanScanCode("../x")).toBeNull();
  });
  it("lands on the event job, else store jobs, else group jobs", () => {
    expect(scanDestination({ kind: "event", orgSlug: "g", storeId: "s", jobId: "j" })).toEqual({ to: "job", orgSlug: "g", jobId: "j" });
    expect(scanDestination({ kind: "event", orgSlug: "g", storeId: "s", jobId: null })).toEqual({ to: "careers", orgSlug: "g", storeId: "s" });
    expect(scanDestination({ kind: "event", orgSlug: "g", storeId: null, jobId: null })).toEqual({ to: "careers", orgSlug: "g" });
  });
});
