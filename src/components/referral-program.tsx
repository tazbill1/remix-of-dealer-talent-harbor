import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { drawingDate, type TotalsRow } from "@/lib/referrals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type TierRow = { id: string; name: string; amount: number; covers: string[]; excludes: string[]; is_default: boolean; sort_order: number };
export type ProgramSettings = {
  payout_days: number; full_time_only: boolean; require_before_hire: boolean; excluded_roles: string[];
  drawing_enabled: boolean; drawing_amount: number | null;
};
export const DEFAULT_SETTINGS: ProgramSettings = {
  payout_days: 90, full_time_only: true, require_before_hire: true,
  excluded_roles: ["Director", "General Manager", "GM", "General Sales Manager", "GSM", "Controller", "Corporate Manager", "Hiring Manager"],
  drawing_enabled: true, drawing_amount: 1500,
};

const money = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toLocaleString()}`);
const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

type TierDraft = { id?: string; name: string; amount: string; covers: string; excludes: string; is_default: boolean; sort_order: number };
const toDraft = (t: TierRow): TierDraft => ({ id: t.id, name: t.name, amount: String(t.amount), covers: t.covers.join(", "), excludes: t.excludes.join(", "), is_default: t.is_default, sort_order: t.sort_order });

export function TierSettings({ orgId, tiers, canEdit, onSaved }: { orgId: string; tiers: TierRow[]; canEdit: boolean; onSaved: () => void }) {
  const [rows, setRows] = useState<TierDraft[]>(() => tiers.map(toDraft));
  const [removed, setRemoved] = useState<string[]>([]);
  if (!canEdit) {
    return (
      <div className="divide-y rounded-2xl border bg-background">
        {tiers.map((t) => (
          <div key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
            <div><div className="font-semibold">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.is_default ? "Any job not covered above" : `Covers: ${t.covers.join(", ")}`}{t.excludes.length ? ` · Excludes: ${t.excludes.join(", ")}` : ""}</div></div>
            <div className="font-semibold">{money(t.amount)}</div>
          </div>
        ))}
      </div>
    );
  }
  const set = (i: number, p: Partial<TierDraft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  async function save() {
    if (rows.some((r) => !r.name.trim() || Number.isNaN(Number(r.amount)))) return toast.error("Each tier needs a name and an amount.");
    if (rows.filter((r) => r.is_default).length !== 1) return toast.error("Mark exactly one tier as the catch-all for other roles.");
    for (const id of removed) {
      const { error } = await supabase.from("referral_tiers").delete().eq("id", id).eq("org_id", orgId);
      if (error) return toast.error("Couldn't remove a tier.");
    }
    for (const [i, r] of rows.entries()) {
      const row = { name: r.name.trim(), amount: Math.max(0, Number(r.amount)), covers: list(r.covers), excludes: list(r.excludes), is_default: r.is_default, sort_order: i + 1 };
      const res = r.id
        ? await supabase.from("referral_tiers").update(row).eq("id", r.id).eq("org_id", orgId).select("id").maybeSingle()
        : await supabase.from("referral_tiers").insert({ ...row, org_id: orgId }).select("id").maybeSingle();
      if (res.error || !res.data) return toast.error("Couldn't save the tiers.");
    }
    setRemoved([]);
    toast.success("Bonus tiers saved");
    onSaved();
  }
  return (
    <div className="space-y-3 rounded-2xl border bg-background p-3">
      {rows.map((r, i) => (
        <div key={r.id ?? `new-${i}`} className="grid gap-2 border-b pb-3 last:border-0 sm:grid-cols-[2fr_7rem_2fr_1fr_auto]">
          <div className="space-y-1"><Label htmlFor={`tn${i}`} className="text-xs">Tier name</Label><Input id={`tn${i}`} value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor={`ta${i}`} className="text-xs">Amount ($)</Label><Input id={`ta${i}`} inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor={`tc${i}`} className="text-xs">Job titles it covers (comma separated)</Label>
            <Input id={`tc${i}`} disabled={r.is_default} placeholder={r.is_default ? "Any job not covered above" : ""} value={r.is_default ? "" : r.covers} onChange={(e) => set(i, { covers: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor={`tx${i}`} className="text-xs">Excludes</Label><Input id={`tx${i}`} disabled={r.is_default} value={r.is_default ? "" : r.excludes} onChange={(e) => set(i, { excludes: e.target.value })} /></div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-1 text-xs"><input type="radio" name="catchall" checked={r.is_default} onChange={() => setRows(rows.map((x, j) => ({ ...x, is_default: j === i })))} />All other roles</label>
            <Button size="icon" variant="ghost" aria-label={`Remove ${r.name || "tier"}`} onClick={() => { if (r.id) setRemoved([...removed, r.id]); setRows(rows.filter((_, j) => j !== i)); }}><Trash2 /></Button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { name: "", amount: "0", covers: "", excludes: "", is_default: false, sort_order: rows.length + 1 }])}><Plus />Add tier</Button>
        <Button size="sm" onClick={save}>Save tiers</Button>
      </div>
      <p className="text-xs text-muted-foreground">Tiers are checked top to bottom; a job gets the first tier whose titles match. Each job's tier is suggested from its title and can be changed on the job.</p>
    </div>
  );
}

export function ProgramRules({ orgId, initial, canEdit, onSaved }: { orgId: string; initial: ProgramSettings; canEdit: boolean; onSaved: () => void }) {
  const [s, setS] = useState(initial);
  const [roles, setRoles] = useState(initial.excluded_roles.join(", "));
  async function save() {
    const days = Math.round(Number(s.payout_days));
    if (!days || days < 1) return toast.error("Payout days must be a number.");
    const { data, error } = await supabase.from("referral_settings").upsert({
      org_id: orgId, payout_days: days, full_time_only: s.full_time_only, require_before_hire: s.require_before_hire,
      excluded_roles: list(roles), drawing_enabled: s.drawing_enabled, drawing_amount: s.drawing_amount, updated_at: new Date().toISOString(),
    }).select("org_id").maybeSingle();
    if (error || !data) return toast.error("Couldn't save the program rules.");
    toast.success("Program rules saved");
    onSaved();
  }
  const sw = (label: string, k: "full_time_only" | "require_before_hire" | "drawing_enabled") => (
    <label className="flex items-center gap-2 text-sm"><Switch disabled={!canEdit} checked={s[k]} onCheckedChange={(c) => setS({ ...s, [k]: c })} />{label}</label>
  );
  return (
    <div className="space-y-3 rounded-2xl border bg-background p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label htmlFor="pd">Pay one bonus after (days employed)</Label><Input id="pd" className="w-28" disabled={!canEdit} inputMode="numeric" value={s.payout_days} onChange={(e) => setS({ ...s, payout_days: Number(e.target.value) || 0 })} /></div>
      </div>
      {sw("Full-time hires only", "full_time_only")}
      {sw("Referral must be recorded before the candidate is hired", "require_before_hire")}
      <div className="space-y-1.5"><Label htmlFor="xr">Referrers in these roles are not eligible (comma separated)</Label><Input id="xr" disabled={!canEdit} value={roles} onChange={(e) => setRoles(e.target.value)} /></div>
      <div className="flex flex-wrap items-end gap-3">
        {sw("Quarterly drawing", "drawing_enabled")}
        <div className="space-y-1.5"><Label htmlFor="da">Drawing prize ($)</Label><Input id="da" className="w-28" disabled={!canEdit || !s.drawing_enabled} inputMode="decimal" value={s.drawing_amount ?? ""} onChange={(e) => setS({ ...s, drawing_amount: e.target.value === "" ? null : Number(e.target.value) })} /></div>
      </div>
      <p className="text-xs text-muted-foreground">No cap on referrals. If someone leaves before the payout day, mark their bonus Void. HR gets an alert in the bell when each bonus comes due. Nothing is texted or emailed.</p>
      {canEdit && <Button variant="outline" onClick={save}>Save rules</Button>}
    </div>
  );
}

type Entry = { id: string; quarter: string; applicant_id: string; referrer_id: string };
type Drawing = { quarter: string; amount: number | null; winner_entry_id: string | null; entry_count: number; picked_by: string | null; picked_at: string };

export function DrawingList({ orgId, entries, drawings, refName, appName, canPick, pickerName, onPicked }: {
  orgId: string; entries: Entry[]; drawings: Drawing[]; refName: Map<string, string>; appName: Map<string, string>;
  canPick: boolean; pickerName: (uid: string | null) => string; onPicked: () => void;
}) {
  const quarters = [...new Set([...entries.map((e) => e.quarter), ...drawings.map((d) => d.quarter)])].sort().reverse();
  async function pick(q: string) {
    const { error } = await supabase.rpc("pick_referral_drawing_winner", { _org: orgId, _quarter: q });
    if (error) return toast.error(error.message.includes("already") ? "A winner was already picked." : "Couldn't pick a winner.");
    toast.success("Winner picked");
    onPicked();
  }
  if (!quarters.length) return <p className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">Each referral that reaches its payout day earns one entry for that quarter's drawing.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {quarters.map((q) => {
        const list = entries.filter((e) => e.quarter === q);
        const d = drawings.find((x) => x.quarter === q);
        const winner = d && list.find((e) => e.id === d.winner_entry_id);
        return (
          <div key={q} className="space-y-2 rounded-2xl border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="font-semibold">{q.replace("-", " ")}</h3>
                <p className="text-xs text-muted-foreground">Drawing on {new Date(`${drawingDate(q)}T12:00:00`).toLocaleDateString()} · {list.length} {list.length === 1 ? "entry" : "entries"}</p></div>
              {!d && canPick && <Button size="sm" disabled={!list.length} onClick={() => pick(q)}><Trophy />Pick winner</Button>}
            </div>
            {d && (
              <p className="rounded-lg bg-lime/30 p-2 text-sm">
                Winner: <b>{winner ? refName.get(winner.referrer_id) ?? "Employee" : "—"}</b>{winner ? ` (referred ${appName.get(winner.applicant_id) ?? "applicant"})` : ""} · {money(d.amount)}
                <span className="block text-xs text-muted-foreground">Picked by {pickerName(d.picked_by)} on {new Date(d.picked_at).toLocaleString()} from {d.entry_count} entries</span>
              </p>
            )}
            <ul className="divide-y text-sm">
              {list.map((e) => <li key={e.id} className="py-1.5">{refName.get(e.referrer_id) ?? "Employee"} <span className="text-muted-foreground">for {appName.get(e.applicant_id) ?? "applicant"}</span></li>)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function TotalsTable({ title, first, rows }: { title: string; first: string; rows: TotalsRow[] }) {
  const cell = (c: { count: number; amount: number }, showAmt = true) => (c.count ? `${showAmt ? money(c.amount) : ""}${showAmt ? " " : ""}(${c.count})` : "—");
  return (
    <div className="overflow-x-auto rounded-2xl border bg-background p-3">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">{first}</th><th className="py-1 text-right">Pending</th><th className="py-1 text-right">Paid</th><th className="py-1 text-right">Void</th><th className="py-1 text-right">Not eligible</th></tr></thead>
        <tbody className="divide-y">
          {rows.length === 0 && <tr><td colSpan={5} className="py-2 text-muted-foreground">No bonuses yet.</td></tr>}
          {rows.map((r) => <tr key={r.key}><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right">{cell(r.pending)}</td><td className="py-1.5 text-right">{cell(r.paid)}</td><td className="py-1.5 text-right">{cell(r.void)}</td><td className="py-1.5 text-right">{cell(r.not_eligible, false)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
