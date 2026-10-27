import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsText, subscribeLinks, visibleStoreIds } from "@/lib/calendar-feed";

const stores = [
  { id: "s1", region_id: "north" },
  { id: "s2", region_id: "north" },
  { id: "s3", region_id: "south" },
];

describe("who sees which interviews", () => {
  it("group-wide roles see every store", () => {
    expect([...visibleStoreIds("recruiter", [], stores)]).toEqual(["s1", "s2", "s3"]);
  });
  it("a regional leader sees the stores in their region", () => {
    expect([...visibleStoreIds("regional_leader", [{ dealership_id: null, region_id: "north" }], stores)].sort()).toEqual(["s1", "s2"]);
  });
  it("a hiring manager sees only their store, and nothing without a scope", () => {
    expect([...visibleStoreIds("hiring_manager", [{ dealership_id: "s3", region_id: null }], stores)]).toEqual(["s3"]);
    expect(visibleStoreIds("hiring_manager", [], stores).size).toBe(0);
  });
});

describe("calendar file", () => {
  const ev = {
    id: "i1",
    startsAt: "2026-11-02T15:00:00.000Z",
    durationMin: 30,
    status: "scheduled",
    title: "Interview: Jane Doe · Service Tech",
    location: "ABC Ford, 1 Main St, Bentonville, AR",
    description: "Jane Doe.\nOpen in hireme",
  };
  it("writes events with start, end and escaped text", () => {
    const ics = buildIcs("hireme interviews", [ev], new Date("2026-10-27T00:00:00Z"));
    expect(ics).toContain("DTSTART:20261102T150000Z");
    expect(ics).toContain("DTEND:20261102T153000Z");
    expect(ics).toContain("LOCATION:ABC Ford\\, 1 Main St\\, Bentonville\\, AR");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it("marks cancelled interviews so calendars remove them", () => {
    expect(buildIcs("x", [{ ...ev, status: "cancelled" }])).toContain("STATUS:CANCELLED");
  });
  it("escapes and folds", () => {
    expect(icsText("a;b,c\\d\ne")).toBe("a\;b\\,c\\\\d\\ne");
    const long = "X".repeat(200);
    expect(foldLine(long).replace(/\r\n /g, "")).toBe(long);
  });
  it("builds one-click subscribe links", () => {
    const l = subscribeLinks("https://workwithwerk.com/api/public/calendar/abc.ics");
    expect(l.webcal).toBe("webcal://workwithwerk.com/api/public/calendar/abc.ics");
    expect(l.google).toContain(encodeURIComponent("webcal://workwithwerk.com"));
    expect(l.outlook).toContain("addfromweb?url=https%3A%2F%2Fworkwithwerk.com");
  });
});
