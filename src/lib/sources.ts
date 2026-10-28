// Standardized applicant sources (applications.source_channel). Raw tags stay in applications.source.
export const SOURCE_CHANNELS = [
  "Indeed", "ZipRecruiter", "Company website", "Employee referral", "Event",
  "Store QR code", "Walk-in", "Manual entry", "Other",
] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

export function isSourceChannel(v: unknown): v is SourceChannel {
  return typeof v === "string" && (SOURCE_CHANNELS as readonly string[]).includes(v);
}

export type SourceRow = { store_id: string | null; source: string; applicants: number; hires: number; org_total: boolean };

/** Applicants, hires and hire rate per source, for one store or the whole group, in list order. */
export function sourceReport(rows: SourceRow[], storeId: string | "all") {
  const pick = rows.filter((r) => (storeId === "all" ? r.org_total : !r.org_total && r.store_id === storeId));
  const by = new Map<string, { applicants: number; hires: number }>();
  for (const r of pick) {
    const x = by.get(r.source) ?? { applicants: 0, hires: 0 };
    x.applicants += r.applicants; x.hires += r.hires; by.set(r.source, x);
  }
  return SOURCE_CHANNELS.filter((s) => by.has(s)).map((s) => {
    const x = by.get(s)!;
    return { source: s, ...x, hireRate: x.applicants ? Math.round((x.hires / x.applicants) * 100) : 0 };
  });
}
