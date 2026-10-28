import { describe, expect, it } from "vitest";
import { calendarLinks } from "@/lib/calendar-links";

describe("calendarLinks", () => {
  const l = calendarLinks({ title: "Interview: Tom", startsAt: "2026-10-30T21:00:00.000Z", minutes: 30, location: "Dallas" });
  it("Google link covers the interview time", () => {
    expect(new URL(l.google).searchParams.get("dates")).toBe("20261030T210000Z/20261030T213000Z");
  });
  it("Outlook link ends after the interview length", () => {
    expect(new URL(l.outlook).searchParams.get("enddt")).toBe("2026-10-30T21:30:00.000Z");
  });
});
