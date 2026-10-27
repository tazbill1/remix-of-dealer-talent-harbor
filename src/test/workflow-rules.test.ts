import { describe, expect, it } from "vitest";
import { zonedTime, type SendWindow } from "@/lib/messaging/core";
import {
  dueCheckin,
  dueReminders,
  managerDecision,
  nextManagerStep,
  pendingManagerQuestion,
  PURPOSE,
  text,
  windowHoursBetween,
  yesNo,
  type Msg,
} from "@/lib/workflows/rules";

const W: SendWindow = {
  start: "08:00",
  end: "18:00",
  days: [1, 2, 3, 4, 5, 6],
  timeZone: "America/Chicago",
};
const ct = (ymd: string, hhmm: string) => zonedTime(ymd, hhmm, "America/Chicago");
const msg = (p: Partial<Msg> & { created_at: string }): Msg => ({
  application_id: "a1",
  party: "manager",
  direction: "out",
  purpose: null,
  status: "simulated",
  ...p,
});
const iso = (ms: number) => new Date(ms).toISOString();

describe("windowHoursBetween", () => {
  it("counts only texting hours", () => {
    // Tue 4pm -> Wed 10am: 2h Tuesday + 2h Wednesday
    expect(windowHoursBetween(ct("2026-10-27", "16:00"), ct("2026-10-28", "10:00"), W)).toBe(4);
    // Sat 5pm -> Mon 9am: 1h Sat + 1h Mon (Sunday off)
    expect(windowHoursBetween(ct("2026-10-31", "17:00"), ct("2026-11-02", "09:00"), W)).toBe(2);
  });
});

describe("nextManagerStep", () => {
  const base = {
    status: "screening",
    nudgeAfterHours: 4,
    escalateAfterHours: 24,
    hasEscalationContact: true,
    window: W,
  };
  const summaryAt = ct("2026-10-27", "09:00");
  const summary = msg({ purpose: PURPOSE.summary, created_at: iso(summaryAt) });

  it("sends the summary once a candidate reaches Screening", () => {
    expect(nextManagerStep({ ...base, messages: [], now: summaryAt })).toBe("summary");
    expect(nextManagerStep({ ...base, status: "new", messages: [], now: summaryAt })).toBeNull();
  });

  it("nudges after 4 texting hours, then escalates after 24", () => {
    expect(
      nextManagerStep({ ...base, messages: [summary], now: ct("2026-10-27", "12:00") }),
    ).toBeNull();
    expect(nextManagerStep({ ...base, messages: [summary], now: ct("2026-10-27", "13:00") })).toBe(
      "nudge",
    );
    const nudged = [
      summary,
      msg({ purpose: PURPOSE.nudge, created_at: iso(ct("2026-10-27", "13:00")) }),
    ];
    // 24 texting hours from Tue 9am = Tue 9h + Wed 10h + Thu 5h -> Thu 1pm
    expect(
      nextManagerStep({ ...base, messages: nudged, now: ct("2026-10-29", "12:30") }),
    ).toBeNull();
    expect(nextManagerStep({ ...base, messages: nudged, now: ct("2026-10-29", "13:00") })).toBe(
      "escalation",
    );
  });

  it("stops when the manager replies or there's no escalation contact", () => {
    const replied = [summary, msg({ direction: "in", created_at: iso(ct("2026-10-27", "10:00")) })];
    expect(
      nextManagerStep({ ...base, messages: replied, now: ct("2026-10-30", "12:00") }),
    ).toBeNull();
    const nudged = [
      summary,
      msg({ purpose: PURPOSE.nudge, created_at: iso(ct("2026-10-27", "13:00")) }),
    ];
    expect(
      nextManagerStep({
        ...base,
        hasEscalationContact: false,
        messages: nudged,
        now: ct("2026-10-30", "12:00"),
      }),
    ).toBeNull();
  });

  it("doesn't retry a blocked summary", () => {
    const blocked = msg({
      purpose: PURPOSE.summary,
      status: "blocked",
      created_at: iso(summaryAt),
    });
    expect(
      nextManagerStep({ ...base, messages: [blocked], now: ct("2026-10-28", "12:00") }),
    ).toBeNull();
  });
});

