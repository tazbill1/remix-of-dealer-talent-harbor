import { describe, expect, it } from "vitest";
import { aiDisclosureLine, isHumanRequest, withAiDisclosure } from "@/lib/ai-notice";
import { textFor, parseAutomations } from "@/lib/automations";
import { applicantEmail } from "@/lib/email/applicant-copy";

describe("AI disclosure", () => {
  it("first text carries the line before Reply STOP", () => {
    const t = textFor(parseAutomations({}), "welcome", { first: "Leah", store: "LG Ford Cincy", assistant: "Penny", job: "Advisor" })!;
    expect(t).toContain("I'm Penny, an AI assistant for LG Ford Cincy. A person on our team makes all hiring decisions. Reply HUMAN anytime to reach a person. Reply STOP to opt out.");
  });
  it("confirmation email carries the line", () => {
    const e = applicantEmail({ kind: "confirmation" }, { first: "Leah", job: "Advisor", store: "LG Ford Cincy", assistant: "Penny", statusUrl: "x", timezone: "America/Chicago" })!;
    expect(e.body).toContain(aiDisclosureLine("Penny", "LG Ford Cincy"));
  });
  it("is not added twice", () => {
    const once = withAiDisclosure("Hi.", "Penny", "S");
    expect(withAiDisclosure(once, "Penny", "S")).toBe(once);
  });
  it("recognizes HUMAN but not ordinary replies", () => {
    expect(isHumanRequest("human")).toBe(true);
    expect(isHumanRequest("HUMAN!")).toBe(true);
    expect(isHumanRequest("I have 3 years")).toBe(false);
  });
});
