import { describe, expect, it } from "vitest";
import { formatPhone, textingStatusLine } from "@/lib/store-texting";

describe("store texting display", () => {
  it("formats US numbers", () => {
    expect(formatPhone("+12145550123")).toBe("(214) 555-0123");
    expect(formatPhone("214-555-0123")).toBe("(214) 555-0123");
  });
  it("shows Active when live", () =>
    expect(textingStatusLine({ sms_number: "+12145550123", live: true })).toBe(
      "Texting: (214) 555-0123 · Active · Managed by WerkandMe",
    ));
  it("shows not set up when no number", () =>
    expect(textingStatusLine({ sms_number: null, live: true })).toBe(
      "Texting: Not set up yet · Managed by WerkandMe",
    ));
});
