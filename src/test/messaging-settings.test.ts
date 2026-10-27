import { describe, expect, it } from "vitest";
import { defaultMessagingSettings, messagingSettingsSchema } from "@/lib/messaging-settings";

describe("group texting requirements", () => {
  it("defaults to practice", () => expect(defaultMessagingSettings().mode).toBe("practice"));
  it("defaults to 08:00 through 18:00", () => {
    expect(defaultMessagingSettings().send_start).toBe("08:00");
    expect(defaultMessagingSettings().send_end).toBe("18:00");
  });
  it("defaults to Monday through Saturday", () => expect(defaultMessagingSettings().send_days).toEqual([1,2,3,4,5,6]));
  it("defaults nudges to 4 hours", () => expect(defaultMessagingSettings().nudge_after_hours).toBe(4));
  it("defaults escalation to 24 hours", () => expect(defaultMessagingSettings().escalate_after_hours).toBe(24));
  it("defaults AI to lovable", () => expect(defaultMessagingSettings().ai_provider).toBe("lovable"));
  it("only accepts practice or live", () => {
    expect(messagingSettingsSchema.safeParse({ mode: "live" }).success).toBe(true);
    expect(messagingSettingsSchema.safeParse({ mode: "production" }).success).toBe(false);
  });
  it("only accepts lovable or anthropic", () => {
    expect(messagingSettingsSchema.safeParse({ ai_provider: "anthropic" }).success).toBe(true);
    expect(messagingSettingsSchema.safeParse({ ai_provider: "other" }).success).toBe(false);
  });
  it("uses days 1 through 7", () => {
    expect(messagingSettingsSchema.safeParse({ send_days: [1,7] }).success).toBe(true);
    expect(messagingSettingsSchema.safeParse({ send_days: [0,8] }).success).toBe(false);
  });
});