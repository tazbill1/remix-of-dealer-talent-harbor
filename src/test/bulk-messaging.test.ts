import { describe, expect, it } from "vitest";
import { canSendBulk, summarizeBulkEligibility } from "@/lib/bulk-messaging";
import { canSeeNav } from "@/lib/nav";

describe("bulk messaging screens", () => {
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