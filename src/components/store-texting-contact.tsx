import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useOrg } from "@/lib/org";
import { formatPhone } from "@/lib/store-texting";
import { StoreFormFields } from "@/components/store-form-fields";
import { storeToForm, storeValues, validateStore, type StoreErrors } from "@/lib/store-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings2 } from "lucide-react";

export function StoreTextingContact({ store }: { store: Tables<"dealerships"> }) {
  const org = useOrg();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(() => storeToForm(store));
  const [sms, setSms] = useState(store.sms_number ?? "");
  const [errors, setErrors] = useState<StoreErrors>({});
  const qc = useQueryClient();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateStore(f);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const values = org.isPlatformAdmin ? { ...storeValues(f), sms_number: sms.trim() || null } : storeValues(f);
    const { error } = await supabase.from("dealerships").update(values).eq("id", store.id).eq("org_id", store.org_id).select("id").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Store contacts saved");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["stores", store.org_id] });
  }
  return <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setF(storeToForm(store)); setSms(store.sms_number ?? ""); setErrors({}); } }}>
    <DialogTrigger asChild><Button variant="outline" size="sm" className="mt-2 w-full" aria-label={`Texting contacts for ${store.name}`}><Settings2 />Texting & contacts</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>{store.name} — Texting & contacts</DialogTitle></DialogHeader>
      <form onSubmit={save} noValidate className="max-h-[70vh] space-y-3 overflow-y-auto px-1">
        <StoreFormFields f={f} setF={setF} errors={errors} />
        <label className="block space-y-1.5 text-sm"><span>Store texting number</span>
          {org.isPlatformAdmin
            ? <Input aria-label="Store texting number" type="tel" value={sms} onChange={(e) => setSms(e.target.value)} />
            : <p className="rounded-md border bg-muted px-3 py-2 text-muted-foreground">{store.sms_number ? formatPhone(store.sms_number) : "Not set up yet"} · Managed by WerkandMe</p>}
        </label>
        <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Save contacts"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
