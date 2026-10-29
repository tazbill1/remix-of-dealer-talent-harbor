import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/email/provider.server", () => ({
  EmailSendError: class extends Error {}, emailConfigured: vi.fn(), sendLovable: vi.fn(), unsubscribeToken: vi.fn(), withoutOurUnsubscribe: vi.fn(),
}));
import { sendLovable } from "@/lib/email/provider.server";
import { deliverEmail } from "@/lib/email/outbox.server";
describe("Demo email delivery", () => {
  it("records simulated delivery and timeline without calling a sending service", async () => {
    const update = vi.fn(); const insert = vi.fn();
    const sb = { from: (table: string) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      update: (row: unknown) => { update(row); return { eq: async () => ({}) }; },
      insert: async (row: unknown) => { insert(table, row); return {}; },
    }) };
    const status = await deliverEmail(sb as unknown as Parameters<typeof deliverEmail>[0],
      { id: "m", org_id: "abc", application_id: "a", to_email: "demo@example.com", subject: "Application received", body: "Thanks!", purpose: "application_confirmation" },
      { email_mode: "practice", email_from_name: null, email_reply_to: null, email_from_address: null });
    expect(status).toBe("simulated");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "simulated", provider: "practice" }));
    expect(insert).toHaveBeenCalledWith("application_events", expect.objectContaining({ org_id: "abc", application_id: "a", kind: "email" }));
    expect(sendLovable).not.toHaveBeenCalled();
  });
});