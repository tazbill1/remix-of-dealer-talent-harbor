import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emailFooter,
  mergeValues,
  normalizeEmail,
  renderTemplate,
  textToHtml,
  unknownFields,
} from "@/lib/email/core";
import { readUnsubscribeToken, unsubscribeToken } from "@/lib/email/provider.server";
import { queueEmail } from "@/lib/email/outbox.server";
import { applyEmailOptOut } from "@/lib/email/unsubscribe.server";
import { deliverDue } from "@/lib/messaging/outbox.server";
import { fakeSupabase } from "./fake-supabase";

beforeEach(() => {
  process.env["EMAIL_UNSUBSCRIBE_SECRET"] = "test-secret";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["LOVABLE_API_KEY"];
});

describe("email basics", () => {
  it("checks addresses and fills merge fields", () => {
    expect(normalizeEmail("  Marcus.Lee@Gmail.com ")).toBe("marcus.lee@gmail.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    const v = mergeValues({
      full_name: "Marcus Lee",
      job_title: "Service Technician",
      store_name: "GR Ford",
    });
    expect(renderTemplate("Hi {first_name}, the {job_title} role at {store_name}", v)).toBe(
      "Hi Marcus, the Service Technician role at GR Ford",
    );
    expect(unknownFields("Hi {first_name} {fav_color}")).toEqual(["fav_color"]);
  });

  it("escapes HTML and links URLs", () => {
    const html = textToHtml("Hi <b>you</b>\n\nSee https://x.com/jobs");
    expect(html).toContain("&lt;b&gt;you&lt;/b&gt;");
    expect(html).toContain('<a href="https://x.com/jobs">');
  });

  it("always has who sent it and how to unsubscribe", () => {
    expect(
      emailFooter({ storeName: "GR Ford", address: "1 Main St", unsubscribeUrl: "https://a/u/t" }),
    ).toContain("GR Ford · 1 Main St");
  });

  it("unsubscribe links can't be forged", async () => {
    const t = await unsubscribeToken("o1", "marcus@x.com");
    expect(await readUnsubscribeToken(t)).toEqual({ orgId: "o1", email: "marcus@x.com" });
    const [payload] = t.split(".");
    expect(await readUnsubscribeToken(`${payload}.forgedsignature000000000000000000`)).toBeNull();
    const other = Buffer.from("o2|marcus@x.com").toString("base64url");
    expect(await readUnsubscribeToken(`${other}.${t.split(".")[1]}`)).toBeNull();
  });
});

function world(
  mode: "practice" | "live" = "practice",
  email = "Marcus@X.com",
  fromAddress: string | null = "hiring@notify.example.com",
) {
  return fakeSupabase({
    applications: [{ id: "a1", org_id: "o1", dealership_id: "s1", email }],
    dealerships: [{ id: "s1", name: "GR Ford", address: "1 Main St" }],
    messaging_settings: [
      {
        org_id: "o1",
        email_mode: mode,
        email_from_name: null,
        email_reply_to: "hr@g.com",
        email_from_address: fromAddress,
      },
    ],
    candidates: [{ id: "c1", org_id: "o1", email: "marcus@x.com", email_opted_out_at: null }],
    messages: [],
    sms_opt_outs: [],
  });
}
const base = "https://hire.example.com";

describe("email outbox", () => {
  it("practice mode logs the email with footer and unsubscribe link, sends nothing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { client, tables } = world();
    const row = await queueEmail(client, {
      applicationId: "a1",
      subject: "Hi",
      body: "Hello",
      purpose: "email",
      baseUrl: base,
    });
    expect(row.status).toBe("queued");
    const r = await deliverDue(client, { ids: [row.id] });
    expect(r.simulated).toBe(1);
    const m = tables["messages"]![0]!;
    expect(m).toMatchObject({
      channel: "email",
      to_email: "marcus@x.com",
      status: "simulated",
      subject: "Hi",
    });
    expect(m["body"]).toContain(`${base}/u/`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips unsubscribed and invalid addresses", async () => {
    const { client, tables } = world();
    await applyEmailOptOut(client, "o1", "marcus@x.com", "test");
    expect(tables["candidates"]![0]!["email_opted_out_at"]).toBeTruthy();
    const row = await queueEmail(client, {
      applicationId: "a1",
      subject: "Hi",
      body: "x",
      purpose: "email",
      baseUrl: base,
    });
    expect(row).toMatchObject({ status: "blocked", error: "This address unsubscribed" });
    const bad = world("practice", "nope");
    const r2 = await queueEmail(bad.client, {
      applicationId: "a1",
      subject: "Hi",
      body: "x",
      purpose: "email",
      baseUrl: base,
    });
    expect(r2).toMatchObject({ status: "blocked", error: "No valid email address" });
  });

  it("live mode sends through Lovable from the group's sending address", async () => {
    process.env["LOVABLE_API_KEY"] = "lovable_test";
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true, message_id: "msg_1" }) });
    vi.stubGlobal("fetch", fetchSpy);
    const { client, tables } = world("live");
    const row = await queueEmail(client, {
      applicationId: "a1",
      subject: "Hi",
      body: "Hello",
      purpose: "email",
      baseUrl: base,
    });
    expect((await deliverDue(client, { ids: [row.id] })).sent).toBe(1);
    expect(tables["messages"]![0]).toMatchObject({
      status: "sent",
      provider: "lovable",
      provider_message_id: "msg_1",
      from_email: "hiring@notify.example.com",
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/^https:\/\/api\.lovable\.dev\//);
    const sent = JSON.parse(init.body);
    expect(sent.to).toBe("marcus@x.com");
    expect(sent.subject).toBe("Hi");
    expect(sent.reply_to).toBe("hr@g.com");
    expect(sent.sender_domain).toBe("notify.example.com");
    expect(String(sent.from)).toContain("hiring@notify.example.com");
  });

  it("live mode without a sending address fails with a clear reason", async () => {
    process.env["LOVABLE_API_KEY"] = "lovable_test";
    const { client, tables } = world("live", "Marcus@X.com", null);
    const row = await queueEmail(client, {
      applicationId: "a1",
      subject: "Hi",
      body: "x",
      purpose: "email",
      baseUrl: base,
    });
    await deliverDue(client, { ids: [row.id] });
    expect(tables["messages"]![0]).toMatchObject({
      status: "failed",
      error: "No sending address set — add one on the Integrations page",
    });
  });
});
