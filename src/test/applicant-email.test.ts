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

describe("interview emails with the booking link", () => {
  const a = { first: "Jane", job: "Porter", store: "ABC Ford", assistant: "Ava", statusUrl: "https://x/status/1", timezone: "America/Chicago" };
  it("invites them to pick a time", async () => {
    const { applicantEmail } = await import("@/lib/email/applicant-copy");
    const e = applicantEmail({ kind: "interview", startsAt: null }, { ...a, bookingUrl: "https://x/book/t" })!;
    expect(e.body).toContain("Pick a time that works for you here");
    expect(e.body).toContain("https://x/book/t");
  });
  it("offers to change a booked time", async () => {
    const { applicantEmail } = await import("@/lib/email/applicant-copy");
    const e = applicantEmail({ kind: "interview", startsAt: "2026-11-02T15:00:00.000Z" }, { ...a, bookingUrl: "https://x/book/t" })!;
    expect(e.body).toContain("Need a different time?");
  });
  it("falls back to the old wording without a link", async () => {
    const { applicantEmail } = await import("@/lib/email/applicant-copy");
    expect(applicantEmail({ kind: "interview", startsAt: null }, a)!.body).toContain("We'll reach out shortly");
  });
});
