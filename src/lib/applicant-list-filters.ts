import { z } from "zod";
import { STATUSES } from "@/lib/jobs";

// Deliberately no applicant IDs, actions, selection or messaging fields.
export const listFilterSchema = z.object({
  status: z.enum(STATUSES).nullable(),
  stores: z.array(z.string()),
  jobs: z.array(z.string()),
  region: z.string().nullable(),
  source: z.string().nullable(),
  query: z.string().nullable(),
  applied: z.enum(["today", "7", "30", "month"]).nullable(),
  contacted: z.string().nullable(),
  noReply: z.number().nullable(),
  interviewWeek: z.boolean(),
  overdue: z.boolean(),
  attention: z.boolean(),
  unmapped: z.array(z.string()),
}).strict();
export type ListFilterResult = z.infer<typeof listFilterSchema>;
export type FilterCatalog = { stores: { id: string; name: string; brand: string | null }[]; jobs: { id: string; title: string; dealership_id: string }[]; regions: { id: string; name: string }[]; sources: string[] };

export function normalizeListFilters(result: ListFilterResult, catalog: FilterCatalog) {
  const unmapped = [...result.unmapped];
  const allowed = (ids: string[], options: { id: string }[], label: string) => ids.filter((id) => {
    if (options.some((o) => o.id === id)) return true;
    unmapped.push(`That ${label} isn't available in your store access.`); return false;
  });
  const stores = allowed(result.stores, catalog.stores, "store");
  const jobs = allowed(result.jobs, catalog.jobs, "job");
  const region = result.region && catalog.regions.some((r) => r.id === result.region) ? result.region : null;
  if (result.region && !region) unmapped.push("That region isn't available.");
  const source = result.source && catalog.sources.includes(result.source) ? result.source : null;
  if (result.source && !source) unmapped.push("That source isn't available.");
  const contacted = result.contacted === "never" || /^\d{1,3}$/.test(result.contacted ?? "") && Number(result.contacted) > 0 ? result.contacted : null;
  const noReply = result.noReply !== null && Number.isInteger(result.noReply) && result.noReply > 0 && result.noReply <= 365 ? result.noReply : null;
  return { ...result, stores, jobs, region, source, contacted, noReply, query: result.query?.slice(0, 100) || null, unmapped: [...new Set(unmapped)].slice(0, 8) };
}

export function listFilterPatch(result: ListFilterResult) {
  return {
    q: result.query || undefined, status: result.status || undefined,
    store: result.stores.join(",") || undefined, job: result.jobs.join(",") || undefined,
    region: result.region || undefined, source: result.source || undefined,
    applied: result.applied || undefined, filter: undefined,
    contacted: result.contacted || undefined, noReply: result.noReply?.toString(),
    interviewWeek: result.interviewWeek ? "1" : undefined,
    overdue: result.overdue ? "1" : undefined, attention: result.attention ? "1" : undefined,
  };
}