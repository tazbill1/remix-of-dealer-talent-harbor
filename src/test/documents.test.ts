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

describe("documents text and links", () => {
  it("writes the texted link message", async () => {
    const { docsText } = await import("@/lib/offers");
    expect(docsText({ first: "Jane", store: "ABC Ford", count: 1, link: "L" })).toBe(
      "ABC Ford: Hi Jane, you have a document to review and sign. It takes a few minutes on your phone: L",
    );
    expect(docsText({ first: "Jane", store: "ABC Ford", count: 3, link: "L" })).toContain("3 documents");
  });
  it("keeps offer links and document-list links separate", async () => {
    process.env["OFFER_LINK_SECRET"] = "s";
    const { offerToken, docsToken, readOfferToken, readDocsToken } = await import("@/lib/offers-token.server");
    const id = "0555ae45-5317-47d1-988c-9ff2ac68d4a7";
    expect(await readDocsToken(await docsToken(id))).toBe(id);
    expect(await readOfferToken(await offerToken(id))).toBe(id);
    expect(await readOfferToken(await docsToken(id))).toBeNull();
    expect(await readDocsToken(await offerToken(id))).toBeNull();
  });
});
