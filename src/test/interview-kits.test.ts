import { describe, expect, it } from "vitest";
import {
  STARTER_KITS,
  answersFor,
  averageScore,
  kitQuestionSchema,
  parseAnswers,
  parseKitQuestions,
  submitProblem,
  summarizeScorecards,
} from "@/lib/interview-kits";

const qs = [
  { id: "q_a", text: "Tell me about a sale." },
  { id: "q_b", text: "How do you follow up?", lookFor: "A system" },
];

describe("interview kits", () => {
  it("keeps good questions and drops broken ones", () => {
    expect(
      parseKitQuestions([...qs, { id: "BAD ID", text: "x" }, "nope", { id: "q_c", text: "" }]),
    ).toEqual(qs);
    expect(parseKitQuestions(null)).toEqual([]);
  });
  it("ships starter kits that pass validation", () => {
    for (const k of STARTER_KITS)
      for (const q of k.questions)
        expect(kitQuestionSchema.safeParse({ ...q, id: "q_x" }).success).toBe(true);
  });
});

describe("scorecards", () => {
  it("lines answers up with the kit and keeps what was filled in", () => {
    const a = answersFor(qs, [
      { questionId: "q_b", score: 4, note: "CRM" },
      { questionId: "gone", score: 1, note: "" },
    ]);
    expect(a).toEqual([
      { questionId: "q_a", score: null, note: "" },
      { questionId: "q_b", score: 4, note: "CRM" },
    ]);
  });
  it("needs every question scored and a hire/maybe/no to submit", () => {
    const blank = answersFor(qs, []);
    expect(submitProblem(qs, blank, "hire")).toMatch(/2 left/);
    const done = blank.map((a) => ({ ...a, score: 3 }));
    expect(submitProblem(qs, done, null)).toMatch(/hire, maybe or no/);
    expect(submitProblem(qs, done, "great")).toMatch(/hire, maybe or no/);
    expect(submitProblem(qs, done, "maybe")).toBeNull();
    expect(submitProblem([], [], "no")).toBeNull();
  });
  it("ignores bad scores when reading answers back", () => {
    expect(
      parseAnswers([
        { questionId: "q_a", score: 9, note: "" },
        { questionId: "q_b", score: 2 },
      ]),
    ).toEqual([{ questionId: "q_b", score: 2, note: "" }]);
  });
  it("averages scored questions only", () => {
    expect(
      averageScore([
        { questionId: "a", score: 4, note: "" },
        { questionId: "b", score: 5, note: "" },
        { questionId: "c", score: null, note: "" },
      ]),
    ).toBe(4.5);
    expect(averageScore([])).toBeNull();
  });
  it("rolls up submitted cards and skips drafts", () => {
    const s = summarizeScorecards([
      {
        answers: [{ questionId: "a", score: 4, note: "" }],
        recommendation: "hire",
        submitted_at: "2026-10-28T00:00:00Z",
      },
      {
        answers: [
          { questionId: "a", score: 3, note: "" },
          { questionId: "b", score: 2, note: "" },
        ],
        recommendation: "maybe",
        submitted_at: "2026-10-28T00:00:00Z",
      },
      {
        answers: [{ questionId: "a", score: 1, note: "" }],
        recommendation: "no",
        submitted_at: null,
      },
    ]);
    expect(s).toEqual({ submitted: 2, average: 3.3, hire: 1, maybe: 1, no: 0 });
  });
});
