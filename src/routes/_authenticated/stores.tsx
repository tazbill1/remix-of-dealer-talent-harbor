import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, MapPinned } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/stores")({
  head: () => ({ meta: [{ title: "Stores | WerkandMe Hiring" }] }),
  component: Stores,
});

function Stores() {
  const org = useOrg();
  const qc = useQueryClient();
  const isHr = canPostJobs(org.role, org.isPlatformAdmin);
  const { data: stores = [] } = useQuery({
    queryKey: ["stores", org.orgId],
    queryFn: async () => (await supabase.from("dealerships").select("*").eq("org_id", org.orgId).order("name")).data ?? [],
  });
  const { data: regions = [] } = useQuery({
    queryKey: ["regions", org.orgId],
    queryFn: async () => (await supabase.from("regions").select("*").eq("org_id", org.orgId).order("name")).data ?? [],
  });
  const [open, setOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [regionName, setRegionName] = useState("");
  const [f, setF] = useState({ name: "", brand: "", city: "", state: "", assistant_name: "Penny" });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("dealerships").insert({ ...f, org_id: org.orgId });
    if (error) return toast.error(error.message);
    toast.success(`${f.name} added!`);
    setF({ name: "", brand: "", city: "", state: "", assistant_name: "Penny" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["stores", org.orgId] });
  }
  async function remove(id: string) {
    if (!confirm("Remove this store and all its jobs?")) return;
    await supabase.from("dealerships").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["stores", org.orgId] });
  }
  async function addRegion(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("regions").insert({ org_id: org.orgId, name: regionName.trim() });
    if (error) return toast.error(error.message);
    toast.success(`${regionName} region created!`);
    setRegionName("");
    setRegionOpen(false);
    qc.invalidateQueries({ queryKey: ["regions", org.orgId] });
  }
  async function removeRegion(id: string) {
    if (!confirm("Remove this region? Stores in it stay, they just become unassigned.")) return;
    // Unassign stores first: the region link on stores blocks deleting a region that's still in use.
    const { error: unassignError } = await supabase.from("dealerships").update({ region_id: null }).eq("region_id", id);
    if (unassignError) return toast.error(unassignError.message);
    const { error } = await supabase.from("regions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["regions", org.orgId] });
    qc.invalidateQueries({ queryKey: ["stores", org.orgId] });
  }
  async function assignRegion(storeId: string, regionId: string) {
    const { error } = await supabase.from("dealerships").update({ region_id: regionId || null }).eq("id", storeId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["stores", org.orgId] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl">Stores</h1><p className="text-muted-foreground">{stores.length} dealerships in {org.orgName}</p></div>
        <div className="flex gap-2">
          {isHr && (
            <Dialog open={regionOpen} onOpenChange={setRegionOpen}>
              <DialogTrigger asChild><Button variant="outline"><MapPinned />Add region</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create a region</DialogTitle></DialogHeader>
                <form onSubmit={addRegion} className="space-y-3">
                  <Field label="Region name (e.g. North Texas)" v={regionName} on={setRegionName} required />
                  <Button type="submit" className="w-full">Save region</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus />Add store</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add a store</DialogTitle></DialogHeader>
              <form onSubmit={add} className="space-y-3">
                <Field label="Store name" v={f.name} on={(v) => setF({ ...f, name: v })} required />
                <Field label="Brand (e.g. Toyota)" v={f.brand} on={(v) => setF({ ...f, brand: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" v={f.city} on={(v) => setF({ ...f, city: v })} />
                  <Field label="State" v={f.state} on={(v) => setF({ ...f, state: v })} />
                </div>
                <Field label="AI assistant's name" v={f.assistant_name} on={(v) => setF({ ...f, assistant_name: v })} required />
                <Button type="submit" className="w-full">Save store</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {regions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {regions.map((r) => (
            <span key={r.id} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm">
              <MapPinned className="size-3.5 text-sapphire" />{r.name}
              <span className="text-muted-foreground">· {stores.filter((s) => s.region_id === r.id).length} stores</span>
              {isHr && <button aria-label={`Remove ${r.name}`} onClick={() => removeRegion(r.id)} className="ml-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((s) => (
          <div key={s.id} className="relative rounded-2xl bg-background p-5 shadow-sm transition hover:shadow-md">
            <Link to="/stores/$storeId" params={{ storeId: s.id }} className="absolute inset-0 rounded-2xl" aria-label={`Open ${s.name} dashboard`} />
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg">{s.name}</h3>
                <p className="text-sm text-muted-foreground">{[s.brand, [s.city, s.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
              </div>
              <Button variant="ghost" size="icon" className="relative z-10" aria-label="Remove store" onClick={() => remove(s.id)}><Trash2 /></Button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 text-sm">
              <span>Assistant: <span className="font-semibold text-sapphire">{s.assistant_name}</span></span>
              <span className="font-semibold text-sapphire">Open dashboard →</span>
            </div>
            {isHr && (
              <div className="relative z-10 mt-3" onClick={(e) => e.stopPropagation()}>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={s.region_id ?? ""}
                  onChange={(e) => assignRegion(s.id, e.target.value)}
                  aria-label={`Region for ${s.name}`}
                >
                  <option value="">No region</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, v, on, required }: { label: string; v: string; on: (v: string) => void; required?: boolean }) {
  return (
    <div className="space-y-1.5"><Label>{label}</Label><Input value={v} required={required} onChange={(e) => on(e.target.value)} /></div>
  );
}
