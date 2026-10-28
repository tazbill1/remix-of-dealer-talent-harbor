import { describe, expect, it } from "vitest";
import { parseLinks, rankCandidates, safeApplicant, type ApplicantRow } from "@/lib/gm-assistant";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const app = (id: string, over: Partial<ApplicantRow> = {}): ApplicantRow => ({
  id,
  full_name: `Person ${id}`,
  status: "new",
  rating: 3,
  created_at: "2026-10-20T12:00:00Z",
  knockout_failed: false,
  ai_summary: null,
  jobs: { title: "Service Advisor", department: "Service" },
  dealerships: { name: "Lansing Ford" },
  ...over,
});
const card = (application_id: string, recommendation: string) => ({
  application_id,
  answers: {},
  recommendation,
  submitted_at: "2026-10-25T12:00:00Z",
});

describe("rankCandidates", () => {
  it("puts interview feedback and rating first and drops closed applicants", () => {
    const rows = [
      app("a", { rating: 3 }),
      app("b", { rating: 5 }),
      app("c", { rating: 3, status: "interview" }),
      app("d", { rating: 5, status: "hired" }),
      app("e", { rating: 5, knockout_failed: true }),
    ];
    const ranked = rankCandidates(rows, [card("c", "hire")], NOW).map((r) => r.id);
    expect(ranked).toEqual(["c", "b", "a", "e"]);
  });

  it("prefers recent applicants when everything else is equal", () => {
    const ranked = rankCandidates(
      [app("old", { created_at: "2026-08-01T00:00:00Z" }), app("new", { created_at: "2026-10-27T00:00:00Z" })],
      [],
      NOW,
    );
    expect(ranked[0]?.id).toBe("new");
  });
});

it("safeApplicant never carries contact details", () => {
  const row = { ...app("a"), phone: "+13135550142", email: "a@b.com" } as ApplicantRow;
  const s = safeApplicant(row, [card("a", "hire")]);
  expect(JSON.stringify(s)).not.toMatch(/3135550142|a@b\.com/);
  expect(s).toMatchObject({ role: "Service Advisor", store: "Lansing Ford", link: "/applicants?applicant=a" });
  expect(s.scorecards).toMatchObject({ submitted: 1, hire: 1 });
});

it("parseLinks turns in-app markdown links into links and leaves other text", () => {
  expect(parseLinks("Try [Sam](/applicants?applicant=1) or [x](https://evil.com).")).toEqual([
    { text: "Try " },
    { text: "Sam", href: "/applicants?applicant=1" },
    { text: " or [x](https://evil.com)." },
  ]);
});
