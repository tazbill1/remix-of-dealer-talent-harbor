import { describe, expect, it } from "vitest";
import { filterApplicants, sortApplicants } from "@/lib/applicant-filters";

const NOW = new Date("2026-10-28T12:00:00").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 3600e3).toISOString();

const apps = [
  { full_name: "Marcus Webb", email: "marcus@example.com", phone: "555-0101", job_id: "j1", source: "indeed", created_at: daysAgo(0), needs_attention: null, status: "interview", rating: 4, dealership_id: "s1" },
  { full_name: "Alicia Freeman", email: "alicia@example.com", phone: null, job_id: "j2", source: "own_site", created_at: daysAgo(3), needs_attention: "No reply", status: "screening", rating: null, dealership_id: "s2" },
  { full_name: "Derek Boone", email: "derek@example.com", phone: "555-0199", job_id: "j1", source: "referral", created_at: daysAgo(20), needs_attention: null, status: "new", rating: 5, dealership_id: "s1" },
];
const jobTitle = (id: string) => ({ j1: "Sales Consultant", j2: "Service Advisor" })[id] ?? "";
const storeName = (id: string) => ({ s1: "Dallas", s2: "Plano" })[id] ?? "";

describe("filterApplicants", () => {
  it("matches search text against name, email, phone and job title", () => {
    expect(filterApplicants(apps, { q: "marcus" }, jobTitle, NOW).map((a) => a.full_name)).toEqual(["Marcus Webb"]);
    expect(filterApplicants(apps, { q: "555-0199" }, jobTitle, NOW).map((a) => a.full_name)).toEqual(["Derek Boone"]);
    expect(filterApplicants(apps, { q: "service advisor" }, jobTitle, NOW).map((a) => a.full_name)).toEqual(["Alicia Freeman"]);
  });
  it("combines job and source filters", () => {
    expect(filterApplicants(apps, { jobId: "j1", source: "referral" }, jobTitle, NOW).map((a) => a.full_name)).toEqual(["Derek Boone"]);
    expect(filterApplicants(apps, { jobId: "j1", source: "own_site" }, jobTitle, NOW)).toEqual([]);
  });
  it("filters by applied window", () => {
    expect(filterApplicants(apps, { applied: "today" }, jobTitle, NOW).map((a) => a.full_name)).toEqual(["Marcus Webb"]);
    expect(filterApplicants(apps, { applied: "7" }, jobTitle, NOW)).toHaveLength(2);
    expect(filterApplicants(apps, { applied: "30" }, jobTitle, NOW)).toHaveLength(3);
  });
  it("filters to needs-attention only", () => {
    expect(filterApplicants(apps, { attentionOnly: true }, jobTitle, NOW).map((a) => a.full_name)).toEqual(["Alicia Freeman"]);
  });
});

describe("sortApplicants", () => {
  it("sorts newest and oldest first", () => {
    expect(sortApplicants(apps, "newest", jobTitle, storeName)[0].full_name).toBe("Marcus Webb");
    expect(sortApplicants(apps, "oldest", jobTitle, storeName)[0].full_name).toBe("Derek Boone");
  });
  it("sorts by name and rating", () => {
    expect(sortApplicants(apps, "name", jobTitle, storeName).map((a) => a.full_name)).toEqual(["Alicia Freeman", "Derek Boone", "Marcus Webb"]);
    expect(sortApplicants(apps, "rating", jobTitle, storeName).map((a) => a.full_name)).toEqual(["Derek Boone", "Marcus Webb", "Alicia Freeman"]);
  });
});
