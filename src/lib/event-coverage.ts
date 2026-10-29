export type EventScope = { coverage_mode: string; covered_store_ids: string[]; region_id: string | null; store_id: string | null };
export type EventStore = { id: string; name: string; region_id: string | null };
export function coveredEventStores(event: EventScope, stores: EventStore[]) {
  return stores.filter((s) => event.coverage_mode === "group" ? true : event.coverage_mode === "region" ? s.region_id === event.region_id : event.coverage_mode === "stores" ? event.covered_store_ids.includes(s.id) : !event.store_id || s.id === event.store_id);
}
export function eventScopeOptions(options: { group_allowed: boolean; region_ids: string[] }, regions: { id: string; name: string }[]) {
  return { group: options.group_allowed, regions: regions.filter((r) => options.region_ids.includes(r.id)) };
}
export function eventScanCounts(rows: { event_id: string | null; store_id: string | null; applicants: number | null; hires: number | null }[], eventId: string) {
  const stores = rows.filter((r) => r.event_id === eventId);
  return { stores, applicants: stores.reduce((sum, r) => sum + (r.applicants ?? 0), 0), hires: stores.reduce((sum, r) => sum + (r.hires ?? 0), 0) };
}
export function parsePublicEventCoverage(value: unknown): { mode: string; storeIds: string[]; name: string; orgSlug: string; stores: { id: string; name: string; brand: string | null; city: string | null; state: string | null }[] } | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r["mode"] !== "string" || typeof r["name"] !== "string" || typeof r["org_slug"] !== "string" || !Array.isArray(r["store_ids"])) return null;
  const stores = Array.isArray(r["stores"]) ? r["stores"].flatMap((s: unknown) => {
    if (!s || typeof s !== "object") return [];
    const row = s as Record<string, unknown>;
    if (typeof row["id"] !== "string" || typeof row["name"] !== "string") return [];
    return [{ id: row["id"], name: row["name"], brand: typeof row["brand"] === "string" ? row["brand"] : null, city: typeof row["city"] === "string" ? row["city"] : null, state: typeof row["state"] === "string" ? row["state"] : null }];
  }) : [];
  return { mode: r["mode"], name: r["name"], orgSlug: r["org_slug"], storeIds: r["store_ids"].filter((id): id is string => typeof id === "string"), stores };
}