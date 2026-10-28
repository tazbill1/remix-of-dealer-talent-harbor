import { describe, expect, it } from "vitest";
import { firstName, profileUrl, scrubPii, threadHistory, withInbound } from "@/lib/assistant-style";

describe("threadHistory", () => {
  const rows = [
    { party: "candidate", direction: "out", body: "Hi Sam, thanks for applying!" },
    { party: "manager", direction: "out", body: "New applicant: Sam" },
    { party: "candidate", direction: "in", body: "hey" },
    { party: "candidate", direction: "in", body: "is it full time?" },
    { party: "manager", direction: "in", body: "1" },
    { party: "candidate", direction: "out", body: "blocked text", status: "blocked" },
    { party: "candidate", direction: "out", body: "Yes, it's full time." },
  ];

  it("keeps only the requested conversation, without thread tags", () => {
    expect(threadHistory(rows, "candidate")).toEqual([
      { role: "assistant", content: "Hi Sam, thanks for applying!" },
      { role: "user", content: "hey\nis it full time?" },
      { role: "assistant", content: "Yes, it's full time." },
    ]);
    expect(threadHistory(rows, "manager")).toEqual([
      { role: "assistant", content: "New applicant: Sam" },
      { role: "user", content: "1" },
    ]);
  });

  it("keeps the most recent turns", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      party: "candidate",
      direction: i % 2 ? "in" : "out",
      body: `m${i}`,
    }));
    const h = threadHistory(many, "candidate", 10);
    expect(h).toHaveLength(10);
    expect(h[9]?.content).toBe("m49");
  });

  it("adds the new text as its own turn or joins a trailing one", () => {
    expect(withInbound([{ role: "assistant", content: "a" }], "b")).toHaveLength(2);
    expect(withInbound([{ role: "user", content: "a" }], "b")).toEqual([{ role: "user", content: "a\nb" }]);
  });
});

describe("scrubPii", () => {
  it("removes contact details, SSNs and street addresses", () => {
    const r = scrubPii(
      "Sam is at sam.jones@gmail.com or (313) 555-0142, lives at 1234 N Main St Apt 4, SSN 123-45-6789.",
    );
    expect(r.removed).toBe(true);
    expect(r.text).not.toMatch(/gmail|555|Main St|6789/);
  });

  it("leaves links, times and normal texts alone", () => {
    const link = profileUrl("https://workwithwerk.com/", "1b2c3d44-5555-6666-7777-888899990000");
    const text = `Sam's interview is Tue 10/29 at 2:30 PM. 4 years as a tech. Details: ${link}`;
    expect(scrubPii(text)).toEqual({ text, removed: false });
    expect(link).toBe("https://workwithwerk.com/applicants?applicant=1b2c3d44-5555-6666-7777-888899990000");
  });
});

it("firstName", () => {
  expect(firstName("  Sam  Jones ")).toBe("Sam");
  expect(firstName(null)).toBe("the applicant");
});
