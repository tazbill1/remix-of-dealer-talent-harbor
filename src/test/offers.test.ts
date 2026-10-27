import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { isOpen, offerInput, offerText, parseSignatureHeader, prefillFields, prettyDate, shouldMove, statusFromEvent } from "@/lib/offers";

describe("offer letters", () => {
  it("maps BoldSign events to offer status", () => {
    expect(statusFromEvent("Completed")).toBe("signed");
    expect(statusFromEvent("Viewed")).toBe("viewed");
    expect(statusFromEvent("DeliveryFailed")).toBe("failed");
    expect(statusFromEvent("Signed")).toBeNull();
    expect(statusFromEvent("Reminder")).toBeNull();
  });
  it("never moves a finished offer backwards", () => {
    expect(shouldMove("sent", "viewed")).toBe(true);
    expect(shouldMove("viewed", "signed")).toBe(true);
    expect(shouldMove("signed", "viewed")).toBe(false);
    expect(shouldMove("revoked", "signed")).toBe(false);
    expect(isOpen("viewed")).toBe(true);
    expect(isOpen("signed")).toBe(false);
  });
  it("fills only the template fields that have values", () => {
    expect(
      prefillFields({ candidateName: "Jane Doe", jobTitle: "Porter", storeName: "ABC Ford", pay: "", startDate: "2026-11-09", managerName: null }),
    ).toEqual([
      { id: "candidate_name", value: "Jane Doe" },
      { id: "job_title", value: "Porter" },
      { id: "store_name", value: "ABC Ford" },
      { id: "start_date", value: "November 9, 2026" },
    ]);
    expect(prettyDate(undefined)).toBe("");
  });
  it("validates the send form", () => {
    const ok = offerInput.parse({ orgId: crypto.randomUUID(), applicationId: crypto.randomUUID(), jobTitle: "Tech", startDate: "" });
    expect(ok.startDate).toBeUndefined();
    expect(ok.textLink).toBe(true);
    expect(() => offerInput.parse({ orgId: crypto.randomUUID(), applicationId: crypto.randomUUID(), jobTitle: "T" })).toThrow();
  });
  it("writes the candidate text", () => {
    expect(offerText({ first: "Jane", store: "ABC Ford", title: "Porter", link: "L" })).toBe(
      "Congrats Jane! ABC Ford is offering you the Porter job. Review and sign your offer here: L",
    );
  });
  it("parses the webhook signature header", () => {
    expect(parseSignatureHeader("t=1700000000, s0=abc, s1=def")).toEqual({ t: 1700000000, sigs: ["abc", "def"] });
    expect(parseSignatureHeader("s0=abc")).toBeNull();
    expect(parseSignatureHeader(null)).toBeNull();
  });
  it("verifies BoldSign webhook signatures", async () => {
    process.env["BOLDSIGN_WEBHOOK_SECRET"] = "whsec";
    const { verifyWebhook } = await import("@/lib/esign/boldsign.server");
    const body = '{"event":{"eventType":"Completed"},"data":{"documentId":"d1"}}';
    const t = 1_800_000_000;
    const sig = createHmac("sha256", "whsec").update(`${t}.${body}`).digest("hex");
    expect(await verifyWebhook(body, `t=${t}, s0=${sig}`, t * 1000)).toBe(true);
    expect(await verifyWebhook(body + " ", `t=${t}, s0=${sig}`, t * 1000)).toBe(false);
    expect(await verifyWebhook(body, `t=${t}, s0=${sig}`, (t + 600) * 1000)).toBe(false);
    expect(await verifyWebhook(body, `t=${t}, s0=bad, s1=${sig}`, t * 1000)).toBe(true);
  });
  it("round-trips offer links and rejects tampering", async () => {
    process.env["OFFER_LINK_SECRET"] = "s";
    const { offerToken, readOfferToken } = await import("@/lib/offers-token.server");
    const id = "0555ae45-5317-47d1-988c-9ff2ac68d4a7";
    const t = await offerToken(id);
    expect(t.length).toBeLessThan(60);
    expect(await readOfferToken(t)).toBe(id);
    expect(await readOfferToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"))).toBeNull();
  });
});

describe("new-hire paperwork", () => {
  it("validates the document list and the send form", async () => {
    const { onboardingInput, parseOnboardingTemplates, onboardingText, docEventMessage } = await import("@/lib/offers");
    expect(parseOnboardingTemplates([{ id: "abc12345-xyz", name: "W-4" }])).toHaveLength(1);
    expect(parseOnboardingTemplates([{ id: "bad id!", name: "W-4" }])).toEqual([]);
    expect(parseOnboardingTemplates(null)).toEqual([]);
    expect(() =>
      onboardingInput.parse({ orgId: crypto.randomUUID(), applicationId: crypto.randomUUID(), templateIds: [] }),
    ).toThrow();
    expect(onboardingText({ first: "Jane", store: "ABC Ford", link: "L" })).toContain("new-hire paperwork for ABC Ford");
    expect(docEventMessage("onboarding", "signed", "W-4, I-9")).toBe("Onboarding paperwork signed: W-4, I-9");
    expect(docEventMessage("offer", "declined", "Porter")).toBe("Offer declined: Porter");
  });
});
