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

export function bonusDueMessage(employee: string, applicant: string, days = 90): string {
  return `Referral bonus due (${days} days): ${employee} for referring ${applicant}.`;
}

// ---- Role-based bonus program (tiers, eligibility, quarterly drawing) ----

export type Tier = { id: string; name: string; amount: number; covers: string[]; excludes: string[]; is_default: boolean; sort_order: number };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word, case-insensitive match of any phrase (mirrors the database's referral_word_match). */
export function wordMatch(text: string | null | undefined, words: string[]): boolean {
  const t = text ?? "";
  return words.some((w) => w.trim() !== "" && new RegExp(`(^|[^A-Za-z0-9_])${esc(w.trim())}($|[^A-Za-z0-9_])`, "i").test(t));
}

/** Suggested tier for a job title: first covering tier (by order) not excluded, else the catch-all. */
export function suggestTier<T extends Tier>(title: string | null | undefined, tiers: T[]): T | null {
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order);
  return sorted.find((t) => !t.is_default && wordMatch(title, t.covers) && !wordMatch(title, t.excludes))
    ?? sorted.find((t) => t.is_default) ?? null;
}

/** Why a referrer can't earn a bonus, or null if they can. */
export function referrerIneligible(roleTitle: string | null | undefined, excluded: string[]): string | null {
  return roleTitle && wordMatch(roleTitle, excluded) ? `Not eligible: referrer role (${roleTitle}) is excluded` : null;
}

/** "2026-Q4" for a yyyy-mm-dd date. */
export function quarterKey(dateIso: string): string {
  const [y, m] = dateIso.split("-").map(Number);
  return `${y}-Q${Math.floor((m! - 1) / 3) + 1}`;
}

/** Last weekday of the quarter's final month (Mar, Jun, Sep, Dec), yyyy-mm-dd. */
export function drawingDate(quarter: string): string {
  const [y, q] = quarter.split("-Q").map(Number);
  const d = new Date(Date.UTC(y!, q! * 3, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function bonusStatusLabel(b: { status: string; ineligible_reason?: string | null }): string {
  if (b.status === "not_eligible") return b.ineligible_reason || "Not eligible";
  return b.status.charAt(0).toUpperCase() + b.status.slice(1);
}

export type BonusStatus = "pending" | "paid" | "void" | "not_eligible";
export type TotalsRow = { key: string; label: string } & Record<BonusStatus, { count: number; amount: number }>;

/** Bonus counts and dollar totals by tier and by store, split by status. */
export function bonusTotals(
  bonuses: { applicant_id: string; status: string; amount: number | null; tier_name: string | null }[],
  appStore: Map<string, string>, stores: { id: string; name: string }[],
) {
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  const blank = (key: string, label: string): TotalsRow => ({ key, label,
    pending: { count: 0, amount: 0 }, paid: { count: 0, amount: 0 }, void: { count: 0, amount: 0 }, not_eligible: { count: 0, amount: 0 } });
  const byTier = new Map<string, TotalsRow>(); const byStore = new Map<string, TotalsRow>();
  for (const b of bonuses) {
    const st = b.status as BonusStatus;
    if (!["pending", "paid", "void", "not_eligible"].includes(st)) continue;
    const tk = b.tier_name ?? "No tier"; const sk = appStore.get(b.applicant_id) ?? "unknown";
    const t = byTier.get(tk) ?? blank(tk, tk); const s = byStore.get(sk) ?? blank(sk, storeNames.get(sk) ?? "Unknown store");
    for (const row of [t, s]) { row[st].count++; row[st].amount += Number(b.amount ?? 0); }
    byTier.set(tk, t); byStore.set(sk, s);
  }
  const sort = (m: Map<string, TotalsRow>) => [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
  return { byTier: sort(byTier), byStore: sort(byStore) };
}
