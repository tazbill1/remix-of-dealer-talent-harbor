import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs, STATUS_LABEL, type AppStatus } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/duplicates")({
  validateSearch: z.object({ match: z.string().uuid().optional() }),
  head: () => ({ meta: [
    { title: "Possible duplicates | WerkandMe Hiring" }, { name: "description", content: "Review and merge duplicate applicant records." },
    { property: "og:title", content: "Possible duplicates | WerkandMe Hiring" }, { property: "og:description", content: "Review and merge duplicate applicant records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Duplicates,
});

const REASON: Record<string, string> = { same_email: "Same email", same_phone: "Same phone", same_name_phone: "Same name + phone" };
const KIND: Record<string, string> = { application: "Applicant", referrer: "Referring employee", team_member: "Team member" };

type Rec = { type: string; id: string; name: string; email: string | null; phone: string | null; store: string; status: string; created: string | null; visible: boolean };

function Duplicates() {
  const org = useOrg();
  const qc = useQueryClient();
  const { match } = Route.useSearch();
  const canEdit = canPostJobs(org.role, org.isPlatformAdmin);
  const key = ["duplicates", org.orgId];
  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: dups } = await supabase.from("possible_duplicates").select("*").eq("org_id", org.orgId).eq("status", "open").order("created_at", { ascending: false });
      const rows = dups ?? [];
      const ids = (t: string) => [...new Set(rows.flatMap((d) => [d.record_a_type === t ? d.record_a_id : null, d.record_b_type === t ? d.record_b_id : null]).filter(Boolean) as string[])];
      const [apps, refs, mems, stores] = await Promise.all([
        ids("application").length ? supabase.from("applications").select("id, full_name, email, phone, dealership_id, status, created_at").in("id", ids("application")) : Promise.resolve({ data: [] }),
        ids("referrer").length ? supabase.from("referrers").select("id, employee_name, email, phone, store_id, active, created_at").in("id", ids("referrer")) : Promise.resolve({ data: [] }),
        ids("team_member").length ? supabase.from("org_members").select("id, email, role, created_at").in("id", ids("team_member")) : Promise.resolve({ data: [] }),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId),
      ]);
      const store = (id: string | null) => (stores.data ?? []).find((s) => s.id === id)?.name ?? "";
      const rec = (type: string, id: string): Rec => {
        if (type === "application") {
          const a = (apps.data ?? []).find((x) => x.id === id);
          if (a) return { type, id, name: a.full_name, email: a.email, phone: a.phone, store: store(a.dealership_id), status: STATUS_LABEL[a.status as AppStatus] ?? a.status, created: a.created_at, visible: true };
        } else if (type === "referrer") {
          const r = (refs.data ?? []).find((x) => x.id === id);
          if (r) return { type, id, name: r.employee_name, email: r.email, phone: r.phone, store: store(r.store_id), status: r.active ? "Active" : "Inactive", created: r.created_at, visible: true };
        } else {
          const m = (mems.data ?? []).find((x) => x.id === id);
          if (m) return { type, id, name: m.email ?? "Team member", email: m.email, phone: null, store: "", status: m.role === "recruiter" ? "HR / Recruiter" : m.role.replace(/_/g, " "), created: m.created_at, visible: true };
        }
        return { type, id, name: "Not visible to you", email: null, phone: null, store: "", status: "", created: null, visible: false };
      };
      return rows.map((d) => ({ ...d, a: rec(d.record_a_type, d.record_a_id), b: rec(d.record_b_type, d.record_b_id) }));
    },
  });
  const [merging, setMerging] = useState<{ dupId: string; a: Rec; b: Rec } | null>(null);
  const [keep, setKeep] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ["possible-dup"] }); };

  async function doMerge() {
    if (!merging || !keep) return;
    setBusy(true);
    const { error } = await supabase.rpc("merge_duplicate", { _dup: merging.dupId, _keep: keep });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Records merged"); setMerging(null); refresh();
  }
  async function notDup(id: string) {
    const { error } = await supabase.rpc("mark_not_duplicate", { _dup: id });
    if (error) return toast.error(error.message);
    toast.success("Marked as not a duplicate"); refresh();
  }

  const card = (r: Rec) => (
    <div className="min-w-0 flex-1 space-y-0.5 rounded-xl border p-3 text-sm">
      <div className="text-xs text-muted-foreground">{KIND[r.type]}</div>
      {r.type === "application" && r.visible
        ? <Link to="/applicants" search={{ applicant: r.id }} className="font-semibold text-sapphire hover:underline">{r.name}</Link>
        : <div className="font-semibold">{r.name}</div>}
      {r.email && <div className="truncate">{r.email}</div>}
      {r.phone && <div>{r.phone}</div>}
      <div className="text-xs text-muted-foreground">{[r.store, r.status, r.created ? `Added ${new Date(r.created).toLocaleDateString()}` : ""].filter(Boolean).join(" · ")}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl"><Copy className="size-7 text-sapphire" />Possible duplicates</h1>
        <p className="text-muted-foreground">Records in your group that share an email or phone. {canEdit ? "Merge them or mark them as not a duplicate." : "Only Recruiting/HR and group admins can merge."}</p>
      </div>
      <div className="space-y-3">
        {(data ?? []).map((d) => {
          const bothApps = d.a.type === "application" && d.b.type === "application" && d.a.visible && d.b.visible;
          return (
            <div key={d.id} className={cn("space-y-3 rounded-2xl bg-background p-4 shadow-sm", match === d.id && "ring-2 ring-sapphire")}>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">{REASON[d.match_reason] ?? d.match_reason}</span>
                {canEdit && (
                  <div className="flex gap-2">
                    {bothApps && <Button size="sm" onClick={() => { setKeep(d.a.id); setMerging({ dupId: d.id, a: d.a, b: d.b }); }}>Merge</Button>}
                    <Button size="sm" variant="outline" onClick={() => notDup(d.id)}>Not a duplicate</Button>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">{card(d.a)}{card(d.b)}</div>
            </div>
          );
        })}
        {!isPending && !data?.length && <p className="rounded-2xl bg-background p-6 text-center text-muted-foreground shadow-sm">No open possible duplicates.</p>}
      </div>

      <Dialog open={!!merging} onOpenChange={(o) => !o && setMerging(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Merge these records?</DialogTitle></DialogHeader>
          {merging && (
            <div className="space-y-3 text-sm">
              <p>Pick the record to keep. Everything from the other one (timeline, messages, interviews, offers, consents, referrals, onboarding) moves onto it, and the other is archived, not deleted. Do Not Hire is kept if either had it.</p>
              {[merging.a, merging.b].map((r) => (
                <label key={r.id} className={cn("flex cursor-pointer items-start gap-2 rounded-xl border p-3", keep === r.id && "border-sapphire bg-accent")}>
                  <input type="radio" name="keep" checked={keep === r.id} onChange={() => setKeep(r.id)} className="mt-1" />
                  <span><b>Keep {r.name}</b><br /><span className="text-muted-foreground">{[r.email, r.phone, r.store, r.status].filter(Boolean).join(" · ")}</span></span>
                </label>
              ))}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMerging(null)}>Cancel</Button>
                <Button onClick={doMerge} disabled={busy || !keep}>Merge</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
