import { describe, expect, it } from "vitest";
import { twilioSignature, verifyTwilioRequest } from "@/lib/messaging/twilio.server";
import { mapTwilioStatus } from "@/lib/messaging/inbound.server";
import { escalationContact, managerContact } from "@/lib/messaging/outbox.server";
import { deliveryLabel } from "@/lib/messaging/labels";

describe("Twilio signatures", () => {
  const url = "https://hireme.example.com/api/sms/inbound";
  const params = { From: "+12145550199", To: "+19725550100", Body: "1", MessageSid: "SM123" };

  it("accepts a correctly signed request and rejects tampered ones", async () => {
    process.env["TWILIO_AUTH_TOKEN"] = "test-token";
    const sig = await twilioSignature(url, params, "test-token");
    expect(await verifyTwilioRequest(url, params, sig)).toBe(true);
    expect(await verifyTwilioRequest(url, { ...params, Body: "2" }, sig)).toBe(false);
    expect(await verifyTwilioRequest(`${url}?x=1`, params, sig)).toBe(false);
    expect(await verifyTwilioRequest(url, params, null)).toBe(false);
    delete process.env["TWILIO_AUTH_TOKEN"];
    expect(await verifyTwilioRequest(url, params, sig)).toBe(false);
  });
});

describe("contacts", () => {
  const store = {
    manager_name: "Dana",
    manager_phone: "(214) 555-0101",
    escalation_name: "GM Pat",
    escalation_phone: "214-555-0102",
  };
  it("uses the store's contacts by default", () => {
    expect(managerContact(store, null)).toEqual({ name: "Dana", phone: "+12145550101" });
    expect(escalationContact(store, null)).toEqual({ name: "GM Pat", phone: "+12145550102" });
  });
  it("lets a job override the store", () => {
    const job = {
      hiring_manager: "Service Mgr Lee",
      hiring_manager_phone: "2145550109",
      escalation_name: null,
      escalation_phone: null,
    };
    expect(managerContact(store, job)).toEqual({ name: "Service Mgr Lee", phone: "+12145550109" });
    expect(escalationContact(store, job).name).toBe("GM Pat");
  });
});

describe("delivery labels", () => {
  const out = { direction: "out", scheduled_for: null, error: null };
  it("describes each status in plain words", () => {
    expect(deliveryLabel({ ...out, status: "simulated" })).toBe("Practice · not sent");
    expect(deliveryLabel({ ...out, status: "blocked", error: "This number replied STOP" })).toBe(
      "Not sent: This number replied STOP",
    );
    expect(deliveryLabel({ ...out, status: "delivered" })).toBe("Delivered");
    expect(
      deliveryLabel(
        { ...out, status: "queued", scheduled_for: "2026-10-28T13:00:00Z" },
        Date.parse("2026-10-28T02:00:00Z"),
        "America/Chicago",
      ),
    ).toBe("Held until Wed 8:00 AM");
    expect(deliveryLabel({ ...out, direction: "in", status: "received" })).toBeNull();
  });
  it("maps Twilio receipts", () => {
    expect(mapTwilioStatus("delivered")).toBe("delivered");
    expect(mapTwilioStatus("undelivered")).toBe("failed");
    expect(mapTwilioStatus("queued")).toBeNull();
  });
});
