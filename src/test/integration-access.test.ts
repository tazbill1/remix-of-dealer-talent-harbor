import { describe, expect, it } from "vitest";
import { canEditIntegrationSettings } from "@/lib/integration-access";

describe("Integration settings access", () => {
  it("allows HR to edit", () => expect(canEditIntegrationSettings({ role: "recruiter", isPlatformAdmin: false })).toBe(true));
  it("allows group admins to edit", () => expect(canEditIntegrationSettings({ role: "group_admin", isPlatformAdmin: false })).toBe(true));
  it("allows platform admins to edit", () => expect(canEditIntegrationSettings({ role: "hiring_manager", isPlatformAdmin: true })).toBe(true));
  it("keeps store managers read-only", () => {
    expect(canEditIntegrationSettings({ role: "hiring_manager", isPlatformAdmin: false })).toBe(false);
    expect(canEditIntegrationSettings({ role: "dealer_manager", isPlatformAdmin: false })).toBe(false);
  });
  it("keeps regional leaders read-only", () => expect(canEditIntegrationSettings({ role: "regional_leader", isPlatformAdmin: false })).toBe(false));
});