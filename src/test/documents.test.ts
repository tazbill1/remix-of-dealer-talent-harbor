import { describe, expect, it } from "vitest";
import { documentFields, hireOnSign, sendDocsInput } from "@/lib/offers";

const base = { orgId: "00000000-0000-4000-8000-000000000001", applicationId: "00000000-0000-4000-8000-000000000002", jobTitle: "Sales" };

describe("BoldSign documents", () => {
  it("fills both box naming styles from the applicant", () => {
    const f = documentFields({ candidateName: "Ana Ruiz", jobTitle: "Sales", storeName: "Dallas", pay: "", managerName: null });
    expect(f).toContainEqual({ id: "ApplicantName", value: "Ana Ruiz" });
    expect(f).toContainEqual({ id: "candidate_name", value: "Ana Ruiz" });
    expect(f.find((x) => x.id === "Pay")).toBeUndefined();
  });
  it("needs at least one document and allows several", () => {
    expect(() => sendDocsInput.parse({ ...base, templates: [] })).toThrow();
    const two = [{ id: "abcdefgh12", name: "Offer" }, { id: "ijklmnop34", name: "W-4" }];
    expect(sendDocsInput.parse({ ...base, templates: two }).templates).toHaveLength(2);
  });
  it("moves to Hired only for a signed offer letter with the setting on", () => {
    const a = { status: "signed" as const, isOfferLetter: true, setting: true, appStatus: "offer" };
    expect(hireOnSign(a)).toBe(true);
    expect(hireOnSign({ ...a, setting: false })).toBe(false);
    expect(hireOnSign({ ...a, isOfferLetter: false })).toBe(false);
    expect(hireOnSign({ ...a, status: "viewed" })).toBe(false);
    expect(hireOnSign({ ...a, appStatus: "rejected" })).toBe(false);
  });
});
