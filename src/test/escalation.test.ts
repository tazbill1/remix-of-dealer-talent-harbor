import { describe, expect, it } from "vitest";
import { businessDaysSince, findStalled, type EscApp } from "@/lib/escalation";

// Noon Central time on a given date (CDT is UTC-5 in late October).
const ct = (ymd: string, hour = 12) =>
  Date.parse(`${ymd}T${String(hour + 5).padStart(2, "0")}:00:00Z`);

describe("businessDaysSince", () => {
  it("skips weekends and doesn't count the day of the last touch", () => {
    // Friday Oct 23 2026 -> Monday Oct 26: 1 business day
    expect(businessDaysSince(ct("2026-10-23"), ct("2026-10-26"))).toBe(1);
    // Friday -> Wednesday Oct 28: Mon, Tue, Wed = 3
    expect(businessDaysSince(ct("2026-10-23"), ct("2026-10-28"))).toBe(3);
    // Same day
    expect(businessDaysSince(ct("2026-10-27", 8), ct("2026-10-27", 17))).toBe(0);
    // Saturday -> Monday: 1
    expect(businessDaysSince(ct("2026-10-24"), ct("2026-10-26"))).toBe(1);
  });

  it("uses Central time for the day boundary", () => {
    // 10pm Central Monday is already Tuesday in UTC; still counts as Monday.
    const mondayNight = Date.parse("2026-10-27T03:00:00Z");
    expect(businessDaysSince(mondayNight, ct("2026-10-27"))).toBe(1);
  });
});

describe("findStalled", () => {
  const now = ct("2026-10-29"); // Thursday
  const app = (id: string, status: EscApp["status"], applied: string, open = false): EscApp => ({
    id,
    status,
    created_at: new Date(ct(applied)).toISOString(),
    open_to_other_stores: open,
  });

  it("flags early-stage candidates untouched for 3 business days", () => {
    const apps = [
      app("old", "new", "2026-10-23"), // Fri -> Thu = 4
      app("touched", "new", "2026-10-23"), // touched Tue -> 2
      app("fresh", "screening", "2026-10-27"), // Tue -> 2
      app("interview", "interview", "2026-10-01"), // owned, never escalates
      app("pooled", "new", "2026-10-01", true), // already in the open pool
      app("done", "new", "2026-10-01"), // already escalated once
    ];
    const touches = [
      { application_id: "touched", created_at: new Date(ct("2026-10-27")).toISOString() },
      {
        application_id: "done",
        created_at: new Date(ct("2026-10-10")).toISOString(),
        kind: "escalation",
      },
    ];
    expect(findStalled(apps, touches, now)).toEqual([
      { id: "old", lastActivity: ct("2026-10-23"), idleBusinessDays: 4 },
    ]);
  });
});
