import { describe, expect, it } from "vitest";
import { canAccept, inviteEmail, inviteInput, inviteStatus, isScopedRole } from "@/lib/invites";

const org = "11111111-1111-4111-8111-111111111111";
const store = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-27T12:00:00Z");
const open = {
  email: "Dana@GRFord.com",
  expires_at: "2026-11-10T12:00:00Z",
  accepted_at: null,
  revoked_at: null,
};

describe("invites", () => {
  it("managers must be given at least one store or region; admins and HR see everything", () => {
    expect(isScopedRole("hiring_manager")).toBe(true);
    expect(isScopedRole("recruiter")).toBe(false);
    expect(
      inviteInput.safeParse({ orgId: org, email: "a@b.co", role: "hiring_manager" }).success,
    ).toBe(false);
    const ok = inviteInput.parse({
      orgId: org,
      email: "  Dana@GRFord.com ",
      role: "dealer_manager",
      scopes: [{ dealership_id: store }],
    });
    expect(ok.email).toBe("dana@grford.com");
    expect(inviteInput.safeParse({ orgId: org, email: "a@b.co", role: "recruiter" }).success).toBe(
      true,
    );
    // Only real store/region references, nothing else smuggled in.
    expect(
      inviteInput.safeParse({
        orgId: org,
        email: "a@b.co",
        role: "hiring_manager",
        scopes: [{ dealership_id: store, role: "group_admin" }],
      }).success,
    ).toBe(false);
  });

  it("knows when an invite is open, used, cancelled or expired", () => {
    expect(inviteStatus(open, now)).toBe("open");
    expect(inviteStatus({ ...open, accepted_at: "2026-10-28T00:00:00Z" }, now)).toBe("accepted");
    expect(inviteStatus({ ...open, revoked_at: "2026-10-28T00:00:00Z" }, now)).toBe("cancelled");
    expect(inviteStatus(open, Date.parse("2026-11-11T00:00:00Z"))).toBe("expired");
  });

  it("only the invited email can accept, ignoring case", () => {
    expect(canAccept(open, "dana@grford.com", now)).toEqual({ ok: true });
    const wrong = canAccept(open, "someone@else.com", now);
    expect(wrong.ok).toBe(false);
    expect(!wrong.ok && wrong.reason).toContain("Dana@GRFord.com");
    expect(canAccept(open, null, now).ok).toBe(false);
    expect(canAccept({ ...open, revoked_at: "x" }, "dana@grford.com", now).ok).toBe(false);
  });

  it("the invite email says who, what role, and where to click", () => {
    const m = inviteEmail({
      orgName: "ABC Motors",
      role: "hiring_manager",
      link: "https://x/invite/t",
      inviter: "tom@werkandme.com",
    });
    expect(m.subject).toBe("You're invited to ABC Motors on hireme");
    expect(m.text).toContain("tom@werkandme.com invited you");
    expect(m.text).toContain("Hiring manager");
    expect(m.text).toContain("https://x/invite/t");
  });
});
