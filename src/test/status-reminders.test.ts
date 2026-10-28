import { describe, expect, it } from "vitest";
import { NEVER_REMINDED, overdueInfo } from "@/lib/status-reminders";

const now = new Date("2026-10-28T18:00:00Z").getTime();
const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
const rules = [
  { status: "new", remind_after_days: 2, is_active: true },
  { status: "screening", remind_after_days: 3, is_active: true },
  { status: "interview", remind_after_days: 7, is_active: false },
];

describe("overdueInfo", () => {
  it("is overdue once days reach the limit", () => {
    expect(overdueInfo({ status: "screening", status_changed_at: ago(5) }, rules, now)).toEqual({ days: 5, label: "In Contacted 5 days" });
    expect(overdueInfo({ status: "new", status_changed_at: ago(2) }, rules, now)?.days).toBe(2);
  });
  it("is not overdue before the limit", () => {
    expect(overdueInfo({ status: "screening", status_changed_at: ago(2) }, rules, now)).toBeNull();
  });
  it("ignores switched-off rules", () => {
    expect(overdueInfo({ status: "interview", status_changed_at: ago(30) }, rules, now)).toBeNull();
  });
  it("never flags final stages", () => {
    expect(NEVER_REMINDED).toEqual(["hired", "rejected", "do_not_hire", "unqualified"]);
    expect(overdueInfo({ status: "hired", status_changed_at: ago(99) }, [{ status: "hired", remind_after_days: 1, is_active: true }], now)).toBeNull();
  });
});
