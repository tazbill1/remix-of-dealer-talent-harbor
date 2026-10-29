import { describe, expect, it } from "vitest";
import { referralBonusDisplay } from "@/lib/referral-bonus-display";
const base = { referred: true, hired: false, hiredDate: null, startDate: null, tierId: "tier2", jobTitle: "Manager",
  tiers: [{ id: "tier2", name: "Tier 2", amount: 500, covers: ["Manager"], excludes: [], is_default: false, sort_order: 1 }], payoutDays: 90, saved: null };
describe("staff referral bonus display", () => {
  it("uses the job tier amount and org payout days before hire", () => {
    expect(referralBonusDisplay(base)).toMatchObject({ amount: 500, days: 90 });
    expect(referralBonusDisplay({ ...base, payoutDays: 60 })).toMatchObject({ amount: 500, days: 60 });
  });
  it("keeps the recorded hire amount and payout date even when tier settings change", () => {
    expect(referralBonusDisplay({ ...base, hired: true, hiredDate: "2026-10-01T12:00:00Z", payoutDays: 60,
      saved: { amount: 250, due_date: "2026-12-30", status: "pending", ineligible_reason: null } })).toMatchObject({ amount: 250, days: 90 });
  });
  it("shows nothing for non-referred applicants", () => {
    expect(referralBonusDisplay({ ...base, referred: false })).toBeNull();
  });
  it("never substitutes a current tier for a missing hire record", () => {
    expect(referralBonusDisplay({ ...base, hired: true })?.amount).toBeNull();
  });
});