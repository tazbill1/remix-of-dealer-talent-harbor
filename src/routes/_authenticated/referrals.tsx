import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Download, Pencil, Plus, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { isTestName } from "@/lib/display";
import { bonusStatusLabel, bonusTotals, referralLink, referralReport, type ReportRow } from "@/lib/referrals";
import { DEFAULT_SETTINGS, DrawingList, ProgramRules, TierSettings, TotalsTable, type TierRow } from "@/components/referral-program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const TITLE = "Referrals | WerkandMe Hiring";
const DESC = "Employee referral links, QR codes, bonuses and referral results.";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReferralsPage,
});

type Referrer = { id: string; employee_name: string; store_id: string | null; department: string | null; role_title: string | null; email: string | null; phone: string | null; referral_code: string; active: boolean };
type Draft = { id?: string; employee_name: string; store_id: string; department: string; role_title: string; email: string; phone: string; active: boolean };
const EMPTY: Draft = { employee_name: "", store_id: "", department: "", role_title: "", email: "", phone: "", active: true };
const selectCls = "h-9 w-full rounded-md border bg-background px-2 text-sm";
const money = (n: number | null) => (n == null ? "—" : `$${Number(n).toLocaleString()}`);

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); } catch { toast.message(text); }
}

function ReferralsPage() {
  const org = useOrg();
  const qc = useQueryClient();
  const isHr = org.isPlatformAdmin || canPostJobs(org.role);
  const canView = isHr || org.role === "regional_leader";
  const key = ["referrals", org.orgId];
  const { data } = useQuery({
    queryKey: key,
    enabled: canView,
    queryFn: async () => {
      const [refs, stores, apps, bonuses, settings, tiers, entries, drawings, members] = await Promise.all([
        supabase.from("referrers").select("id, employee_name, store_id, department, role_title, email, phone, referral_code, active").eq("org_id", org.orgId).order("employee_name"),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId).order("name"),
        supabase.from("applications").select("id, status, source, dealership_id, referrer_id, referred_by_text, full_name").eq("org_id", org.orgId),
        supabase.from("referral_bonuses").select("id, applicant_id, referrer_id, amount, payout_stage, due_date, status, paid_at, tier_name, ineligible_reason").eq("org_id", org.orgId).order("due_date"),
        supabase.from("referral_settings").select("payout_days, full_time_only, require_before_hire, excluded_roles, drawing_enabled, drawing_amount").eq("org_id", org.orgId).maybeSingle(),
        supabase.from("referral_tiers").select("id, name, amount, covers, excludes, is_default, sort_order").eq("org_id", org.orgId).order("sort_order"),
        supabase.from("referral_drawing_entries").select("id, quarter, applicant_id, referrer_id").eq("org_id", org.orgId).order("created_at"),
        supabase.from("referral_drawings").select("quarter, amount, winner_entry_id, entry_count, picked_by, picked_at").eq("org_id", org.orgId),
        supabase.from("org_members").select("user_id, email").eq("org_id", org.orgId),
      ]);
      return { refs: (refs.data ?? []) as Referrer[], stores: stores.data ?? [], apps: apps.data ?? [], bonuses: bonuses.data ?? [],
        settings: settings.data ?? DEFAULT_SETTINGS, tiers: (tiers.data ?? []) as TierRow[], entries: entries.data ?? [], drawings: drawings.data ?? [], members: members.data ?? [] };
    },
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [qrFor, setQrFor] = useState<Referrer | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  if (!canView) return <div className="p-2 text-muted-foreground">Referrals are managed by HR, recruiters and group admins.</div>;
  if (!data) return <div className="text-muted-foreground">Loading...</div>;

  const storeName = (id: string | null) => data.stores.find((s) => s.id === id)?.name ?? "All stores";
  const refName = new Map(data.refs.map((r) => [r.id, r.employee_name]));
  const appName = new Map(data.apps.map((a) => [a.id, a.full_name]));
  const realApps = data.apps.filter((a) => !isTestName(a.full_name));
  const report = referralReport(realApps, data.refs, data.stores);
  const realIds = new Set(realApps.map((a) => a.id));
  const totals = bonusTotals(data.bonuses.filter((b) => realIds.has(b.applicant_id)), new Map(data.apps.map((a) => [a.id, a.dealership_id])), data.stores);
  const memberEmail = (uid: string | null) => data.members.find((m) => m.user_id === uid)?.email ?? "HR";
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function save(d: Draft) {
    if (!d.employee_name.trim()) return toast.error("Add the employee's name.");
    const row = {
      employee_name: d.employee_name.trim(), store_id: d.store_id || null, department: d.department.trim() || null, role_title: d.role_title.trim() || null,
      email: d.email.trim() || null, phone: d.phone.trim() || null, active: d.active,
    };
    const res = d.id
      ? await supabase.from("referrers").update(row).eq("id", d.id).eq("org_id", org.orgId).select("id").maybeSingle()
      : await supabase.from("referrers").insert({ ...row, org_id: org.orgId }).select("id").maybeSingle();
    if (res.error || !res.data) return toast.error("Couldn't save. Please try again.");
    toast.success(d.id ? "Employee updated" : "Employee added");
    setDraft(null);
    refresh();
  }

  async function setBonus(id: string, status: "paid" | "void" | "pending") {
    const { data: saved, error } = await supabase.from("referral_bonuses")
      .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
      .eq("id", id).eq("org_id", org.orgId).select("id").maybeSingle();
    if (error || !saved) return toast.error("Couldn't update the bonus.");
    toast.success(status === "paid" ? "Marked paid" : status === "void" ? "Marked void" : "Back to pending");
    refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Referrals</h1>
          <p className="text-sm text-muted-foreground">Give each employee a personal link and QR code. Referred applicants are tagged automatically.</p>
        </div>
        {isHr && <Button onClick={() => setDraft({ ...EMPTY })}><Plus />Add employee</Button>}
      </div>

      <section className="space-y-3">
        <h2 className="text-xl">Employees who refer</h2>
        <div className="divide-y rounded-2xl border bg-background">
          {data.refs.length === 0 && <p className="p-4 text-sm text-muted-foreground">No employees yet. Add one to get their referral link.</p>}
          {data.refs.map((r) => {
            const link = referralLink(origin, org.orgSlug, r.referral_code);
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className={cn("font-semibold", !r.active && "text-muted-foreground line-through")}>{r.employee_name}</div>
                  <div className="text-xs text-muted-foreground">{storeName(r.store_id)}{r.role_title ? ` · ${r.role_title}` : ""}{r.department ? ` · ${r.department}` : ""} · Code {r.referral_code}{r.active ? "" : " · Inactive"}</div>
                  <div className="truncate text-xs text-sapphire">{link}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => copy(link, "Referral link")}><Copy />Copy link</Button>
                  <Button size="sm" variant="outline" onClick={() => setQrFor(r)}><QrCode />QR code</Button>
                  {isHr && <Button size="sm" variant="ghost" aria-label={`Edit ${r.employee_name}`} onClick={() => setDraft({
                    id: r.id, employee_name: r.employee_name, store_id: r.store_id ?? "", department: r.department ?? "", role_title: r.role_title ?? "",
                    email: r.email ?? "", phone: r.phone ?? "", active: r.active,
                  })}><Pencil />Edit</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl">Bonuses</h2>
        <h3 className="font-semibold">Bonus tiers</h3>
        <TierSettings key={data.tiers.map((t) => t.id).join()} orgId={org.orgId} tiers={data.tiers} canEdit={isHr} onSaved={refresh} />
        <h3 className="font-semibold">Program rules</h3>
        <ProgramRules orgId={org.orgId} initial={data.settings} canEdit={isHr} onSaved={refresh} />
        <div className="overflow-x-auto rounded-2xl border bg-background">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr>
              <th className="p-3">Employee</th><th className="p-3">Applicant</th><th className="p-3">Tier</th><th className="p-3">Amount</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3" />
            </tr></thead>
            <tbody className="divide-y">
              {data.bonuses.length === 0 && <tr><td colSpan={7} className="p-4 text-muted-foreground">Bonuses appear here when a referred applicant is marked Hired.</td></tr>}
              {data.bonuses.map((b) => (
                <tr key={b.id}>
                  <td className="p-3">{refName.get(b.referrer_id) ?? "—"}</td>
                  <td className="p-3"><Link to="/applicants" search={{ applicant: b.applicant_id }} className="text-sapphire underline">{appName.get(b.applicant_id) ?? "Applicant"}</Link></td>
                  <td className="p-3">{b.tier_name ?? (b.payout_stage === "30_day" ? "30-day" : "—")}</td>
                  <td className="p-3">{money(b.amount)}</td>
                  <td className="p-3">{b.due_date ? new Date(`${b.due_date}T12:00:00`).toLocaleDateString() : "—"}</td>
                  <td className="p-3">{bonusStatusLabel(b)}{b.paid_at && b.status === "paid" ? ` ${new Date(b.paid_at).toLocaleDateString()}` : ""}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {!isHr || b.status === "not_eligible" ? null : b.status === "pending" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setBonus(b.id, "paid")}>Mark paid</Button>{" "}
                        <Button size="sm" variant="ghost" onClick={() => setBonus(b.id, "void")}>Void</Button>
                      </>
                    ) : <Button size="sm" variant="ghost" onClick={() => setBonus(b.id, "pending")}>Undo</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.settings.drawing_enabled && (
        <section className="space-y-3">
          <h2 className="text-xl">Quarterly drawing</h2>
          <DrawingList orgId={org.orgId} entries={data.entries} drawings={data.drawings} refName={refName} appName={appName}
            canPick={isHr} pickerName={memberEmail} onPicked={refresh} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl">Report</h2>
        <p className="text-sm text-muted-foreground">All time. Test applicants are left out.</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <ReportTable title="Referrals vs other sources" first="Source" rows={report.vsOther} />
          <ReportTable title="By employee" first="Employee" rows={report.byEmployee} />
          <ReportTable title="By store" first="Store" rows={report.byStore} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TotalsTable title="Bonus totals by tier" first="Tier" rows={totals.byTier} />
          <TotalsTable title="Bonus totals by store" first="Store" rows={totals.byStore} />
        </div>
      </section>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? "Edit employee" : "Add employee"}</DialogTitle></DialogHeader>
          {draft && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(draft); }}>
              <div className="space-y-1.5"><Label htmlFor="rn">Employee name</Label><Input id="rn" required value={draft.employee_name} onChange={(e) => setDraft({ ...draft, employee_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="rs">Store (optional)</Label>
                <select id="rs" className={selectCls} value={draft.store_id} onChange={(e) => setDraft({ ...draft, store_id: e.target.value })}>
                  <option value="">All stores</option>{data.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div className="space-y-1.5"><Label htmlFor="rr">Role / title (optional)</Label><Input id="rr" placeholder="e.g. Service Technician" value={draft.role_title} onChange={(e) => setDraft({ ...draft, role_title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="rd">Department (optional)</Label><Input id="rd" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="re">Email (optional)</Label><Input id="re" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="rp">Phone (optional)</Label><Input id="rp" type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
              </div>
              {draft.id && <label className="flex items-center gap-2 text-sm"><Switch checked={draft.active} onCheckedChange={(c) => setDraft({ ...draft, active: c })} />Active (inactive links stop tagging applicants)</label>}
              <Button type="submit" className="w-full">Save</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrFor} onOpenChange={(o) => !o && setQrFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>QR code: {qrFor?.employee_name}</DialogTitle></DialogHeader>
          {qrFor && <ReferralQr name={qrFor.employee_name} link={referralLink(origin, org.orgSlug, qrFor.referral_code, "qr")} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReferralQr({ name, link }: { name: string; link: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(link, { width: 600, margin: 2, color: { dark: "#1d224b", light: "#ffffff" } }).then(setQr).catch(() => setQr(null));
  }, [link]);
  return (
    <div className="flex flex-col items-center gap-3">
      {qr ? <img src={qr} alt={`Referral QR code for ${name}`} className="size-56 rounded-lg border" /> : <div className="size-56 rounded-lg bg-muted" />}
      <p className="text-center text-xs text-muted-foreground">Scans open the careers site, tagged as referred by {name} (QR).</p>
      <div className="flex gap-2">
        {qr && <Button size="sm" asChild><a href={qr} download={`${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-referral-qr.png`}><Download />Download PNG</a></Button>}
        <Button size="sm" variant="outline" onClick={() => copy(link, "QR link")}><Copy />Copy link</Button>
      </div>
    </div>
  );
}

function ReportTable({ title, first, rows }: { title: string; first: string; rows: ReportRow[] }) {
  return (
    <div className="rounded-2xl border bg-background p-3">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">{first}</th><th className="py-1 text-right">Applicants</th><th className="py-1 text-right">Hires</th><th className="py-1 text-right">Hire rate</th></tr></thead>
        <tbody className="divide-y">
          {rows.length === 0 && <tr><td colSpan={4} className="py-2 text-muted-foreground">No referrals yet.</td></tr>}
          {rows.map((r) => <tr key={r.key}><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right">{r.referrals}</td><td className="py-1.5 text-right">{r.hires}</td><td className="py-1.5 text-right">{r.rate}%</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
