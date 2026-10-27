import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
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
  const { data: stores = [] } = useQuery({
    queryKey: ["stores", org.orgId],
    queryFn: async () => (await supabase.from("dealerships").select("*").eq("org_id", org.orgId).order("name")).data ?? [],
  });
  const [open, setOpen] = useState(false);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl">Stores</h1><p className="text-muted-foreground">{stores.length} dealerships in {org.orgName}</p></div>
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
            <div className="mt-4 flex items-center justify-between text-sm">
              <span>Assistant: <span className="font-semibold text-sapphire">{s.assistant_name}</span></span>
              <span className="font-semibold text-sapphire">Open dashboard →</span>
            </div>
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
