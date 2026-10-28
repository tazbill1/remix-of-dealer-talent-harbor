import { describe, expect, it } from "vitest";
import { cleanScanCode, scanDestination, scanLink } from "@/lib/scan";

describe("QR scans", () => {
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
