/** Employee referral rules (pure, tested). No messages are sent by this feature. */

export type RefSource = "link" | "qr" | "typed";

export type Referrer = { id: string; employee_name: string; store_id: string | null; active: boolean; referral_code: string };
export type RefApp = {
  id: string; status: string; source: string; dealership_id: string;
  referrer_id: string | null; referred_by_text: string | null; full_name: string;
};

/** Personal careers link. QR scans add via=qr so the applicant is tagged "qr". */
export function referralLink(origin: string, orgSlug: string, code: string, via?: "qr"): string {
  const u = new URL(`/c/${orgSlug}`, origin);
  u.searchParams.set("ref", code);
  if (via) u.searchParams.set("via", via);
  return u.toString();
}

export function cleanCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 4 && c.length <= 16 ? c : null;
}

/** A typed name links automatically only when it matches exactly one active referrer. */
export function matchTypedReferrer(typed: string | null | undefined, referrers: Referrer[]): Referrer | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const t = norm(typed ?? "");
  if (!t) return null;
  const hits = referrers.filter((r) => r.active && norm(r.employee_name) === t);
  return hits.length === 1 ? hits[0]! : null;
}

/** What the badge says: the linked name, or the typed text waiting for HR to link it. */
export function referralBadge(app: Pick<RefApp, "referrer_id" | "referred_by_text">, names: Map<string, string>):
  { label: string; linked: boolean } | null {
  if (app.referrer_id) return { label: `Referred by ${names.get(app.referrer_id) ?? "an employee"}`, linked: true };
  const t = app.referred_by_text?.trim();
  return t ? { label: `Referred by "${t}"`, linked: false } : null;
}

export type ReportRow = { key: string; label: string; referrals: number; hires: number; rate: number };

const rate = (h: number, n: number) => (n ? Math.round((h / n) * 100) : 0);

function rows(map: Map<string, { label: string; n: number; h: number }>): ReportRow[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, referrals: v.n, hires: v.h, rate: rate(v.h, v.n) }))
    .sort((a, b) => b.referrals - a.referrals || a.label.localeCompare(b.label));
}

/** Referrals, hires and hire rate by employee and by store, plus referrals vs every other source. */
export function referralReport(apps: RefApp[], referrers: Referrer[], stores: { id: string; name: string }[]) {
  const names = new Map(referrers.map((r) => [r.id, r.employee_name]));
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  const byEmp = new Map<string, { label: string; n: number; h: number }>();
  const byStore = new Map<string, { label: string; n: number; h: number }>();
  const vs = new Map<string, { label: string; n: number; h: number }>([
    ["referral", { label: "Employee referrals", n: 0, h: 0 }],
    ["other", { label: "All other sources", n: 0, h: 0 }],
  ]);
  for (const a of apps) {
    const hired = a.status === "hired" ? 1 : 0;
    const referred = !!a.referrer_id;
    const v = vs.get(referred ? "referral" : "other")!;
    v.n++; v.h += hired;
    if (!referred) continue;
    const e = byEmp.get(a.referrer_id!) ?? { label: names.get(a.referrer_id!) ?? "Unknown employee", n: 0, h: 0 };
    e.n++; e.h += hired; byEmp.set(a.referrer_id!, e);
    const s = byStore.get(a.dealership_id) ?? { label: storeNames.get(a.dealership_id) ?? "Unknown store", n: 0, h: 0 };
    s.n++; s.h += hired; byStore.set(a.dealership_id, s);
  }
  return { byEmployee: rows(byEmp), byStore: rows(byStore), vsOther: [...vs.entries()].map(([key, v]) => ({ key, label: v.label, referrals: v.n, hires: v.h, rate: rate(v.h, v.n) })) };
}

/** Pending bonuses whose due date has arrived and HR hasn't been alerted yet. */
export function bonusesToAlert<T extends { status: string; due_date: string | null; due_notified_at: string | null }>(bonuses: T[], todayIso: string): T[] {
  return bonuses.filter((b) => b.status === "pending" && !b.due_notified_at && !!b.due_date && b.due_date <= todayIso);
}

export const STAGE_LABEL: Record<string, string> = { "30_day": "30-day", "90_day": "90-day" };

export function bonusDueMessage(employee: string, applicant: string, stage: string): string {
  return `${STAGE_LABEL[stage] ?? stage} referral bonus due: ${employee} for referring ${applicant}.`;
}
