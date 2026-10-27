import { describe, expect, it } from "vitest";
import { busyFromIcs, calendarHost, checkCalendarUrl } from "@/lib/busy-calendar";
import { openSlots, slotLabel, zonedTime } from "@/lib/booking";

const TZ = "America/Chicago";
const ics = (events: string) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "BEGIN:VTIMEZONE",
    "TZID:America/Chicago",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0500",
    "TZNAME:CDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0600",
    "TZNAME:CST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    events,
    "END:VCALENDAR",
  ].join("\r\n");

const from = Date.parse("2026-10-27T00:00:00Z");
const to = Date.parse("2026-11-10T00:00:00Z");
const fmt = (b: { start: number; end: number }[]) => b.map((x) => `${slotLabel(x.start, TZ)} → ${slotLabel(x.end, TZ)}`);

describe("reading a manager's calendar", () => {
  it("reads a one-off event in its own time zone", () => {
    const b = busyFromIcs(
      ics(["BEGIN:VEVENT", "UID:a", "DTSTART;TZID=America/Chicago:20261028T100000", "DTEND;TZID=America/Chicago:20261028T110000", "SUMMARY:Dentist", "END:VEVENT"].join("\r\n")),
      { storeTz: TZ, from, to },
    );
    expect(fmt(b)).toEqual(["Wed, Oct 28, 10:00 AM → Wed, Oct 28, 11:00 AM"]);
  });
  it("expands weekly meetings, skips deleted ones, and follows moved ones across daylight saving", () => {
    const b = busyFromIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:weekly",
          "DTSTART;TZID=America/Chicago:20261026T090000",
          "DTEND;TZID=America/Chicago:20261026T093000",
          "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4",
          "EXDATE;TZID=America/Chicago:20261102T090000",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:weekly",
          "RECURRENCE-ID;TZID=America/Chicago:20261109T090000",
          "DTSTART;TZID=America/Chicago:20261109T140000",
          "DTEND;TZID=America/Chicago:20261109T143000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { storeTz: TZ, from: Date.parse("2026-10-26T00:00:00Z"), to },
    );
    expect(fmt(b)).toEqual(["Mon, Oct 26, 9:00 AM → Mon, Oct 26, 9:30 AM", "Mon, Nov 9, 2:00 PM → Mon, Nov 9, 2:30 PM"]);
  });
  it("ignores events marked free and cancelled ones; blocks busy all-day events", () => {
    const b = busyFromIcs(
      ics(
        [
          "BEGIN:VEVENT", "UID:free", "DTSTART:20261028T150000Z", "DTEND:20261028T160000Z", "TRANSP:TRANSPARENT", "END:VEVENT",
          "BEGIN:VEVENT", "UID:gone", "DTSTART:20261028T170000Z", "DTEND:20261028T180000Z", "STATUS:CANCELLED", "END:VEVENT",
          "BEGIN:VEVENT", "UID:off", "DTSTART;VALUE=DATE:20261030", "DTEND;VALUE=DATE:20261031", "TRANSP:OPAQUE", "SUMMARY:Off", "END:VEVENT",
        ].join("\r\n"),
      ),
      { storeTz: TZ, from, to },
    );
    expect(b).toEqual([{ start: zonedTime(2026, 10, 30, 0, 0, TZ), end: zonedTime(2026, 10, 31, 0, 0, TZ) }]);
  });
  it("hides those times from the booking page", () => {
    const busy = busyFromIcs(
      ics(["BEGIN:VEVENT", "UID:a", "DTSTART:20261028T150000Z", "DTEND:20261028T160000Z", "END:VEVENT"].join("\r\n")),
      { storeTz: TZ, from, to },
    );
    const slots = openSlots({ hours: { days: [3], start: "09:00", end: "12:00" }, minutes: 30, timeZone: TZ, busy, now: from, days: 2 });
    expect(slots.map((s) => slotLabel(s, TZ).split(", ")[2])).toEqual(["9:00 AM", "9:30 AM", "11:00 AM", "11:30 AM"]);
  });
});

describe("calendar links", () => {
  it("accepts private Google, Outlook and iCloud links (webcal too)", () => {
    expect(checkCalendarUrl("https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics")).toHaveProperty("url");
    expect(checkCalendarUrl("webcal://p42-caldav.icloud.com/published/2/abc")).toEqual({ url: "https://p42-caldav.icloud.com/published/2/abc" });
    expect(checkCalendarUrl("https://outlook.office365.com/owa/calendar/x/y/calendar.ics")).toHaveProperty("url");
  });
  it("accepts Google's public free/busy address too", () => {
    expect(checkCalendarUrl("https://calendar.google.com/calendar/ical/x%40company.com/public/basic.ics")).toHaveProperty("url");
  });
  it("rejects Google page links, other sites and plain http", () => {
    expect(checkCalendarUrl("https://calendar.google.com/calendar/embed?src=x%40gmail.com")).toHaveProperty("error");
    expect(checkCalendarUrl("https://evil.example.com/cal.ics")).toHaveProperty("error");
    expect(checkCalendarUrl("http://calendar.google.com/x/private-a/basic.ics")).toHaveProperty("error");
    expect(checkCalendarUrl("not a link")).toHaveProperty("error");
    expect(calendarHost("webcal://p42-caldav.icloud.com/x")).toBe("p42-caldav.icloud.com");
  });
});
