import { describe, expect, it } from "vitest";
import { checkinDays, compliant, hoursFor, parseAutomations, render, segments, textFor } from "@/lib/automations";

describe("automatic text wording", () => {
  it("fills in fields and drops optional parts with a blank field", () => {
    expect(render("Hi {first}![ Address: {address}.] Bye", { first: "Jane", address: "" })).toBe("Hi Jane! Bye");
    expect(render("Hi {first}![ Address: {address}.]", { first: "Jane", address: "1 Main St" })).toBe("Hi Jane! Address: 1 Main St.");
    expect(render("{name} applied.[ Fit: {rating}/5.]", { name: "Jane", rating: null })).toBe("Jane applied.");
  });
  it("uses the default unless the group changed it, and respects off", () => {
    const off = parseAutomations({ texts: { decline: { enabled: false } } });
    expect(textFor(off, "decline", { first: "Jane", job: "Porter", store: "ABC Ford" })).toBeNull();
    const custom = parseAutomations({ texts: { invite: { text: "Yo {first}, book here {link}" } } });
    expect(textFor(custom, "invite", { first: "Jane", link: "L" })).toBe("Yo Jane, book here L");
  });
  it("falls back to the default when a custom text needs a link that couldn't be made", () => {
    const custom = parseAutomations({ texts: { invite: { text: "Book: {link}" } } });
    expect(textFor(custom, "invite", { first: "Jane", store: "ABC", link: "" })).toBe(
      "Great news, Jane! The team at ABC would like to interview you. What days and times work best for you this week?",
    );
  });
  it("keeps carrier wording even if an edit removes it", () => {
    expect(compliant("nudge", "Ping about Jane")).toBe("hireme by WerkandMe: Ping about Jane");
    expect(compliant("welcome", "Hi Jane!")).toBe("Hi Jane! Reply STOP to opt out.");
    expect(compliant("decline", "Thanks Jane")).toBe("Thanks Jane");
  });
  it("clamps timing and check-in days", () => {
    expect(hoursFor(parseAutomations({ texts: { reminderDay: { hours: 500 } } }), "reminderDay")).toBe(72);
    expect(hoursFor(parseAutomations({}), "reminderSoon")).toBe(2);
    expect(checkinDays(parseAutomations({ checkinDays: [90, 7, 30, 7] }))).toEqual([7, 30, 90]);
    expect(checkinDays(parseAutomations(null))).toEqual([30, 60, 90]);
  });
  it("counts text segments", () => {
    expect(segments("x".repeat(160))).toBe(1);
    expect(segments("x".repeat(161))).toBe(2);
    expect(segments("Hi 😀")).toBe(1);
  });
});

describe("assistant settings", () => {
  it("uses safe defaults", async () => {
    const { assistantRules, parseAutomations } = await import("@/lib/automations");
    const r = assistantRules(parseAutomations({}), "candidate");
    expect(r).toContain("Bubbly");
    expect(r).toContain("never state or guess them");
    expect(r).toContain("Valid driver's license");
    expect(r).toContain("Negotiating pay");
    expect(r).toContain("protected traits");
  });
  it("uses the group's tone, facts, topics and instructions", async () => {
    const { assistantRules, parseAutomations } = await import("@/lib/automations");
    const a = parseAutomations({
      assistant: {
        tone: "professional",
        facts: "Techs earn $25-$40/hr flat rate. Medical after 60 days.",
        screening: "- Own tools?\n- Diesel experience",
        handoff: "Relocation",
        instructions: "Mention the $1,000 sign-on bonus.",
      },
    });
    const r = assistantRules(a, "candidate");
    expect(r).toContain("No emoji");
    expect(r).toContain("$25-$40/hr");
    expect(r).toContain("- Own tools?");
    expect(r).toContain("- Relocation");
    expect(r).toContain("sign-on bonus");
    const m = assistantRules(a, "manager");
    expect(m).not.toContain("$25-$40/hr");
    expect(m).toContain("sign-on bonus");
  });
  it("keeps assistant settings when texts are saved", async () => {
    const { parseAutomations } = await import("@/lib/automations");
    expect(parseAutomations({ texts: {}, assistant: { tone: "friendly" } }).assistant?.tone).toBe("friendly");
  });
});
