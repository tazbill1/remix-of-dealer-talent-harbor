import { describe, expect, it } from "vitest";
import { canAddCandidate, RESUME_MAX_BYTES, resumeExtension, resumeStoragePath } from "@/lib/manual-candidate";

describe("manual candidate rules", () => {
  it("accepts only PDF, DOC, DOCX", () => {
    expect(resumeExtension("a.PDF")).toBe("pdf");
    expect(resumeExtension("a.docx")).toBe("docx");
    expect(resumeExtension("a.png")).toBeNull();
    expect(resumeExtension("pdf")).toBeNull();
  });
  it("limits resumes to 10 MB", () => expect(RESUME_MAX_BYTES).toBe(10485760));
  it("uses the apply form's path pattern", () => {
    expect(resumeStoragePath("org", "app", "My CV.doc")).toBe("org/app/resume.doc");
  });
  it("shows the button only to allowed roles", () => {
    expect(canAddCandidate("recruiter", false)).toBe(true);
    expect(canAddCandidate("group_admin", false)).toBe(true);
    expect(canAddCandidate("dealer_manager", false)).toBe(true);
    expect(canAddCandidate("hiring_manager", false)).toBe(true);
    expect(canAddCandidate("regional_leader", false)).toBe(false);
    expect(canAddCandidate("regional_leader", true)).toBe(true);
  });
});
