import { expect, it } from "vitest";
it("round trip", async () => {
  process.env["CALENDAR_FEED_SECRET"] = "s";
  const { calendarToken, readCalendarToken } = await import("@/lib/calendar-feed.server");
  const id = "0555ae45-5317-47d1-988c-9ff2ac68d4a7";
  const t = await calendarToken(id);
  expect(await readCalendarToken(t + ".ics")).toBe(id);
  expect(await readCalendarToken(t.slice(0, -2) + "xx")).toBeNull();
  expect(await readCalendarToken("junk")).toBeNull();
});
