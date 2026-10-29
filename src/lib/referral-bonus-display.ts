import { suggestTier, type Tier } from "@/lib/referrals";

type SavedBonus = { amount: number | null; due_date: string | null; status: string; ineligible_reason: string | null };
export function referralBonusDisplay(input: {
  referred: boolean; hired: boolean; hiredDate: string | null; startDate: string | null;
  tierId: string | null; jobTitle: string; tiers: Tier[]; payoutDays: number | null; saved: SavedBonus | null;
}) {
  if (!input.referred) return null;
  if (input.hired || input.saved) {
    if (!input.saved) return { amount: null, days: null, note: "No recorded referral bonus" };
    if (input.saved.status === "not_eligible") return { amount: null, days: null, note: input.saved.ineligible_reason || "Not eligible for a bonus" };
    const start = input.hiredDate?.slice(0, 10) ?? input.startDate;
    const days = start && input.saved.due_date
      ? Math.round((Date.parse(input.saved.due_date) - Date.parse(start)) / 86400000) : null;
    return { amount: input.saved.amount, days: days !== null && days > 0 ? days : null, note: null };
  }
  const tier = input.tierId ? input.tiers.find((t) => t.id === input.tierId) : suggestTier(input.jobTitle, input.tiers);
  return { amount: tier?.amount ?? null, days: input.payoutDays, note: tier ? null : "No referral bonus tier" };
}