// Event (/e/CODE) and store (/s/CODE) QR scans: links, where they land, and remembering the code (pure + browser helpers).
export type ScanKind = "event" | "store";
export type ResolvedScan = { kind: ScanKind; orgSlug: string; storeId: string | null; jobId: string | null };

export function cleanScanCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(c) ? c : null;
}

export function scanLink(origin: string, kind: ScanKind, code: string): string {
  return new URL(`/${kind === "event" ? "e" : "s"}/${code}`, origin).toString();
}

/** The event's job, else the store's jobs, else the group's jobs. */
export function scanDestination(r: ResolvedScan):
  | { to: "job"; orgSlug: string; jobId: string }
  | { to: "careers"; orgSlug: string; storeId?: string } {
  if (r.jobId) return { to: "job", orgSlug: r.orgSlug, jobId: r.jobId };
  return r.storeId ? { to: "careers", orgSlug: r.orgSlug, storeId: r.storeId } : { to: "careers", orgSlug: r.orgSlug };
}

const key = (slug: string) => `wm_scan:${slug}`;
export function rememberScan(slug: string, scan?: string) {
  const code = cleanScanCode(scan);
  if (!code) return;
  try { sessionStorage.setItem(key(slug), code); } catch { /* storage blocked */ }
}
export function recallScan(slug: string): string | null {
  try { return cleanScanCode(sessionStorage.getItem(key(slug))); } catch { return null; }
}
