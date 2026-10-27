import { describe, expect, it } from "vitest";
import { bookingInviteText, openSlots, parseHours, slotLabel, zonedDate, zonedTime, DEFAULT_HOURS } from "@/lib/booking";

const TZ = "America/Chicago";

describe("store time zone math", () => {
  it("turns store wall-clock time into the right moment, across daylight saving", () => {
    // Nov 2 2026 is after DST ends (CST, UTC-6); Oct 30 is CDT (UTC-5).
    expect(new Date(zonedTime(2026, 11, 2, 9, 0, TZ)).toISOString()).toBe("2026-11-02T15:00:00.000Z");
    expect(new Date(zonedTime(2026, 10, 30, 9, 0, TZ)).toISOString()).toBe("2026-10-30T14:00:00.000Z");
    expect(zonedDate(Date.parse("2026-11-02T03:00:00Z"), TZ)).toMatchObject({ y: 2026, m: 11, d: 1, weekday: 0 });
  });
});

describe("open interview times", () => {
  // Tuesday Oct 27 2026, 6pm Chicago
  const now = Date.parse("2026-10-27T23:00:00Z");
  it("offers slots inside store hours, after the lead time, on open days", () => {
    const slots = openSlots({ hours: { days: [3], start: "09:00", end: "10:00" }, minutes: 30, timeZone: TZ, busy: [], now, days: 7 });
    expect(slots.map((s) => slotLabel(s, TZ))).toEqual(["Wed, Oct 28, 9:00 AM", "Wed, Oct 28, 9:30 AM"]);
  });
  it("skips times that are already booked", () => {
    const nine = zonedTime(2026, 10, 28, 9, 0, TZ);
    const slots = openSlots({
      hours: { days: [3], start: "09:00", end: "10:30" },
      minutes: 30,
      timeZone: TZ,
      busy: [{ start: nine + 15 * 60e3, end: nine + 45 * 60e3 }],
      now,
      days: 1,
    });
    expect(slots.map((s) => slotLabel(s, TZ))).toEqual(["Wed, Oct 28, 10:00 AM"]);
  });
  it("respects the lead time and the cap", () => {
    const soon = Date.parse("2026-10-28T13:30:00Z"); // 8:30am Wed
    expect(openSlots({ hours: DEFAULT_HOURS, minutes: 30, timeZone: TZ, busy: [], now: soon, leadHours: 2, days: 0 })[0]).toBe(
      zonedTime(2026, 10, 28, 10, 30, TZ),
    );
    expect(openSlots({ hours: DEFAULT_HOURS, minutes: 30, timeZone: TZ, busy: [], now, max: 5 })).toHaveLength(5);
  });
  it("falls back to default hours when settings are bad", () => {
    expect(parseHours({ days: [1], start: "17:00", end: "09:00" })).toEqual(DEFAULT_HOURS);
    expect(parseHours(null)).toEqual(DEFAULT_HOURS);
  });
  it("writes the invite text with the link", () => {
    expect(bookingInviteText({ first: "Jane", store: "ABC Ford", link: "L" })).toBe(
      "Great news, Jane! The team at ABC Ford would like to interview you. Pick a time that works for you: L",
    );
  });
});
