import { describe, expect, it } from "vitest";
import { bonusDueMessage, bonusTotals, drawingDate, quarterKey, referrerIneligible, suggestTier, type Tier } from "@/lib/referrals";

const t = (id: string, amount: number, covers: string[], excludes: string[] = [], is_default = false, sort_order = 0): Tier =>
  ({ id, name: id, amount, covers, excludes, is_default, sort_order });
const tiers = [
  t("tech", 1500, ["technician", "tech", "techs", "body shop", "collision", "painter", "paint"], ["lube", "oil"], false, 1),
  t("director", 1000, ["director"], [], false, 2),
  t("gm", 750, ["general manager", "general sales manager", "gm", "gsm"], [], false, 3),
  t("manager", 500, ["manager"], [], false, 4),
  t("other", 250, [], [], true, 5),
];
const EXCLUDED = ["Director", "General Manager", "GM", "General Sales Manager", "GSM", "Controller", "Corporate Manager", "Hiring Manager"];

describe("referral tiers", () => {
  it("suggests the tier from the job title", () => {
    expect(suggestTier("Service Technician", tiers)?.amount).toBe(1500);
    expect(suggestTier("Body Shop Painter", tiers)?.amount).toBe(1500);
    expect(suggestTier("Lube Tech", tiers)?.amount).toBe(250);
    expect(suggestTier("Oil Change Technician", tiers)?.amount).toBe(250);
    expect(suggestTier("Service Director", tiers)?.amount).toBe(1000);
    expect(suggestTier("General Sales Manager", tiers)?.amount).toBe(750);
    expect(suggestTier("F&I Manager", tiers)?.amount).toBe(500);
    expect(suggestTier("Sales Consultant", tiers)?.amount).toBe(250);
  });

  it("flags excluded referrer roles", () => {
    expect(referrerIneligible("General Manager", EXCLUDED)).toBe("Not eligible: referrer role (General Manager) is excluded");
    expect(referrerIneligible("Controller", EXCLUDED)).not.toBeNull();
    expect(referrerIneligible("Service Technician", EXCLUDED)).toBeNull();
    expect(referrerIneligible("Sales Manager", EXCLUDED)).toBeNull();
    expect(referrerIneligible(null, EXCLUDED)).toBeNull();
  });

  it("puts drawings on the last business day of the quarter", () => {
    expect(quarterKey("2027-01-26")).toBe("2027-Q1");
    expect(quarterKey("2026-12-31")).toBe("2026-Q4");
    expect(drawingDate("2027-Q1")).toBe("2027-03-31"); // Wednesday
    expect(drawingDate("2026-Q2")).toBe("2026-06-30");
    expect(drawingDate("2025-Q2")).toBe("2025-06-30");
    expect(drawingDate("2024-Q3")).toBe("2024-09-30");
    expect(drawingDate("2025-Q3")).toBe("2025-09-30");
    expect(drawingDate("2026-Q1")).toBe("2026-03-31");
    expect(drawingDate("2024-Q2")).toBe("2024-06-28"); // June 30 2024 was a Sunday
  });

  it("totals bonuses by tier and store per status", () => {
    const r = bonusTotals([
      { applicant_id: "a1", status: "pending", amount: 1500, tier_name: "Techs" },
      { applicant_id: "a2", status: "paid", amount: 1500, tier_name: "Techs" },
      { applicant_id: "a3", status: "not_eligible", amount: null, tier_name: "Manager" },
    ], new Map([["a1", "s1"], ["a2", "s1"], ["a3", "s2"]]), [{ id: "s1", name: "Dallas" }, { id: "s2", name: "Cincy" }]);
    const techs = r.byTier.find((x) => x.label === "Techs")!;
    expect(techs.pending).toEqual({ count: 1, amount: 1500 });
    expect(techs.paid).toEqual({ count: 1, amount: 1500 });
    expect(r.byStore.find((x) => x.label === "Cincy")!.not_eligible.count).toBe(1);
  });

  it("alerts HR when the bonus comes due", () => {
    expect(bonusDueMessage("Dana", "Pat", 90)).toBe("Referral bonus due (90 days): Dana for referring Pat.");
  });
});
