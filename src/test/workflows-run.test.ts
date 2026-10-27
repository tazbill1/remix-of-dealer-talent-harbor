import { describe, expect, it } from "vitest";
import { zonedTime } from "@/lib/messaging/core";
import { handleManagerShortReply } from "@/lib/workflows/replies.server";
import { PURPOSE } from "@/lib/workflows/rules";
import { runWorkflows, welcomeOnApply } from "@/lib/workflows/run.server";
import { fakeSupabase } from "./fake-supabase";

type ReplyApp = Parameters<typeof handleManagerShortReply>[2]["app"];
type Rows = Record<string, Record<string, unknown>[]>;

const ct = (ymd: string, hhmm: string) => zonedTime(ymd, hhmm, "America/Chicago");
const tue10 = ct("2026-10-27", "10:00");

function world(app: Record<string, unknown> = {}) {
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
        status: "screening",
        ai_summary: "6 yrs Ford tech, ASE certified, can start in 2 weeks.",
        rating: 4,
        start_date: null,
        hired_at: null,
        departed_at: null,
        created_at: "2026-10-20T00:00:00Z",
        ...app,
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
        escalation_name: "Gina GM",
        escalation_phone: "616-555-0102",
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
    messaging_settings: [],
    sms_opt_outs: [],
    messages: [],
    interviews: [],
    retention_checkins: [],
    application_events: [],
  });
}
const outs = (tables: Rows) => tables["messages"]!.filter((m) => m["direction"] === "out");

describe("welcome on apply", () => {
  it("texts the applicant (practice: simulated)", async () => {
    const { client, tables } = world({ status: "new" });
    await welcomeOnApply(client, "a1", tue10);
    expect(outs(tables)).toHaveLength(1);
    expect(outs(tables)[0]).toMatchObject({
      party: "candidate",
      purpose: PURPOSE.welcome,
      status: "simulated",
      to_phone: "+12145550199",
    });
    expect(outs(tables)[0]!["body"]).toContain("Hi Marcus!");
  });
});

describe("manager follow-up", () => {
  it("summary, then nudge, then escalation to the escalation contact; runs are idempotent", async () => {
    const { client, tables } = world();
    // Stamp each new text with the run's time, as the database would.
    const run = async (at: number) => {
      const r = await runWorkflows(client, { now: at });
      for (const m of tables["messages"]!)
        if (!m["_t"]) Object.assign(m, { _t: 1, created_at: new Date(at).toISOString() });
      return r;
    };
    expect((await run(tue10)).summaries).toBe(1);
    expect(outs(tables)[0]).toMatchObject({ purpose: PURPOSE.summary, to_phone: "+16165550101" });
    expect(outs(tables)[0]!["body"]).toContain("Reply 1 to interview, 2 to pass");
    expect((await run(tue10 + 5 * 60e3)).summaries).toBe(0);
    expect((await run(ct("2026-10-27", "14:00"))).nudges).toBe(1);
    expect((await run(ct("2026-10-27", "14:05"))).nudges).toBe(0);
    expect((await run(ct("2026-10-29", "14:00"))).escalations).toBe(1);
    expect(outs(tables).at(-1)).toMatchObject({
      purpose: PURPOSE.escalation,
      to_phone: "+16165550102",
    });
    expect(outs(tables).at(-1)!["body"]).toContain("Dana hasn't answered");
  });

  it("'1' moves the candidate to Interview and invites them; '2' passes politely", async () => {
    for (const [reply, status, purpose] of [
      ["1", "interview", PURPOSE.inviteCandidate],
      ["2", "rejected", PURPOSE.declineCandidate],
    ] as const) {
      const { client, tables } = world();
      await runWorkflows(client, { now: tue10 });
      const app = tables["applications"]![0]!;
      const r = await handleManagerShortReply(client, client, {
        app: app as unknown as ReplyApp,
        storeName: "Grand Rapids Ford",
        jobTitle: "Service Technician",
        timeZone: "America/Chicago",
        body: reply,
        replyTo: "+16165550101",
        now: tue10 + 60e3,
      });
      expect(r?.status).toBe(status);
      expect(app["status"]).toBe(status);
      const candidateText = outs(tables).find((m) => m["party"] === "candidate");
      expect(candidateText).toMatchObject({ purpose, to_phone: "+12145550199" });
      expect(outs(tables).at(-1)).toMatchObject({ purpose: PURPOSE.decisionAck });
    }
  });

  it("leaves other manager texts to the AI", async () => {
    const { client, tables } = world();
    await runWorkflows(client, { now: tue10 });
    const r = await handleManagerShortReply(client, client, {
      app: tables["applications"]![0] as unknown as ReplyApp,
      storeName: "x",
      jobTitle: "x",
      timeZone: "America/Chicago",
      body: "Does he have his own tools?",
      replyTo: null,
      now: tue10,
    });
    expect(r).toBeNull();
  });
});

describe("interview reminders", () => {
  it("reminds the candidate the day before, and both sides 2 hours before", async () => {
    const { client, tables } = world({ status: "interview" });
    tables["interviews"]!.push({
      id: "i1",
      application_id: "a1",
      status: "scheduled",
      starts_at: new Date(ct("2026-10-28", "14:00")).toISOString(),
      created_at: new Date(ct("2026-10-26", "09:00")).toISOString(),
    });
    expect((await runWorkflows(client, { now: ct("2026-10-27", "15:00") })).reminders).toBe(1);
    expect(outs(tables)[0]!["body"]).toContain("Address: 1 Main St");
    expect((await runWorkflows(client, { now: ct("2026-10-27", "15:05") })).reminders).toBe(0);
    expect((await runWorkflows(client, { now: ct("2026-10-28", "12:30") })).reminders).toBe(2);
  });
});

describe("30/60/90 check-ins", () => {
  it("asks the manager on the due day and records a 'N' as a departure", async () => {
    const { client, tables } = world({
      status: "hired",
      start_date: "2026-09-27",
      hired_at: "2026-09-20T00:00:00Z",
    });
    expect((await runWorkflows(client, { now: tue10 })).checkins).toBe(1); // 30 days = Oct 27
    expect(outs(tables)[0]).toMatchObject({ purpose: "checkin_30", party: "manager" });
    expect(tables["retention_checkins"]![0]).toMatchObject({ day_mark: 30, due_on: "2026-10-27" });
    expect((await runWorkflows(client, { now: tue10 + 60e3 })).checkins).toBe(0);

    const app = tables["applications"]![0]!;
    const r = await handleManagerShortReply(client, client, {
      app: app as unknown as ReplyApp,
      storeName: "Grand Rapids Ford",
      jobTitle: "Service Technician",
      timeZone: "America/Chicago",
      body: "N",
      replyTo: "+16165550101",
      now: tue10 + 2 * 60e3,
    });
    expect(r?.reply).toContain("HR can follow up");
    expect(tables["retention_checkins"]![0]).toMatchObject({
      still_employed: false,
      response: "N",
    });
    expect(app["departed_at"]).toBe("2026-10-26");
  });
});
