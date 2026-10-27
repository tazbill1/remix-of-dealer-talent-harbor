import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { storeInterviewers } from "@/lib/member-calendars.functions";

describe("whose calendars count for a store's interviews", () => {
  const db = fakeSupabase({
    dealerships: [
      { id: "s1", org_id: "o", region_id: "north" },
      { id: "s2", org_id: "o", region_id: "south" },
    ],
    org_members: [
      { id: "hm1", org_id: "o", email: "hm@store1", role: "hiring_manager" },
      { id: "gmN", org_id: "o", email: "gm@north", role: "dealer_manager" },
      { id: "rl", org_id: "o", email: "rl@north", role: "regional_leader" },
      { id: "hm2", org_id: "o", email: "hm@store2", role: "hiring_manager" },
      { id: "rec", org_id: "o", email: "recruiter", role: "recruiter" },
    ],
    org_member_scopes: [
      { member_id: "hm1", org_id: "o", dealership_id: "s1", region_id: null },
      { member_id: "gmN", org_id: "o", dealership_id: null, region_id: "north" },
      { member_id: "rl", org_id: "o", dealership_id: null, region_id: "north" },
      { member_id: "hm2", org_id: "o", dealership_id: "s2", region_id: null },
    ],
  });
  it("includes hiring managers and GMs covering the store (directly or by region)", async () => {
    const people = await storeInterviewers(db.client, "o", "s1");
    expect(people.map((p: { id: string }) => p.id).sort()).toEqual(["gmN", "hm1"]);
  });
  it("leaves out regional leaders, recruiters and other stores' managers", async () => {
    const people = await storeInterviewers(db.client, "o", "s2");
    expect(people.map((p: { id: string }) => p.id)).toEqual(["hm2"]);
  });
});
