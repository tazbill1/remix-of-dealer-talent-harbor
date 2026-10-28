import { describe, expect, it } from "vitest";
import { interviewInviteKey, interviewRecipient } from "@/lib/interview-invite";
import { buildIcs } from "@/lib/calendar-feed";
import { interviewInviteToken, readInterviewInviteToken } from "@/lib/interview-invite-token.server";

const interviewId = "0555ae45-5317-47d1-988c-9ff2ac68d4a7";
const memberId = "11111111-1111-4111-8111-111111111111";
describe("one staff invite per interview event", () => {
  it("chooses the store's single interviewer", () => {
    expect(interviewRecipient([{ id: memberId, email: "STAFF@example.com" }])).toEqual({ id: memberId, email: "staff@example.com" });
  });
  it("never guesses when several interviewers cover the store", () => {
    expect(interviewRecipient([{ id: memberId, email: "one@example.com" }, { id: interviewId, email: "two@example.com" }])).toBeNull();
  });
  it("skips missing or invalid staff addresses", () => {
    expect(interviewRecipient([])).toBeNull();
    expect(interviewRecipient([{ id: memberId, email: "invalid" }])).toBeNull();
  });
  it("dedupes retries but a moved time is a new event", () => {
    expect(interviewInviteKey(interviewId, "2026-10-28T15:00:00Z", memberId)).toBe(interviewInviteKey(interviewId, "2026-10-28T15:00:00.000Z", memberId));
    expect(interviewInviteKey(interviewId, "2026-10-28T16:00:00Z", memberId)).not.toBe(interviewInviteKey(interviewId, "2026-10-28T15:00:00Z", memberId));
  });
  it("download tokens are signed, member-bound and expire", () => {
    process.env["CALENDAR_FEED_SECRET"] = "test-only";
    const token = interviewInviteToken(interviewId, memberId, "2026-10-28T15:00:00Z");
    expect(readInterviewInviteToken(token + ".ics", Date.parse("2026-10-28T14:00:00Z"))).toMatchObject({ interviewId, memberId });
    expect(readInterviewInviteToken(token + "x")).toBeNull();
    expect(readInterviewInviteToken(token, Date.parse("2026-11-05T15:00:00Z"))).toBeNull();
  });
  it("calendar file has the actual time and duration, including cancelled status", () => {
    const file = buildIcs("Interview", [{ id: interviewId, title: "Interview", startsAt: "2026-10-28T15:00:00Z", durationMin: 30, status: "cancelled", location: "Store", description: "" }]);
    expect(file).toContain("DTSTART:20261028T150000Z");
    expect(file).toContain("DTEND:20261028T153000Z");
    expect(file).toContain("STATUS:CANCELLED");
  });
});