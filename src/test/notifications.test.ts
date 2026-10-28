import { describe, expect, it } from "vitest";
import { humanAlertEmailOn, wantsPersonMessage, wantsPersonRecipients } from "@/lib/notifications";
import { parseAutomations } from "@/lib/automations";

const m = (id: string, role: string) => ({ id, user_id: `u-${id}`, role, email: null });
const store = { id: "s1", region_id: "r1" };

describe("wants-a-person alerts", () => {
  it("go to the store's hiring managers and GM, not other stores'", () => {
    const members = [m("hm", "hiring_manager"), m("gm", "dealer_manager"), m("other", "hiring_manager"), m("hr", "recruiter")];
    const scopes = [
      { member_id: "hm", dealership_id: "s1", region_id: null },
      { member_id: "gm", dealership_id: null, region_id: "r1" },
      { member_id: "other", dealership_id: "s2", region_id: null },
    ];
    expect(wantsPersonRecipients(members, scopes, store).map((x) => x.id)).toEqual(["hm", "gm"]);
  });
  it("fall back to HR, then group admins", () => {
    expect(wantsPersonRecipients([m("hr", "recruiter"), m("ga", "group_admin")], [], store).map((x) => x.id)).toEqual(["hr"]);
    expect(wantsPersonRecipients([m("ga", "group_admin")], [], store).map((x) => x.id)).toEqual(["ga"]);
  });
  it("uses the requested wording", () => {
    expect(wantsPersonMessage("Leah Jones", "LG Ford Cincy")).toBe("Leah Jones wants to talk with a person — LG Ford Cincy.");
  });
  it("email alert is off by default", () => {
    expect(humanAlertEmailOn(parseAutomations({}))).toBe(false);
    expect(humanAlertEmailOn(parseAutomations({ texts: {}, humanAlert: { email: true } }))).toBe(true);
  });
});
