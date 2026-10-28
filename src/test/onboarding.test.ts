import { describe, expect, it } from "vitest";
import { fileProblem, isOverdue, onboardingPath, overdueCount, progress } from "@/lib/onboarding";

describe("onboarding rules", () => {
  it("counts only required items toward progress", () => {
    expect(progress([
      { required: true, completed_at: "x", due_date: null },
      { required: true, completed_at: null, due_date: null },
      { required: false, completed_at: "x", due_date: null },
    ])).toEqual({ done: 1, total: 2 });
  });
  it("flags undone items past their due date", () => {
    expect(isOverdue({ required: true, completed_at: null, due_date: "2026-10-27" }, "2026-10-28")).toBe(true);
    expect(isOverdue({ required: true, completed_at: null, due_date: "2026-10-28" }, "2026-10-28")).toBe(false);
    expect(isOverdue({ required: true, completed_at: "x", due_date: "2026-10-01" }, "2026-10-28")).toBe(false);
    expect(overdueCount([{ required: true, completed_at: null, due_date: "2026-10-01" }], "2026-10-28")).toBe(1);
  });
  it("accepts only PDF, JPG, PNG, DOC, DOCX up to 10 MB", () => {
    expect(fileProblem("w4.pdf", 1000)).toBeNull();
    expect(fileProblem("id.PNG", 1000)).toBeNull();
    expect(fileProblem("x.exe", 1000)).not.toBeNull();
    expect(fileProblem("big.pdf", 10 * 1024 * 1024 + 1)).not.toBeNull();
  });
  it("stores files under group then checklist", () => {
    expect(onboardingPath("o", "c", "i", "My W4.PDF", 5)).toBe("o/c/i-5.pdf");
  });
});
