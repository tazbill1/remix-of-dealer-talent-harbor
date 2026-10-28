import { describe, expect, it } from "vitest";
import { isTestName, plural, sourceLabel } from "@/lib/display";

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "applicant")).toBe("1 applicant");
    expect(plural(1, "job")).toBe("1 job");
  });
  it("uses the plural for zero and two or more", () => {
    expect(plural(0, "applicant")).toBe("0 applicants");
    expect(plural(2, "applicant")).toBe("2 applicants");
    expect(plural(3, "store")).toBe("3 stores");
  });
});

describe("sourceLabel", () => {
  it("maps known sources to friendly names", () => {
    expect(sourceLabel("own_site")).toBe("Careers site");
    expect(sourceLabel("walk-in")).toBe("Walk-in");
    expect(sourceLabel("indeed")).toBe("Indeed");
    expect(sourceLabel("ziprecruiter")).toBe("ZipRecruiter");
    expect(sourceLabel("glassdoor")).toBe("Glassdoor");
    expect(sourceLabel("referral")).toBe("Referral");
  });
  it("capitalizes and de-underscores anything else", () => {
    expect(sourceLabel("employee_referral_program")).toBe("Employee referral program");
    expect(sourceLabel("craigslist")).toBe("Craigslist");
  });
  it("handles empty values", () => {
    expect(sourceLabel("")).toBe("Unknown");
    expect(sourceLabel(null)).toBe("Unknown");
  });
});

describe("isTestName", () => {
  it("flags names containing test", () => {
    expect(isTestName("Tom Contact Test")).toBe(true);
    expect(isTestName("Tom Email Test")).toBe(true);
  });
  it("leaves real names alone", () => {
    expect(isTestName("Jane Miller")).toBe(false);
    expect(isTestName(null)).toBe(false);
  });
});
