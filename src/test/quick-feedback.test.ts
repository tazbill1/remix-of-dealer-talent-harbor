import { describe, it, expect } from "vitest";
import { feedbackProblem, type QuickFeedback } from "@/lib/quick-feedback";
const blank: QuickFeedback = { rating: null, onTime: null, experience: null, culture: null, recommend: null, recommendation: null, notes: "" };
describe("quick feedback rules", () => {
  it("accepts overall ratings 1 to 5 only", () => {
    for (const rating of [1,2,3,4,5]) expect(feedbackProblem({ ...blank, rating })).toBeNull();
    for (const rating of [0,6,2.5]) expect(feedbackProblem({ ...blank, rating })).not.toBeNull();
  });
  it("accepts Hire Maybe Pass only", () => {
    for (const recommendation of ["hire","maybe","pass"]) expect(feedbackProblem({ ...blank, recommendation })).toBeNull();
    expect(feedbackProblem({ ...blank, recommendation: "reject" })).not.toBeNull();
  });
  it("allows partial feedback to autosave", () => expect(feedbackProblem({ ...blank, onTime: false })).toBeNull());
});