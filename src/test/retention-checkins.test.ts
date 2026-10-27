import { describe, expect, it } from "vitest";
import { checkinSchedule, departureFromCheckin } from "@/lib/retention";

describe("retention check-ins", () => {
  it("schedules 30/60/90 from the start date, falling back to the hire date", () => {
    expect(checkinSchedule("2026-01-01", "2025-12-20T15:00:00Z")).toEqual([
      { mark: 30, due: "2026-01-31" },
      { mark: 60, due: "2026-03-02" },
      { mark: 90, due: "2026-04-01" },
    ]);
    expect(checkinSchedule(null, "2026-01-01T15:00:00Z")[0]).toEqual({
      mark: 30,
      due: "2026-01-31",
    });
    expect(checkinSchedule(null, null)).toEqual([]);
  });

  it("records a departure no later than the day before the missed mark", () => {
    // Recorded late: departure lands the day before the mark, so they don't count as retained.
    expect(departureFromCheckin("2026-03-02", "2026-03-10")).toBe("2026-03-01");
    // Recorded early (before the mark): use today.
    expect(departureFromCheckin("2026-03-02", "2026-02-20")).toBe("2026-02-20");
  });
});
