import { describe, expect, it } from "vitest";
import { canSeeNav } from "@/lib/nav";

const gm = { role: "dealer_manager", isPlatformAdmin: false };
const hm = { role: "hiring_manager", isPlatformAdmin: false };
const hr = { role: "recruiter", isPlatformAdmin: false };
const rl = { role: "regional_leader", isPlatformAdmin: false };

describe("role-based menu", () => {
  it("hides admin settings and duplicates from GMs and hiring managers", () => {
    for (const p of ["/duplicates", "/status-rules", "/onboarding-templates", "/team", "/integrations", "/templates", "/automations"]) {
      expect(canSeeNav(p, gm)).toBe(false);
      expect(canSeeNav(p, hm)).toBe(false);
    }
  });
  it("GMs keep stores, onboarding and events", () => {
    for (const p of ["/stores", "/new-hires", "/events", "/applicants"]) expect(canSeeNav(p, gm)).toBe(true);
  });
  it("HR sees settings but Team stays group-admin only", () => {
    expect(canSeeNav("/status-rules", hr)).toBe(true);
    expect(canSeeNav("/team", hr)).toBe(false);
    expect(canSeeNav("/team", { role: "group_admin", isPlatformAdmin: false })).toBe(true);
  });
  it("regional leaders don't see onboarding, events or admin pages", () => {
    expect(canSeeNav("/new-hires", rl)).toBe(false);
    expect(canSeeNav("/events", rl)).toBe(false);
    expect(canSeeNav("/integrations", rl)).toBe(false);
    expect(canSeeNav("/referrals", rl)).toBe(true);
  });
});

import { settingsTabsFor } from "@/lib/nav";
describe("settings tabs", () => {
  it("HR sees every settings tab", () => {
    expect(settingsTabsFor(hr).map((t) => t.id)).toEqual(["rules", "templates", "texts", "onboarding", "videos"]);
  });
  it("GMs and regional leaders only see Videos", () => {
    expect(settingsTabsFor(gm).map((t) => t.id)).toEqual(["videos"]);
    expect(settingsTabsFor(rl).map((t) => t.id)).toEqual(["videos"]);
  });
});
