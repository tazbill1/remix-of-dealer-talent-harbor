import { describe, expect, it } from "vitest";
import {
  conversationForAi,
  keepSafeQuestions,
  protectedTopic,
  tailoredUserPrompt,
} from "@/lib/tailored-questions";

describe("protectedTopic", () => {
  it.each([
    "How old are you?",
    "What year did you graduate high school?",
    "Do you have kids at home?",
    "Who watches your children while you work?",
    "Are you married?",
    "Any health problems that would keep you off the line?",
    "Was the gap because of an injury?",
    "Which church do you go to?",
    "Where were you born?",
    "Are you a U.S. citizen?",
    "Have you ever been arrested?",
    "How much do you weigh?",
    "Are you planning to start a family?",
  ])("flags %s", (q) => expect(protectedTopic(q)).toBe(true));

  it.each([
    "You left Smith Ford after 8 months. What happened?",
    "How did you keep customers engaged during long repairs?",
    "Walk me through how you manage a busy write-up line.",
    "What were you doing between March and October 2025?",
    "You said by text you're ASE certified in brakes. Tell me about that.",
    "How do you deal with office politics?",
  ])("allows %s", (q) => expect(protectedTopic(q)).toBe(false));
});

describe("keepSafeQuestions", () => {
  it("drops protected, duplicate and malformed questions and caps at 6", () => {
    const out = keepSafeQuestions({
      questions: [
        { text: "You left your last shop after 8 months. Why?", why: "8 months at Lansing Auto" },
        { text: "You left your last shop after 8 months, why?", why: "dup" },
        { text: "Do you have children?", why: "gap" },
        { text: "What were you doing in 2024?", why: "Gap after maternity leave" },
        { text: "x", why: "too short" },
        ...Array.from({ length: 8 }, (_, i) => ({ text: `Tell me about job number ${i}.`, why: "" })),
      ],
    });
    expect(out).toHaveLength(6);
    expect(out[0]?.text).toContain("8 months");
    expect(out.some((q) => /children|2024/.test(q.text))).toBe(false);
  });

  it("returns nothing for junk", () => {
    expect(keepSafeQuestions(null)).toEqual([]);
    expect(keepSafeQuestions({ questions: "nope" })).toEqual([]);
  });
});

describe("conversationForAi", () => {
  const lines = [
    { direction: "outbound", body: "Hi Sam!  Thanks for applying.", created_at: "2026-10-01T10:00:00Z" },
    { direction: "inbound", body: "Thanks, I have 5 years at a Honda store", created_at: "2026-10-01T10:05:00Z" },
    { direction: "outbound", body: "Great, when can you come in?", created_at: "2026-10-01T10:06:00Z" },
  ];
  it("labels speakers and keeps order", () => {
    expect(conversationForAi(lines, "Sam")).toBe(
      "Us: Hi Sam! Thanks for applying.\nSam: Thanks, I have 5 years at a Honda store\nUs: Great, when can you come in?",
    );
  });
  it("keeps the newest lines when it has to trim", () => {
    expect(conversationForAi(lines, "Sam", 40)).toBe("Us: Great, when can you come in?");
  });
});

describe("tailoredUserPrompt", () => {
  it("leaves out empty sections", () => {
    const p = tailoredUserPrompt({
      role: "Service technician",
      kitQuestions: ["Do you have your own tools?"],
      screening: "",
      profile: {},
      summary: null,
      conversation: "",
      resumeNote: "No resume on file.",
    });
    expect(p).toBe("Role: Service technician\n\nStandard kit questions (don't repeat):\n- Do you have your own tools?\n\nNo resume on file.");
  });
});
