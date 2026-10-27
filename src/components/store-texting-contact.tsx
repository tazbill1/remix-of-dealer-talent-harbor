import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings2 } from "lucide-react";

export function StoreTextingContact({ store }: { store: Tables<"dealerships"> }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const initial = () => ({ sms_number: store.sms_number ?? "", timezone: store.timezone, manager_name: store.manager_name ?? "", manager_phone: store.manager_phone ?? "", escalation_name: store.escalation_name ?? "", escalation_phone: store.escalation_phone ?? "" });
  const [f, setF] = useState(initial);
  const qc = useQueryClient();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { new Intl.DateTimeFormat("en-US", { timeZone: f.timezone }); } catch { return toast.error("Enter a valid time zone, such as America/Chicago."); }
    setSaving(true);
    const { error } = await supabase.from("dealerships").update(f).eq("id", store.id).eq("org_id", store.org_id).select("id").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Store contacts saved");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["stores", store.org_id] });
  }
  return <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setF(initial()); }}>
    <DialogTrigger asChild><Button variant="outline" size="sm" className="mt-2 w-full" aria-label={`Texting contacts for ${store.name}`}><Settings2 />Texting & contacts</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>{store.name} — Texting & contacts</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-3">
        {([{ key: "sms_number", label: "Store texting number", type: "tel" }, { key: "timezone", label: "Time zone", type: "text" }, { key: "manager_name", label: "Hiring contact name", type: "text" }, { key: "manager_phone", label: "Hiring contact phone", type: "tel" }, { key: "escalation_name", label: "Escalation contact name", type: "text" }, { key: "escalation_phone", label: "Escalation contact phone", type: "tel" }] as const).map(({ key, label, type }) => <label key={key} className="block space-y-1.5 text-sm">{label}<Input aria-label={label} type={type} required={key === "timezone"} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} /></label>)}
        <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Save contacts"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}