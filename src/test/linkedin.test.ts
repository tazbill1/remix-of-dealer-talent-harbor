import { describe, expect, it } from "vitest";
import { normalizeLinkedInUrl } from "@/lib/linkedin";

describe("normalizeLinkedInUrl", () => {
  it("accepts a full https URL", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/test-person")).toBe("https://www.linkedin.com/in/test-person");
  });
  it("adds the scheme and www when missing", () => {
    expect(normalizeLinkedInUrl("linkedin.com/in/test-person")).toBe("https://www.linkedin.com/in/test-person");
    expect(normalizeLinkedInUrl("www.linkedin.com/in/test-person")).toBe("https://www.linkedin.com/in/test-person");
  });
  it("strips tracking parameters and fragments", () => {
    expect(normalizeLinkedInUrl("linkedin.com/in/test-person?utm=x")).toBe("https://www.linkedin.com/in/test-person");
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/test-person/?utm=x&trk=y#top")).toBe("https://www.linkedin.com/in/test-person");
  });
  it("trims whitespace and allows a trailing slash", () => {
    expect(normalizeLinkedInUrl("  https://linkedin.com/in/jane-doe/  ")).toBe("https://www.linkedin.com/in/jane-doe");
  });
  it("returns null for empty input", () => {
    expect(normalizeLinkedInUrl("")).toBeNull();
    expect(normalizeLinkedInUrl("   ")).toBeNull();
    expect(normalizeLinkedInUrl(null)).toBeNull();
    expect(normalizeLinkedInUrl(undefined)).toBeNull();
  });
  it("rejects non-LinkedIn sites", () => {
    expect(normalizeLinkedInUrl("https://example.com/in/test-person")).toBeNull();
    expect(normalizeLinkedInUrl("https://notlinkedin.com/in/test-person")).toBeNull();
  });
  it("rejects LinkedIn pages that are not /in/ profiles", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/company/acme")).toBeNull();
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/")).toBeNull();
    expect(normalizeLinkedInUrl("https://www.linkedin.com/")).toBeNull();
  });
  it("rejects javascript: and other schemes", () => {
    expect(normalizeLinkedInUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkedInUrl("ftp://linkedin.com/in/x")).toBeNull();
  });
});
