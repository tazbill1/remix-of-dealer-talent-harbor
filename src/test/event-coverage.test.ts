import { describe, expect, it } from "vitest";
import { coveredEventStores, eventScopeOptions, eventScanCounts, parsePublicEventCoverage } from "@/lib/event-coverage";
const stores = [{ id: "dallas", name: "Dallas", region_id: "north" }, { id: "plano", name: "Plano", region_id: "north" }, { id: "houston", name: "Houston", region_id: "south" }];
const event = { coverage_mode: "stores", covered_store_ids: ["dallas", "plano"], region_id: null, store_id: null };
describe("recruiting event coverage", () => {
  it("specific stores covers one or more selected stores only", () => {
    expect(coveredEventStores(event, stores).map((s) => s.id)).toEqual(["dallas", "plano"]);
    expect(coveredEventStores({ ...event, covered_store_ids: ["dallas"] }, stores).map((s) => s.id)).toEqual(["dallas"]);
  });
  it("region covers every store in that region and group covers all", () => {
    expect(coveredEventStores({ ...event, coverage_mode: "region", region_id: "north" }, stores).map((s) => s.id)).toEqual(["dallas", "plano"]);
    expect(coveredEventStores({ ...event, coverage_mode: "group" }, stores)).toHaveLength(3);
  });
  it("existing single-store event stays on its original store", () => {
    expect(coveredEventStores({ ...event, coverage_mode: "legacy", store_id: "houston" }, stores).map((s) => s.id)).toEqual(["houston"]);
  });
  it("admin scope options include group and all authorized regions", () => {
    expect(eventScopeOptions({ group_allowed: true, region_ids: ["north", "south"] }, [{ id: "north", name: "North" }, { id: "south", name: "South" }])).toEqual({ group: true, regions: [{ id: "north", name: "North" }, { id: "south", name: "South" }] });
  });
  it("GM scope options hide group and regions not fully assigned", () => {
    const regions = [{ id: "north", name: "North" }, { id: "south", name: "South" }];
    expect(eventScopeOptions({ group_allowed: false, region_ids: [] }, regions)).toEqual({ group: false, regions: [] });
    expect(eventScopeOptions({ group_allowed: false, region_ids: ["north"] }, regions).regions).toEqual([regions[0]]);
  });
  it("event totals sum the actual store rows once and keep other events out", () => {
    const count = eventScanCounts([{ event_id: "event", store_id: "dallas", applicants: 3, hires: 1 }, { event_id: "event", store_id: "plano", applicants: 2, hires: 0 }, { event_id: "other", store_id: "dallas", applicants: 100, hires: 10 }], "event");
    expect(count.applicants).toBe(5); expect(count.hires).toBe(1); expect(count.stores.map((s) => s.store_id)).toEqual(["dallas", "plano"]);
  });
  it("public coverage contains only valid store IDs and rejects malformed data", () => {
    expect(parsePublicEventCoverage({ mode: "stores", name: "Fair", org_slug: "abc-motors", store_ids: ["dallas", "plano", 1] })?.storeIds).toEqual(["dallas", "plano"]);
    expect(parsePublicEventCoverage(null)).toBeNull();
  });
});