describe("short replies", () => {
  it("reads 1/2 and Y/N", () => {
    expect(managerDecision("1")).toBe("interview");
    expect(managerDecision(" 2. ")).toBe("pass");
    expect(managerDecision("Can she start Monday?")).toBeNull();
    expect(yesNo("Y")).toBe(true);
    expect(yesNo("nope")).toBe(false);
    expect(yesNo("maybe")).toBeNull();
  });

  it("knows what the manager was last asked", () => {
    const t = (h: string) => iso(ct("2026-10-27", h));
    expect(
      pendingManagerQuestion([msg({ purpose: PURPOSE.summary, created_at: t("09:00") })]),
    ).toEqual({ kind: "decision" });
    expect(
      pendingManagerQuestion([
        msg({ purpose: PURPOSE.summary, created_at: t("09:00") }),
        msg({ purpose: PURPOSE.checkin(30), created_at: t("10:00") }),
      ]),
    ).toEqual({ kind: "checkin", mark: 30 });
    expect(pendingManagerQuestion([])).toBeNull();
  });
});

describe("dueReminders", () => {
  const interview = ct("2026-10-28", "14:00"); // Wed 2pm
  it("reminds the candidate the day before, and both 2 hours before", () => {
    expect(
      dueReminders({
        startsAt: interview,
        messages: [],
        window: W,
        now: ct("2026-10-27", "15:00"),
      }),
    ).toEqual([{ purpose: PURPOSE.reminderDay, party: "candidate" }]);
    expect(
      dueReminders({
        startsAt: interview,
        messages: [],
        window: W,
        now: ct("2026-10-28", "12:15"),
      }),
    ).toEqual([
      { purpose: PURPOSE.reminderSoon, party: "candidate" },
      { purpose: PURPOSE.reminderManager, party: "manager" },
    ]);
  });
  it("skips a reminder texting hours would deliver too late", () => {
    // 8:30am interview: the 2-hour reminder would wait until 8am -> too close, skip.
    const early = ct("2026-10-28", "08:10");
    expect(
      dueReminders({ startsAt: early, messages: [], window: W, now: ct("2026-10-28", "06:30") }),
    ).toEqual([]);
  });
  it("doesn't repeat a reminder", () => {
    const sent = [
      msg({
        party: "candidate",
        purpose: PURPOSE.reminderDay,
        created_at: iso(ct("2026-10-27", "15:00")),
      }),
    ];
    expect(
      dueReminders({
        startsAt: interview,
        messages: sent,
        window: W,
        now: ct("2026-10-27", "16:00"),
      }),
    ).toEqual([]);
  });
});

describe("message text", () => {
  it("keeps the manager summary short with clear options", () => {
    const s = text.summary({
      assistant: "Penny",
      name: "Marcus Lee",
      job: "Service Technician",
      store: "Grand Rapids Ford",
      summary: "x ".repeat(200),
      rating: 4,
    });
    expect(s.length).toBeLessThan(320);
    expect(s).toContain("Reply 1 to interview, 2 to pass");
    // Every manager text names the program registered with the carriers.
    expect(s.startsWith("hireme by WerkandMe: ")).toBe(true);
    expect(text.checkin({ name: "Marcus", mark: 30, store: "GR Ford" })).toMatch(
      /^hireme by WerkandMe: .*Reply Y or N\. Reply STOP to opt out\.$/,
    );
    expect(
      text.welcome({ first: "Marcus", store: "GR Ford", assistant: "Penny", job: "Tech" }),
    ).toContain("Reply STOP to opt out");
  });
});

describe("dueCheckin", () => {
  const schedule = [
    { mark: 30, due: "2026-10-01" },
    { mark: 60, due: "2026-10-31" },
    { mark: 90, due: "2026-11-30" },
  ];
  it("texts the mark that's due, once, and skips stale ones", () => {
    expect(dueCheckin({ schedule, rows: [], today: "2026-10-31" })).toEqual(schedule[1]);
    expect(dueCheckin({ schedule, rows: [], today: "2026-10-30" })).toBeNull(); // 30 is >7 days old
    expect(
      dueCheckin({
        schedule,
        rows: [{ day_mark: 60, sent_at: "2026-10-31T13:00:00Z", responded_at: null }],
        today: "2026-11-02",
      }),
    ).toBeNull();
  });
});
