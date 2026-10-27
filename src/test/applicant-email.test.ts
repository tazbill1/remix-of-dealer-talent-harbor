import { describe, expect, it } from "vitest";
import { applicantEmail, applicantEmailPurpose } from "@/lib/email/applicant-copy";

const a = { first: "Sam", job: "Technician", store: "ABC Motors", assistant: "Penny", statusUrl: "https://x/status/1", timezone: "America/Chicago" };

describe("applicant emails", () => {
  it("confirmation includes the status link", () => {
    expect(applicantEmail({ kind: "confirmation" }, a)!.body).toContain("https://x/status/1");
  });
  it("interview invite shows the time in the store's time zone", () => {
    const e = applicantEmail({ kind: "interview", startsAt: "2026-11-02T15:00:00.000Z" }, a)!;
    expect(e.body).toContain("9:00 AM");
  });
  it("no status email for New or Interview stage", () => {
    expect(applicantEmail({ kind: "status", status: "new" }, a)).toBeNull();
    expect(applicantEmail({ kind: "status", status: "interview" }, a)).toBeNull();
  });
  it("one purpose per event so emails are not repeated", () => {
    expect(applicantEmailPurpose({ kind: "status", status: "hired" })).toBe("email_status_hired");
    expect(applicantEmailPurpose({ kind: "interview", startsAt: "t1" })).not.toBe(
      applicantEmailPurpose({ kind: "interview", startsAt: "t2" }),
    );
  });
});
