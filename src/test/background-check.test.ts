import { describe, expect, it } from "vitest";
import { bgEventMessage, bgPatch, bgStatusOf } from "@/lib/background-check";

const now = new Date("2026-10-28T12:00:00Z");

describe("background checks", () => {
  it("treats empty or unknown values as not started", () => {
    expect(bgStatusOf(null)).toBeNull();
    expect(bgStatusOf("pending")).toBeNull();
    expect(bgStatusOf("flagged")).toBe("flagged");
  });
  it("writes nothing when nothing changed", () => {
    expect(bgPatch({ status: "clear", note: "ok" }, { status: "clear", note: " ok " }, now)).toBeNull();
    expect(bgPatch({ status: null, note: null }, { status: null, note: "" }, now)).toBeNull();
  });
  it("stamps the time and trims the note on a change", () => {
    expect(bgPatch({ status: "requested", note: null }, { status: "flagged", note: "  needs review " }, now)).toEqual({
      background_check_status: "flagged",
      background_check_note: "needs review",
      background_check_updated_at: now.toISOString(),
    });
  });
  it("clears the note and time when the check is removed", () => {
    expect(bgPatch({ status: "clear", note: "fine" }, { status: null, note: "fine" }, now)).toEqual({
      background_check_status: null, background_check_note: null, background_check_updated_at: null,
    });
  });
  it("words timeline entries", () => {
    expect(bgEventMessage("in_progress")).toBe("Background check: In progress");
    expect(bgEventMessage("flagged", "record found")).toBe("Background check: Flagged — record found");
    expect(bgEventMessage(null)).toBe("Background check cleared from profile");
  });
});
