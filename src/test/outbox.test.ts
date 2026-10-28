import { afterEach, describe, expect, it, vi } from "vitest";
import { applyKeyword, deliverDue, queueText } from "@/lib/messaging/outbox.server";
import { zonedTime } from "@/lib/messaging/core";
import { fakeSupabase } from "./fake-supabase";

const noon = zonedTime("2026-10-27", "12:00", "America/Chicago"); // Tuesday
const night = zonedTime("2026-10-27", "21:00", "America/Chicago");

function world(
  over: { consent?: boolean; mode?: "practice" | "live"; storeLive?: boolean; managerPhone?: string | null } = {},
) {
  return fakeSupabase({
    applications: [
      {
        id: "a1",
        org_id: "o1",
        dealership_id: "s1",
        job_id: "j1",
        phone: "(214) 555-0199",
        candidate_id: "c1",
      },
    ],
    dealerships: [
      {
        id: "s1",
        org_id: "o1",
        name: "Grand Rapids Ford",
        sms_number: "+16165550100",
        timezone: "America/Chicago",
        manager_name: "Dana",
        manager_phone: over.managerPhone === undefined ? "616-555-0101" : over.managerPhone,
      },
    ],
    jobs: [{ id: "j1", hiring_manager: null, hiring_manager_phone: null }],
    candidates: [{ id: "c1", sms_opt_in: over.consent ?? true, sms_opted_out_at: null }],
    messaging_settings: over.mode ? [{ org_id: "o1", mode: over.mode }] : [],
    store_texting: (over.storeLive ?? over.mode === "live") ? [{ store_id: "s1", live: true }] : [],
    sms_opt_outs: [],
    messages: [],
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("outbox", () => {
  it("queues a text to the candidate's normalized number from the store number", async () => {
    const { client, tables } = world();
    const row = await queueText(client, {
      applicationId: "a1",
      party: "candidate",
      body: "Hi!",
      purpose: "welcome",
      now: noon,
    });
    expect(row.status).toBe("queued");
    expect(tables["messages"]![0]).toMatchObject({
      to_phone: "+12145550199",
      from_phone: "+16165550100",
      direction: "out",
      channel: "sms",
      purpose: "welcome",
      scheduled_for: new Date(noon).toISOString(),
    });
  });

  it("holds an evening text until 8am", async () => {
    const { client } = world();
    const row = await queueText(client, {
      applicationId: "a1",
      party: "candidate",
      body: "Hi!",
      purpose: "welcome",
      now: night,
    });
    expect(row.scheduled_for).toBe(
      new Date(zonedTime("2026-10-28", "08:00", "America/Chicago")).toISOString(),
    );
  });

  it("won't text a candidate who didn't agree to texts", async () => {
    const { client } = world({ consent: false });
    const row = await queueText(client, {
      applicationId: "a1",
      party: "candidate",
      body: "Hi!",
      purpose: "welcome",
      now: noon,
    });
    expect(row).toMatchObject({ status: "blocked", error: "Candidate hasn't agreed to texts" });
  });

  it("texts the store's hiring contact for manager messages", async () => {
    const { client, tables } = world();
    await queueText(client, {
      applicationId: "a1",
      party: "manager",
      body: "Reply 1 or 2",
      purpose: "summary",
      now: noon,
    });
    expect(tables["messages"]![0]!["to_phone"]).toBe("+16165550101");
  });

  it("practice mode lets missing manager numbers through with a note", async () => {
    const { client } = world({ managerPhone: null });
    const row = await queueText(client, {
      applicationId: "a1",
      party: "manager",
      body: "x",
      purpose: "summary",
      now: noon,
    });
    expect(row).toMatchObject({
      status: "queued",
      error: "No mobile number on file (practice only)",
    });
    const live = world({ managerPhone: null, mode: "live" });
    const blocked = await queueText(live.client, {
      applicationId: "a1",
      party: "manager",
      body: "x",
      purpose: "summary",
      now: noon,
    });
    expect(blocked.status).toBe("blocked");
  });

  it("STOP blocks future texts for the whole group, and START undoes it", async () => {
    const { client, tables } = world();
    await applyKeyword(client, {
      orgId: "o1",
      phone: "+12145550199",
      keyword: "stop",
      candidateId: "c1",
      source: "sms",
    });
    expect(tables["sms_opt_outs"]).toHaveLength(1);
    expect(tables["candidates"]![0]).toMatchObject({ sms_opt_in: false });
    const row = await queueText(client, {
      applicationId: "a1",
      party: "candidate",
      body: "Hi!",
      purpose: "welcome",
      now: noon,
    });
    expect(row).toMatchObject({ status: "blocked", error: "This number replied STOP" });
    // The confirmation of the STOP itself still goes out
    const confirm = await queueText(client, {
      applicationId: "a1",
      party: "candidate",
      body: "Unsubscribed",
      purpose: "keyword",
      isKeywordReply: true,
      now: noon,
    });
    expect(confirm.status).toBe("queued");

    await applyKeyword(client, {
      orgId: "o1",
      phone: "+12145550199",
      keyword: "start",
      candidateId: "c1",
      source: "sms",
    });
    expect(tables["sms_opt_outs"]).toHaveLength(0);
    expect(tables["candidates"]![0]).toMatchObject({ sms_opt_in: true, sms_opted_out_at: null });
  });
});

describe("deliverDue", () => {
  it("practice mode marks due texts as simulated and never calls the provider", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { client, tables } = world();
    await queueText(client, {
      applicationId: "a1",
      party: "candidate",
      body: "Hi!",
      purpose: "welcome",
      now: noon,
    });
    const r = await deliverDue(client, { now: noon + 1000 });
    expect(r).toMatchObject({ simulated: 1, sent: 0 });
    expect(tables["messages"]![0]).toMatchObject({ status: "simulated", provider: "practice" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaves held texts alone until they're due", async () => {
    const { client, tables } = world();
    await queueText(client, {
      applicationId: "a1",
      party: "candidate",
      body: "Hi!",
      purpose: "welcome",
      now: night,
    });
    await deliverDue(client, { now: night + 60_000 });
    expect(tables["messages"]![0]!["status"]).toBe("queued");
  });

  it("live mode sends through Twilio and records the message id", async () => {
    process.env["TWILIO_ACCOUNT_SID"] = "AC1";
    process.env["TWILIO_AUTH_TOKEN"] = "tok";
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sid: "SM999" }) });
    vi.stubGlobal("fetch", fetchSpy);
    const { client, tables } = world({ mode: "live" });
    await queueText(client, {
      applicationId: "a1",
      party: "candidate",
      body: "Hi!",
      purpose: "welcome",
      now: noon,
    });
    const r = await deliverDue(client, { now: noon + 1000 });
    expect(r.sent).toBe(1);
    expect(tables["messages"]![0]).toMatchObject({ status: "sent", provider_message_id: "SM999" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toContain("/Accounts/AC1/Messages.json");
    expect(String(init.body)).toContain("To=%2B12145550199");
    delete process.env["TWILIO_ACCOUNT_SID"];
    delete process.env["TWILIO_AUTH_TOKEN"];
  });

  it("live mode without Twilio connected fails safely with a clear reason", async () => {
    const { client, tables } = world({ mode: "live" });
    await queueText(client, {
      applicationId: "a1",
      party: "candidate",
      body: "Hi!",
      purpose: "welcome",
      now: noon,
    });
    await deliverDue(client, { now: noon + 1000 });
    expect(tables["messages"]![0]).toMatchObject({
      status: "failed",
      error: "Texting provider isn't connected yet",
    });
  });

  it("store with live texting off only simulates, even if the group is live", async () => {
    const { client, tables } = world({ mode: "live", storeLive: false });
    await queueText(client, { applicationId: "a1", party: "candidate", body: "Hi!", purpose: "welcome", now: noon });
    await deliverDue(client, { now: noon + 1000 });
    expect(tables["messages"]![0]!["status"]).toBe("simulated");
  });
});
