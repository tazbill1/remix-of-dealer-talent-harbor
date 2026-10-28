import { describe, it, expect } from "vitest";
import { recordingConsentText, validSuggestions, RETENTION_DAYS } from "@/lib/interview-recording";
import { answersFor, submitProblem } from "@/lib/interview-kits";
describe("interview recording safeguards", () => {
  it("retention offers 30, 60, 90 and 180 days", () =>
    expect(RETENTION_DAYS).toEqual([30, 60, 90, 180]));
  it("consent contains the configured 90-day deletion promise", () =>
    expect(recordingConsentText(90)).toContain("audio is deleted after 90 days"));
  it("suggestions do not count as human scores", () => {
    const qs = [{ id: "q1", text: "Job question" }];
    const suggestions = validSuggestions(
      { suggestions: [{ questionId: "q1", score: 4, evidence: "I use CRM" }] },
      "I use CRM",
      ["q1"],
    );
    expect(suggestions).toHaveLength(1);
    expect(submitProblem(qs, answersFor(qs, []), "hire")).toBe(
      "Score every question first (1 left).",
    );
  });
  it("rejects invented quotes and out-of-range scores", () =>
    expect(
      validSuggestions(
        {
          suggestions: [
            { questionId: "q1", score: 4, evidence: "Invented" },
            { questionId: "q1", score: 6, evidence: "Real" },
          ],
        },
        "Real",
        ["q1"],
      ),
    ).toEqual([]));
});
