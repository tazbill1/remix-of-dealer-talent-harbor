import { describe, expect, it } from "vitest";
import { BOARDS, jobLink, postText } from "@/lib/share";

describe("job share links", () => {
  it("tags each link with its board", () => {
    expect(jobLink("https://workwithwerk.com", "abc-motors", "j1", "linkedin")).toBe(
      "https://workwithwerk.com/c/abc-motors/jobs/j1?source=linkedin",
    );
  });
  it("leaves the source off when none is given", () => {
    expect(jobLink("https://workwithwerk.com", "abc-motors", "j1")).toBe(
      "https://workwithwerk.com/c/abc-motors/jobs/j1",
    );
  });
  it("keeps sources short enough for the job page (max 40)", () => {
    for (const b of BOARDS) expect(b.source.length).toBeLessThanOrEqual(40);
  });
  it("writes a post with pay when there is pay", () => {
    expect(postText({ title: "Service Tech", store: "ABC Ford", pay: "$25-$40/hr", link: "L" })).toBe(
      "We're hiring: Service Tech at ABC Ford! Pay: $25-$40/hr. Apply in a minute: L",
    );
    expect(postText({ title: "Porter", store: "ABC Ford", pay: null, link: "L" })).not.toContain("Pay");
  });
});
