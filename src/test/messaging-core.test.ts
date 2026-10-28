import { describe, expect, it } from "vitest";
import {
  decideDelivery,
  isInSendWindow,
  isOptOutRequest,
  keywordOf,
  nextSendTime,
  toE164,
  zonedTime,
  type SendWindow,
} from "@/lib/messaging/core";

const W: SendWindow = {
  start: "08:00",
  end: "18:00",
  days: [1, 2, 3, 4, 5, 6],
  timeZone: "America/Chicago",
};
// Central time on 2026-10-27 (a Tuesday) is UTC-5.
const ct = (ymd: string, hhmm: string) => zonedTime(ymd, hhmm, "America/Chicago");

describe("toE164", () => {
  it("normalizes US numbers", () => {
    expect(toE164("(214) 555-0199")).toBe("+12145550199");
    expect(toE164("1-214-555-0199")).toBe("+12145550199");
    expect(toE164("+1 214 555 0199")).toBe("+12145550199");
    expect(toE164("555-0199")).toBeNull();
    expect(toE164("")).toBeNull();
  });
});

describe("send window", () => {
  it("converts local wall time to UTC, including daylight saving", () => {
    expect(new Date(ct("2026-10-27", "08:00")).toISOString()).toBe("2026-10-27T13:00:00.000Z");
    // After DST ends (Nov 1 2026), Central is UTC-6.
    expect(new Date(ct("2026-11-02", "08:00")).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("sends now inside 8am-6pm Mon-Sat", () => {
    const tueNoon = ct("2026-10-27", "12:00");
    expect(isInSendWindow(tueNoon, W)).toBe(true);
    expect(nextSendTime(tueNoon, W)).toBe(tueNoon);
  });

  it("holds evening texts until 8am the next day", () => {
    expect(nextSendTime(ct("2026-10-27", "19:30"), W)).toBe(ct("2026-10-28", "08:00"));
    expect(nextSendTime(ct("2026-10-27", "06:15"), W)).toBe(ct("2026-10-27", "08:00"));
    // 6:00pm exactly is outside the window
    expect(isInSendWindow(ct("2026-10-27", "18:00"), W)).toBe(false);
  });

  it("skips Sunday", () => {
    // Saturday Oct 31 at 7pm -> Monday Nov 2 at 8am (after DST change)
    expect(nextSendTime(ct("2026-10-31", "19:00"), W)).toBe(ct("2026-11-02", "08:00"));
    expect(nextSendTime(ct("2026-11-01", "12:00"), W)).toBe(ct("2026-11-02", "08:00"));
  });

  it("respects the store's own time zone", () => {
    const eastern = { ...W, timeZone: "America/New_York" };
    // 7:30am Central = 8:30am Eastern: inside the window for an Eastern store
    expect(isInSendWindow(ct("2026-10-27", "07:30"), eastern)).toBe(true);
  });
});

describe("keywords", () => {
  it("recognizes carrier keywords only as the whole message", () => {
    expect(keywordOf("STOP")).toBe("stop");
    expect(keywordOf(" stop. ")).toBe("stop");
    expect(keywordOf("Unsubscribe")).toBe("stop");
    expect(keywordOf("start")).toBe("start");
    expect(keywordOf("help?")).toBe("help");
    expect(keywordOf("please stop texting me after 5")).toBeNull();
    expect(keywordOf("1")).toBeNull();
  });
});

describe("decideDelivery", () => {
  const base = {
    to: "+12145550199",
    party: "candidate" as const,
    optedOut: false,
    candidateConsent: true,
    window: W,
  };
  it("queues for now in the window and holds outside it", () => {
    const noon = ct("2026-10-27", "12:00");
    expect(decideDelivery({ ...base, now: noon })).toEqual({
      status: "queued",
      scheduledFor: noon,
    });
    expect(decideDelivery({ ...base, now: ct("2026-10-27", "21:00") })).toEqual({
      status: "queued",
      scheduledFor: ct("2026-10-28", "08:00"),
    });
  });
  it("blocks opted-out numbers, candidates without consent, and bad numbers", () => {
    const now = ct("2026-10-27", "12:00");
    expect(decideDelivery({ ...base, now, optedOut: true }).status).toBe("blocked");
    expect(decideDelivery({ ...base, now, candidateConsent: false }).status).toBe("blocked");
    expect(decideDelivery({ ...base, now, to: null }).status).toBe("blocked");
    // Managers are employees texted for work; consent applies to candidates only.
    expect(decideDelivery({ ...base, now, party: "manager", candidateConsent: false }).status).toBe(
      "queued",
    );
  });
  it("sends STOP/START/HELP confirmations immediately, even after opt-out", () => {
    const night = ct("2026-10-27", "23:00");
    expect(decideDelivery({ ...base, now: night, optedOut: true, isKeywordReply: true })).toEqual({
      status: "queued",
      scheduledFor: night,
    });
  });
});

describe("isOptOutRequest", () => {
  it("catches plain-language opt-outs", () => {
    for (const t of [
      "Please stop texting me",
      "stop messaging me!!",
      "Don't text me anymore",
      "do not contact me",
      "I don’t want any more texts",
      "No more texts please",
      "remove me from your list",
      "Take me off your texting list",
      "unsubscribe me",
      "opt me out",
    ])
      expect(isOptOutRequest(t), t).toBe(true);
  });

  it("leaves scheduling asks and normal replies to the assistant", () => {
    for (const t of [
      "please stop texting me after 5",
      "don't text me before 9am",
      "can't stop thinking about this job",
      "can I stop by tomorrow?",
      "Yes",
      "remove me from consideration",
      "STOP",
    ])
      expect(isOptOutRequest(t), t).toBe(false);
  });
});
