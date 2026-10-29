import { describe, expect, it } from "vitest";
import { portalStage, suggestJobs, isValidEmail, videoEmbedUrl, isCurrent } from "./applicant-portal";

describe("applicant portal", () => {
  it("hides declined stages behind neutral wording", () => {
    expect(portalStage("do_not_hire")).toEqual({ step: -1, label: "Not moving forward", closed: true });
    expect(portalStage("rejected").label).toBe("Not moving forward");
    expect(portalStage("screening").label).toBe("Reviewing");
    expect(portalStage("hired").step).toBe(4);
  });
  it("treats hired and declined as history", () => {
    expect(isCurrent("hired")).toBe(false);
    expect(isCurrent("unqualified")).toBe(false);
    expect(isCurrent("interview")).toBe(true);
  });
  it("suggests similar open jobs, excluding applied ones", () => {
    const applied = [{ id: "a", title: "Sales Consultant", department: "Sales" }];
    const open = [
      { id: "a", title: "Sales Consultant", department: "Sales" },
      { id: "b", title: "Internet Sales Rep", department: null },
      { id: "c", title: "Technician", department: "Service" },
    ];
    expect(suggestJobs(applied, open).map((j) => j.id)).toEqual(["b"]);
  });
  it("validates newsletter emails", () => {
    expect(isValidEmail("a@example.com")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });
  it("builds embed links", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=cg4zkGX8APc")).toBe("https://www.youtube.com/embed/cg4zkGX8APc");
    expect(videoEmbedUrl("https://example.com/x")).toBeNull();
  });
});
