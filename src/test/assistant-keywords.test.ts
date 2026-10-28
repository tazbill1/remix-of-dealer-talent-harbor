import { describe, expect, it } from "vitest";
import { runAssistant } from "@/lib/assistant.server";
import { fakeSupabase } from "./fake-supabase";

function world(mode: "practice" | "live") {
  return fakeSupabase({
    applications: [
      {
        id: "a1",
        org_id: "o1",
        dealership_id: "s1",
        job_id: "j1",
        full_name: "Marcus Lee",
        phone: "+12145550199",
        candidate_id: "c1",
        status: "screening",
        profile: {},
      },
    ],
    jobs: [{ id: "j1", title: "Tech", hiring_manager: null, hiring_manager_phone: null }],
    dealerships: [
      {
        id: "s1",
        name: "GR Ford",
        assistant_name: "Penny",
        manager_name: "Dana",
        manager_phone: "+16165550101",
        timezone: "America/Chicago",
        sms_number: "+14798020607",
      },
    ],
    candidates: [{ id: "c1", sms_opt_in: true, sms_opted_out_at: null }],
    messaging_settings: [{ org_id: "o1", mode }],
    sms_opt_outs: [],
    messages: [],
    interviews: [],
    application_events: [],
  });
}

describe("STOP from a real phone", () => {
  it("live: records the opt-out and lets Twilio send the confirmation (no second reply)", async () => {
    const { client, tables } = world("live");
    const r = await runAssistant(client, client, {
      applicationId: "a1",
      party: "candidate",
      body: "STOP",
      actorId: null,
      source: "sms",
      inbound: { from: "+12145550199", to: "+14798020607", providerMessageId: "SM1" },
    });
    expect(r.keyword).toBe("stop");
    expect(r.delivery).toBe("carrier");
    expect(tables["sms_opt_outs"]).toHaveLength(1);
    expect(tables["messages"]!.filter((m) => m["direction"] === "out")).toHaveLength(0);
  });

  it("practice: shows the confirmation in the thread", async () => {
    const { client, tables } = world("practice");
    await runAssistant(client, client, {
      applicationId: "a1",
      party: "candidate",
      body: "STOP",
      actorId: "u1",
      source: "practice",
    });
    const out = tables["messages"]!.filter((m) => m["direction"] === "out");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ purpose: "keyword", status: "simulated" });
  });
});

describe("plain-language opt-out", () => {
  it("live: records the opt-out and sends our own confirmation (Twilio doesn't catch it)", async () => {
    const { client, tables } = world("live");
    const r = await runAssistant(client, client, {
      applicationId: "a1",
      party: "candidate",
      body: "Please stop texting me",
      actorId: null,
      source: "sms",
      inbound: { from: "+12145550199", to: "+14798020607", providerMessageId: "SM2" },
    });
    expect(r.keyword).toBe("stop");
    expect(tables["sms_opt_outs"]).toHaveLength(1);
    const out = tables["messages"]!.filter((m) => m["direction"] === "out");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ purpose: "keyword" });
    expect(String(out[0]!["body"])).toContain("unsubscribed");
  });
});
