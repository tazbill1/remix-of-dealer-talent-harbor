import { describe, expect, it } from "vitest";
import { bonusesToAlert, cleanCode, matchTypedReferrer, referralBadge, referralLink, referralReport } from "@/lib/referrals";

const refs = [
  { id: "r1", employee_name: "Dana Smith", store_id: "s1", active: true, referral_code: "AB12CD34" },
  { id: "r2", employee_name: "Old Timer", store_id: null, active: false, referral_code: "ZZ99ZZ99" },
];

describe("referrals", () => {
  it("builds the personal link with ?ref= and tags QR scans", () => {
    expect(referralLink("https://workwithwerk.com", "abc-motors", "AB12CD34")).toBe("https://workwithwerk.com/c/abc-motors?ref=AB12CD34");
    expect(referralLink("https://workwithwerk.com", "abc-motors", "AB12CD34", "qr")).toBe("https://workwithwerk.com/c/abc-motors?ref=AB12CD34&via=qr");
    expect(cleanCode(" ab12cd34 ")).toBe("AB12CD34");
    expect(cleanCode("x")).toBeNull();
  });

  it("links a typed name only to one active matching referrer", () => {
    expect(matchTypedReferrer("  dana   smith", refs)?.id).toBe("r1");
    expect(matchTypedReferrer("Old Timer", refs)).toBeNull();
    expect(matchTypedReferrer("Someone Else", refs)).toBeNull();
  });

  it("shows unmatched typed names for HR to link", () => {
    const names = new Map([["r1", "Dana Smith"]]);
    expect(referralBadge({ referrer_id: "r1", referred_by_text: null }, names)).toEqual({ label: "Referred by Dana Smith", linked: true });
    expect(referralBadge({ referrer_id: null, referred_by_text: "Bob" }, names)).toEqual({ label: 'Referred by "Bob"', linked: false });
    expect(referralBadge({ referrer_id: null, referred_by_text: null }, names)).toBeNull();
  });

  it("reports hire rate by employee and store vs other sources", () => {
    const base = { source: "careers", referred_by_text: null, full_name: "x", dealership_id: "s1" };
    const r = referralReport([
      { ...base, id: "a", status: "hired", referrer_id: "r1" },
      { ...base, id: "b", status: "new", referrer_id: "r1" },
      { ...base, id: "c", status: "hired", referrer_id: null },
      { ...base, id: "d", status: "new", referrer_id: null },
      { ...base, id: "e", status: "new", referrer_id: null },
      { ...base, id: "f", status: "new", referrer_id: null },
    ], refs, [{ id: "s1", name: "LG Ford" }]);
    expect(r.byEmployee).toEqual([{ key: "r1", label: "Dana Smith", referrals: 2, hires: 1, rate: 50 }]);
    expect(r.byStore[0]).toMatchObject({ label: "LG Ford", referrals: 2, hires: 1, rate: 50 });
    expect(r.vsOther).toEqual([
      { key: "referral", label: "Employee referrals", referrals: 2, hires: 1, rate: 50 },
      { key: "other", label: "All other sources", referrals: 4, hires: 1, rate: 25 },
    ]);
  });

  it("alerts once for pending bonuses that are due", () => {
    const b = [
      { id: 1, status: "pending", due_date: "2026-10-28", due_notified_at: null },
      { id: 2, status: "pending", due_date: "2026-10-29", due_notified_at: null },
      { id: 3, status: "paid", due_date: "2026-10-01", due_notified_at: null },
      { id: 4, status: "pending", due_date: "2026-10-01", due_notified_at: "2026-10-01" },
    ];
    expect(bonusesToAlert(b, "2026-10-28").map((x) => x.id)).toEqual([1]);
  });
});
