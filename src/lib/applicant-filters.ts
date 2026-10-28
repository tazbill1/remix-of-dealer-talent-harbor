import { STATUSES } from "@/lib/jobs";
import { sourceLabel } from "@/lib/display";

/** Pure filtering and sorting for the Applicants page, so the rules can be unit tested. */

export type FilterableApp = {
  full_name: string;
  email: string;
  phone: string | null;
  job_id: string;
  source: string;
  created_at: string;
  needs_attention: string | null;
};

export type ApplicantFilters = {
  q?: string;
  jobId?: string;
  source?: string;
  applied?: string; // "any" | "today" | "7" | "30"
  attentionOnly?: boolean;
};

export function filterApplicants<T extends FilterableApp>(
  apps: T[],
  f: ApplicantFilters,
  jobTitle: (id: string) => string,
  now = Date.now(),
): T[] {
  const ql = (f.q ?? "").trim().toLowerCase();
  const dayMs = 24 * 3600e3;
  return apps.filter((a) => {
    if (f.jobId && f.jobId !== "all" && a.job_id !== f.jobId) return false;
    if (f.source && f.source !== "all" && (a.source ?? "") !== f.source) return false;
    if (f.attentionOnly && !a.needs_attention) return false;
    if (f.applied && f.applied !== "any") {
      const t = +new Date(a.created_at);
      if (f.applied === "today" && new Date(a.created_at).toDateString() !== new Date(now).toDateString()) return false;
      if (f.applied === "7" && t < now - 7 * dayMs) return false;
      if (f.applied === "30" && t < now - 30 * dayMs) return false;
    }
    if (ql) {
      const hay = [a.full_name, a.email, a.phone ?? "", jobTitle(a.job_id)].join(" ").toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });
}

export const SORTS: Record<string, { label: string }> = {
  newest: { label: "Newest first" },
  oldest: { label: "Oldest first" },
  name: { label: "Name A to Z" },
  name_desc: { label: "Name Z to A" },
  rating: { label: "Rating high to low" },
  rating_asc: { label: "Rating low to high" },
  job: { label: "Job A to Z" },
  store: { label: "Store A to Z" },
  stage: { label: "Stage" },
  source: { label: "Source A to Z" },
};

/** The four choices shown in the Sort dropdown; the rest come from clicking list headers. */
export const SORT_MENU = ["newest", "oldest", "name", "rating"] as const;

type SortableApp = FilterableApp & { status: string; rating: number | null; dealership_id: string };

export function sortApplicants<T extends SortableApp>(
  apps: T[],
  key: string,
  jobTitle: (id: string) => string,
  storeName: (id: string) => string,
): T[] {
  const cmp: Record<string, (a: T, b: T) => number> = {
    newest: (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    oldest: (a, b) => +new Date(a.created_at) - +new Date(b.created_at),
    name: (a, b) => a.full_name.localeCompare(b.full_name),
    name_desc: (a, b) => b.full_name.localeCompare(a.full_name),
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    rating_asc: (a, b) => (a.rating ?? 0) - (b.rating ?? 0),
    job: (a, b) => jobTitle(a.job_id).localeCompare(jobTitle(b.job_id)),
    store: (a, b) => storeName(a.dealership_id).localeCompare(storeName(b.dealership_id)),
    stage: (a, b) => STATUSES.indexOf(a.status as (typeof STATUSES)[number]) - STATUSES.indexOf(b.status as (typeof STATUSES)[number]),
    source: (a, b) => sourceLabel(a.source).localeCompare(sourceLabel(b.source)),
  };
  return [...apps].sort(cmp[key] ?? cmp["newest"]!);
}
