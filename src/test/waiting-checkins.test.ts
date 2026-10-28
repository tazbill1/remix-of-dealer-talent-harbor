import { describe, expect, it } from "vitest";
import { zonedTime } from "@/lib/messaging/core";
import { isOn, parseAutomations, waitingText } from "@/lib/automations";
import { dueWaitingCheckin, PURPOSE, type Msg } from "@/lib/workflows/rules";
import { runWorkflows, waitingCheckinPlan } from "@/lib/workflows/run.server";
import { fakeSupabase } from "./fake-supabase";

const DAY = 24 * 3600e3;
const ct = (ymd: string, hhmm: string) => zonedTime(ymd, hhmm, "America/Chicago");
const now = ct("2026-10-27", "10:00");
const ago = (days: number) => new Date(now - days * DAY).toISOString();
const msg = (p: Partial<Msg>): Msg => ({
  application_id: "a1",
  party: "candidate",
  direction: "out",
  purpose: "welcome",
  status: "simulated",
  created_at: ago(5),
  ...p,
});
const base = {
  status: "screening",
  appliedAt: ago(6),
  heldByPerson: false,
  messages: [msg({})],
  everyDays: 3,
  now,
};

describe("still reviewing check-ins: who gets one", () => {
  it("texts a waiting applicant after a quiet stretch, numbering each check-in", () => {
    expect(dueWaitingCheckin(base)).toBe(1);
    expect(dueWaitingCheckin({ ...base, messages: [msg({ created_at: ago(2) })] })).toBeNull();
    expect(
      dueWaitingCheckin({
        ...base,
        messages: [msg({}), msg({ purpose: "waiting_checkin_1", created_at: ago(4) })],
      }),
    ).toBe(2);
  });
  it("stops once they're past New/Screening, held by a person, or too old", () => {
    for (const status of ["interview", "offer", "hired", "rejected"])
      expect(dueWaitingCheckin({ ...base, status })).toBeNull();
    expect(dueWaitingCheckin({ ...base, heldByPerson: true })).toBeNull();
    expect(dueWaitingCheckin({ ...base, appliedAt: ago(46) })).toBeNull();
  });
  it("never sends the first text, and stops after a blocked one (STOP / no consent)", () => {
    expect(dueWaitingCheckin({ ...base, messages: [] })).toBeNull();
    expect(dueWaitingCheckin({ ...base, messages: [msg({ status: "blocked" })] })).toBeNull();
    expect(
      dueWaitingCheckin({
        ...base,
        messages: [
          msg({}),
          msg({ purpose: "waiting_checkin_1", status: "blocked", created_at: ago(4) }),
        ],
      }),
    ).toBeNull();
  });
  it("waits when they texted last or a text is already queued, and stops after 4", () => {
    expect(
      dueWaitingCheckin({
        ...base,
        messages: [msg({}), msg({ direction: "in", purpose: null, created_at: ago(4) })],
      }),
    ).toBeNull();
    expect(
      dueWaitingCheckin({
        ...base,
        messages: [msg({}), msg({ status: "queued", created_at: ago(4) })],
      }),
    ).toBeNull();
    const four = [1, 2, 3, 4].map((n) =>
      msg({ purpose: `waiting_checkin_${n}`, created_at: ago(20 - n * 3) }),
    );
    expect(
      dueWaitingCheckin({ ...base, messages: [msg({ created_at: ago(30) }), ...four] }),
    ).toBeNull();
  });
});

describe("still reviewing check-ins: settings and wording", () => {
  it("is off until the group turns it on, and other texts stay on by default", () => {
    expect(isOn(parseAutomations({}), "waiting")).toBe(false);
    expect(isOn(parseAutomations({}), "welcome")).toBe(true);
    expect(isOn(parseAutomations({ texts: { waiting: { enabled: true } } }), "waiting")).toBe(true);
    expect(waitingText(parseAutomations({}), 1, { first: "Jo" })).toBeNull();
  });
  it("switches up the default wording on later check-ins; the group's own wording is kept", () => {
    const on = parseAutomations({ texts: { waiting: { enabled: true } } });
    const vars = { first: "Jo", store: "ABC Ford", job: "Porter" };
    const texts = [1, 2, 3, 4].map((n) => waitingText(on, n, vars)!);
    expect(new Set(texts).size).toBe(4);
    expect(texts[0]).toContain("still reviewing applications for Porter");
    for (const t of texts) expect(t).not.toMatch(/\{|\}|Thank you for your interest/);
    const custom = parseAutomations({
      texts: { waiting: { enabled: true, text: "Still on it, {first}!" } },
    });
    expect(waitingText(custom, 3, vars)).toBe("Still on it, Jo!");
  });
});

function world(automations: unknown) {
  return fakeSupabase({
    applications: [
      {
        id: "a1",
        org_id: "o1",
        dealership_id: "s1",
        job_id: "j1",
        full_name: "Marcus Lee",
        phone: "214-555-0199",
        candidate_id: "c1",
        status: "new",
        ai_paused_at: null,
        needs_attention: null,
        created_at: ago(6),
      },
    ],
    dealerships: [
      {
        id: "s1",
        org_id: "o1",
        name: "Grand Rapids Ford",
        assistant_name: "Penny",
        address: "1 Main St",
        sms_number: "+16165550100",
        timezone: "America/Chicago",
        manager_name: "Dana",
        manager_phone: "616-555-0101",
        escalation_name: null,
        escalation_phone: null,
      },
    ],
    jobs: [
      {
        id: "j1",
        title: "Service Technician",
        hiring_manager: null,
        hiring_manager_phone: null,
        escalation_name: null,
        escalation_phone: null,
      },
    ],
    candidates: [{ id: "c1", sms_opt_in: true, sms_opted_out_at: null }],
    messaging_settings: automations ? [{ org_id: "o1", automations }] : [],
    sms_opt_outs: [],
    messages: [
      {
        application_id: "a1",
        party: "candidate",
        direction: "out",
        purpose: "welcome",
        status: "simulated",
        body: "Hi Marcus!",
        created_at: ago(5),
      },
    ],
    interviews: [],
    retention_checkins: [],
    application_events: [],
  });
}

describe("still reviewing check-ins: scheduled run", () => {
  it("sends nothing while the setting is off, but the preview shows who would get one", async () => {
    const { client, tables } = world(null);
    expect((await runWorkflows(client, { now })).waitingCheckins).toBe(0);
    expect(tables["messages"]).toHaveLength(1);
    const plan = await waitingCheckinPlan(client, {
      now,
      orgId: "o1",
      automations: parseAutomations({}),
    });
    expect(plan).toMatchObject([
      { first: "Marcus", store: "Grand Rapids Ford", job: "Service Technician", n: 1 },
    ]);
    expect(tables["messages"]).toHaveLength(1);
  });
  it("texts the applicant through the outbox once it's on, and doesn't repeat on the next run", async () => {
    const { client, tables } = world({ texts: { waiting: { enabled: true } } });
    expect((await runWorkflows(client, { now })).waitingCheckins).toBe(1);
    const sent = tables["messages"]!.at(-1)!;
    expect(sent).toMatchObject({
      party: "candidate",
      purpose: PURPOSE.waiting(1),
      to_phone: "+12145550199",
    });
    expect(sent["body"]).toContain("Hi Marcus, quick update");
    sent["created_at"] = new Date(now).toISOString();
    expect((await runWorkflows(client, { now: now + 3600e3 })).waitingCheckins).toBe(0);
  });
});
