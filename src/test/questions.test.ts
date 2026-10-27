import { describe, expect, it } from "vitest";
import {
  answersForAi,
  cleanAnswers,
  newQuestionId,
  parseQuestions,
  toPublic,
  unmet,
  verdict,
  type Question,
} from "@/lib/questions";

const qs: Question[] = [
  {
    id: "license",
    text: "Valid driver's license?",
    kind: "yes_no",
    required: true,
    rule: { equals: "yes" },
  },
  { id: "years", text: "Years of experience?", kind: "number", required: true, rule: { min: 2 } },
  {
    id: "start",
    text: "When could you start?",
    kind: "choice",
    options: ["Right away", "Later"],
    required: false,
    rule: { anyOf: ["Right away"] },
  },
  { id: "why", text: "Why this store?", kind: "text", required: false },
];

describe("knockout questions", () => {
  it("the public apply form never sees the requirements", () => {
    const pub = toPublic(qs);
    expect(pub.every((q) => !("rule" in q))).toBe(true);
    expect(JSON.stringify(pub)).not.toContain("equals");
  });

  it("requires answers and checks their type", () => {
    expect(() => cleanAnswers(qs, {})).toThrow("Please answer: Valid driver's license?");
    expect(() => cleanAnswers(qs, { license: "maybe", years: "3" })).toThrow("yes or no");
    expect(() => cleanAnswers(qs, { license: "yes", years: "lots" })).toThrow("number");
    expect(() => cleanAnswers(qs, { license: "yes", years: "3", start: "Never" })).toThrow(
      "pick an option",
    );
    expect(cleanAnswers(qs, { license: "yes", years: 3, extra: "ignored" })).toEqual({
      license: "yes",
      years: "3",
    });
  });

  it("flags unmet requirements without rejecting", () => {
    expect(unmet(qs, { license: "yes", years: "5", start: "Right away" })).toEqual([]);
    expect(unmet(qs, { license: "no", years: "1", start: "Later" })).toEqual([
      "Valid driver's license?",
      "Years of experience?",
      "When could you start?",
    ]);
    expect(verdict(qs[3]!, "Close to home")).toBe("info");
    expect(verdict(qs[2]!, undefined)).toBe("unanswered");
  });

  it("tells the assistant what was already answered", () => {
    const text = answersForAi(qs, { license: "no", years: "4" });
    expect(text).toContain("Valid driver's license? -> No (does not meet requirement)");
    expect(text).toContain("Years of experience? -> 4");
  });

  it("ignores malformed stored questions and makes unique ids", () => {
    expect(parseQuestions([{ id: "x", text: "" }])).toEqual([]);
    expect(parseQuestions(null)).toEqual([]);
    expect(newQuestionId("Do you have a valid driver's license?", [])).toBe(
      "do_you_have_a_valid_driver_s_l",
    );
    expect(newQuestionId("Own tools?", ["own_tools"])).toBe("own_tools_2");
  });
});
