import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { emailInterviewStaff } from "@/lib/email/interview-staff.server";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: send }));
const ivId = "0555ae45-5317-47d1-988c-9ff2ac68d4a7";
const memberId = "11111111-1111-4111-8111-111111111111";
function fixture(mode = "live") {
  return fakeSupabase({
    interviews: [{ id: ivId, org_id: "org", application_id: "app", starts_at: "2026-11-02T15:00:00Z", duration_min: 30, status: "scheduled", location: "Store" }],
    applications: [{ id: "app", org_id: "org", full_name: "Test Applicant", job_id: "job", dealership_id: "store", needs_attention: null }],
    dealerships: [{ id: "store", org_id: "org", name: "Store", region_id: null, timezone: "America/Chicago" }],
    jobs: [{ id: "job", org_id: "org", title: "Advisor" }],
    org_members: [{ id: memberId, org_id: "org", role: "hiring_manager", email: "staff@example.com" }],
    org_member_scopes: [{ member_id: memberId, org_id: "org", dealership_id: "store", region_id: null }],
    messaging_settings: [{ org_id: "org", email_mode: mode, email_from_address: "penny@notify.workwithwerk.com" }],
    messages: [], email_opt_outs: [],
  });
}
beforeEach(() => {
  send.mockReset(); send.mockResolvedValue({ sent: true });
  process.env["PUBLIC_APP_URL"] = "https://workwithwerk.com";
  process.env["CALENDAR_FEED_SECRET"] = "test-only";
});
describe("staff booking email delivery", () => {
  it("sends exactly one fixed invite to the assigned interviewer, with calendar link and sender", async () => {
    const db = fixture();
    expect((await emailInterviewStaff(db.client, ivId)).status).toBe("sent");
    expect(send).toHaveBeenCalledWith("staff-interview", "staff@example.com", expect.objectContaining({ fromAddress: "penny@notify.workwithwerk.com", templateData: expect.objectContaining({ calendarUrl: expect.stringMatching(/^https:\/\/workwithwerk.com\/api\/public\/interview-invite\/.+\.ics$/), minutes: 30 }) }));
    await emailInterviewStaff(db.client, ivId);
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.tables['messages']?.[0]?.['party']).toBe("manager");
  });
  it("practice mode logs but does not send", async () => {
    expect((await emailInterviewStaff(fixture("practice").client, ivId)).status).toBe("simulated");
    expect(send).not.toHaveBeenCalled();
  });
  it("an unsubscribed staff address is not sent an invite", async () => {
    const db = fixture();
    db.tables['email_opt_outs']?.push({ id: "out", org_id: "org", email: "staff@example.com" });
    expect((await emailInterviewStaff(db.client, ivId)).status).toBe("blocked");
    expect(send).not.toHaveBeenCalled();
  });
  it("multiple interviewers flag attention without broadcasting", async () => {
    const db = fixture();
    db.tables['org_members']?.push({ id: "second", org_id: "org", role: "dealer_manager", email: "second@example.com" });
    db.tables['org_member_scopes']?.push({ member_id: "second", org_id: "org", dealership_id: "store", region_id: null });
    expect((await emailInterviewStaff(db.client, ivId)).status).toBe("skipped");
    expect(db.tables['applications']?.[0]?.['needs_attention']).toContain("recipient");
    expect(send).not.toHaveBeenCalled();
  });
  it("rescheduling sends updated event data and failures do not reject the booking", async () => {
    const db = fixture();
    await emailInterviewStaff(db.client, ivId, true);
    expect(send.mock.calls[0]?.[2]?.templateData.moved).toBe(true);
    send.mockRejectedValue(new Error("Sending unavailable"));
    const failed = fixture();
    expect((await emailInterviewStaff(failed.client, ivId)).status).toBe("failed");
    expect(failed.tables['interviews']?.[0]?.['status']).toBe("scheduled");
  });
});