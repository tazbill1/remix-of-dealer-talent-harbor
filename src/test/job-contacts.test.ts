import { describe, expect, it } from "vitest";
import { escalationForStores, managersForStores } from "@/lib/job-contacts";

describe("job store contact choices", () => {
  const managers = [
    { user_id: "gm-dallas", store_id: "dallas", name: "Dallas GM", email: "gm@example.com" },
    { user_id: "gm-both", store_id: "dallas", name: "Regional GM", email: "both@example.com" },
    { user_id: "gm-both", store_id: "plano", name: "Regional GM", email: "both@example.com" },
  ];
  it("only offers managers assigned to the job store", () => {
    expect(managersForStores(managers, ["plano"]).map((m) => m.user_id)).toEqual(["gm-both"]);
  });
  it("requires assignment to every store for a multi-store posting", () => {
    expect(managersForStores(managers, ["dallas", "plano"]).map((m) => m.user_id)).toEqual(["gm-both"]);
  });
  it("offers no managers before stores are chosen", () => {
    expect(managersForStores(managers, [])).toEqual([]);
  });
  it("does not copy one store's escalation default onto another", () => {
    expect(escalationForStores([
      { store_id: "dallas", user_id: "hr-dallas", name: "Dallas HR", phone: null },
      { store_id: "plano", user_id: "hr-plano", name: "Plano HR", phone: null },
    ], ["dallas", "plano"])).toBeNull();
  });
});