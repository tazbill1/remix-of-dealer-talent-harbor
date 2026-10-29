import { describe, expect, it } from "vitest";
import { bulkConfirmationAllowed, canSendBulk, selectAllShown, summarizeBulkEligibility } from "@/lib/bulk-messaging";
import { canSeeNav } from "@/lib/nav";

describe("bulk messaging screens", () => {
  it("3 recipients do not require a typed count", () => {
    expect(bulkConfirmationAllowed(3, "")).toBe(true);
  });
  it("25 recipients require exactly 25", () => {
    expect(bulkConfirmationAllowed(25, "")).toBe(false);
    expect(bulkConfirmationAllowed(25, "24")).toBe(false);
    expect(bulkConfirmationAllowed(25, "25")).toBe(true);
  });
  it("30 recipients require exactly 30, not the number of channel deliveries", () => {
    expect(bulkConfirmationAllowed(30, "60")).toBe(false);
    expect(bulkConfirmationAllowed(30, "30")).toBe(true);
  });
  it("confirmation counts stores with actual recipients and separate channel skips", () => {
    const result = summarizeBulkEligibility([{ storeId: "a", email: null, text: null }, { storeId: "b", email: null, text: "Text opt-out" }, { storeId: "c", email: "Do Not Hire", text: "Do Not Hire" }], "both");
    expect(result.storeCount).toBe(2);
    expect(result.perChannel).toEqual([{ channel: "email", sending: 2, skipped: 1 }, { channel: "text", sending: 1, skipped: 2 }]);
  });
  it("Select all shown selects only the matching filtered/tab applicants", () => {
    expect(selectAllShown(["matched-1", "matched-2", "matched-1"], true)).toEqual(["matched-1", "matched-2"]);
  });
  it("clearing Select all shown clears selection", () => {
    expect(selectAllShown(["matched-1", "matched-2"], false)).toEqual([]);
  });
  it("hides sending when the setting is off", () => {
    expect(canSendBulk({ role: "group_admin", isPlatformAdmin: false }, false)).toBe(false);
  });
  it("regional leaders cannot send or see history", () => {
    const role = { role: "regional_leader", isPlatformAdmin: false };
    expect(canSendBulk(role, true)).toBe(false);
    expect(canSeeNav("/sent-messages", role)).toBe(false);
  });
  it("assigned-store staff have send and history controls", () => {
    for (const role of ["dealer_manager", "hiring_manager", "recruiter", "group_admin"]) {
      expect(canSendBulk({ role, isPlatformAdmin: false }, true)).toBe(true);
      expect(canSeeNav("/sent-messages", { role, isPlatformAdmin: false })).toBe(true);
    }
  });
  it("shows 23 of 27 with 2 opt-outs and 2 Do Not Hire", () => {
    const summary = summarizeBulkEligibility([...Array.from({ length: 23 }, () => ({ text: null })), { text: "Text opt-out" }, { text: "Text opt-out" }, { text: "Do Not Hire" }, { text: "Do Not Hire" }], "text");
    expect(summary.eligible).toBe(23);
    expect(summary.skipped).toBe(4);
    expect(summary.reasons).toEqual({ "Text opt-out": 2, "Do Not Hire": 2 });
  });
  it("Both counts people once and reports separate channel eligibility", () => {
    const summary = summarizeBulkEligibility([{ email: null, text: "Text opt-out" }, { email: "Do Not Hire", text: "Do Not Hire" }, { email: null, text: null }], "both");
    expect(summary.eligible).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.perChannel).toEqual([{ channel: "email", sending: 2, skipped: 1 }, { channel: "text", sending: 1, skipped: 2 }]);
  });
});