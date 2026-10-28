import { ApplicantViewTabs } from "@/components/applicant-view-tabs";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Waves } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/talent-pool")({
  head: () => ({ meta: [
    { title: "Talent pool | WerkandMe Hiring" },
    { name: "description", content: "Candidates in your region's talent pool that nearby stores can claim." },
    { property: "og:title", content: "Talent pool | WerkandMe Hiring" },
    { property: "og:description", content: "Candidates in your region's talent pool that nearby stores can claim." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: z.object({ region: z.string().optional() }),
  component: TalentPool,
});

const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";
type PoolRow = { id: string; full_name: string; talent_pool_region_id: string | null; original_store_id: string | null; dealership_id: string; job_id: string; moved_to_pool_at: string | null; pool_reason: string | null };

function TalentPool() {
  const org = useOrg();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const nav = useNavigate({ from: "/talent-pool" });
  const isHr = canPostJobs(org.role, org.isPlatformAdmin);
  const canClaim = isHr || org.role === "dealer_manager" || org.role === "hiring_manager";
  const key = ["talent-pool", org.orgId];
  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [apps, regions, stores, jobs] = await Promise.all([
        supabase.from("applications").select("id, full_name, talent_pool_region_id, original_store_id, dealership_id, job_id, moved_to_pool_at, pool_reason")
          .eq("org_id", org.orgId).eq("in_talent_pool", true).order("moved_to_pool_at", { ascending: false }),
        supabase.from("regions").select("id, name").eq("org_id", org.orgId).order("name"),
        supabase.from("dealerships").select("id, name, region_id").eq("org_id", org.orgId).order("name"),
        supabase.from("jobs").select("id, title, dealership_id, status").eq("org_id", org.orgId),
      ]);
      if (apps.error) throw apps.error;
      return { apps: (apps.data ?? []) as PoolRow[], regions: regions.data ?? [], stores: stores.data ?? [], jobs: jobs.data ?? [] };
    },
  });
  const [claiming, setClaiming] = useState<PoolRow | null>(null);
  const region = search.region ?? "all";
  const regionName = (id: string | null) => data?.regions.find((r) => r.id === id)?.name ?? "—";
  const storeName = (id: string | null) => data?.stores.find((s) => s.id === id)?.name ?? "Another store";
  const jobTitle = (id: string) => data?.jobs.find((j) => j.id === id)?.title ?? "—";
  const rows = (data?.apps ?? []).filter((a) => region === "all" || a.talent_pool_region_id === region);
  const regionIds = [...new Set((data?.apps ?? []).map((a) => a.talent_pool_region_id).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl"><Waves className="size-7 text-sapphire" />Talent pool</h1>
        <p className="text-muted-foreground">Candidates who stopped responding at one store. Any nearby store in the same region can claim them and start fresh.</p>
      </div>
      <ApplicantViewTabs active="pool" />
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Region" className={selectCls} value={region} onChange={(e) => nav({ search: { region: e.target.value === "all" ? undefined : e.target.value }, replace: true })}>
          <option value="all">All regions</option>
          {regionIds.map((id) => <option key={id} value={id}>{regionName(id)}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{isPending ? "Loading…" : `${rows.length} in the pool`}</span>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-background shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground">
            {["Name", "Region", "Original store", "Job", "Moved", "Reason", ""].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="px-3 py-2.5 font-medium">
                  {isHr ? <button className="text-sapphire underline" onClick={() => void nav({ to: "/applicants", search: { applicant: a.id, tab: "overview" } })}>{a.full_name}</button> : a.full_name}
                </td>
                <td className="px-3 py-2.5">{regionName(a.talent_pool_region_id)}</td>
                <td className="px-3 py-2.5">{storeName(a.original_store_id ?? a.dealership_id)}</td>
                <td className="px-3 py-2.5">{jobTitle(a.job_id)}</td>
                <td className="px-3 py-2.5">{a.moved_to_pool_at ? new Date(a.moved_to_pool_at).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{a.pool_reason ?? "—"}</td>
                <td className="px-3 py-2.5 text-right">{canClaim && <Button size="sm" onClick={() => setClaiming(a)}>Claim to my store</Button>}</td>
              </tr>
            ))}
            {!isPending && rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No one in the pool right now.</td></tr>}
          </tbody>
        </table>
      </div>
      {claiming && data && (
        <ClaimDialog row={claiming} isHr={isHr} stores={data.stores} jobs={data.jobs} onClose={() => setClaiming(null)}
          onDone={() => { setClaiming(null); void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ["applicants", org.orgId] }); }} />
      )}
    </div>
  );
}

function ClaimDialog({ row, isHr, stores, jobs, onClose, onDone }: {
  row: PoolRow; isHr: boolean; onClose: () => void; onDone: () => void;
  stores: { id: string; name: string; region_id: string | null }[]; jobs: { id: string; title: string; dealership_id: string; status: string }[];
}) {
  // Stores listed are already limited to the ones this person can see; managers must stay in the pool's region.
  const eligible = stores.filter((s) => isHr || s.region_id === row.talent_pool_region_id);
  const [store, setStore] = useState(eligible[0]?.id ?? "");
  const [job, setJob] = useState("");
  const [busy, setBusy] = useState(false);
  const storeJobs = jobs.filter((j) => j.dealership_id === store && j.status === "open");
  async function claim() {
    setBusy(true);
    const { error } = await supabase.rpc("claim_pool_candidate", { _app: row.id, _store: store, ...(job ? { _job: job } : {}) });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${row.full_name} claimed. They're now Not Contacted Yet at ${eligible.find((s) => s.id === store)?.name ?? "your store"}.`);
    onDone();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Claim {row.full_name}</DialogTitle></DialogHeader>
        {eligible.length === 0 ? <p className="text-sm text-muted-foreground">You don't have a store in this candidate's region.</p> : (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm"><span className="font-medium">Store</span>
              <select className={`${selectCls} w-full`} value={store} onChange={(e) => { setStore(e.target.value); setJob(""); }}>
                {eligible.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></label>
            <label className="block space-y-1 text-sm"><span className="font-medium">Job (optional)</span>
              <select className={`${selectCls} w-full`} value={job} onChange={(e) => setJob(e.target.value)}>
                <option value="">Keep their current job</option>
                {storeJobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select></label>
            <p className="text-xs text-muted-foreground">They'll move to this store as Not Contacted Yet. No text or email is sent.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button disabled={!store || busy} onClick={claim}>{busy ? "Claiming…" : "Claim to my store"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
