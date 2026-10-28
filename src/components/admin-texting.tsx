import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { listTextingAdmin, saveMyTestPhone, saveStoreTexting, sendPreviewText } from "@/lib/store-texting.functions";
import { formatPhone } from "@/lib/store-texting";
import { TextingSettings } from "@/components/texting-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Store = {
  id: string; name: string; sms_number: string | null;
  phone_number_sid: string | null; messaging_service_sid: string | null; live: boolean;
};

/** WerkandMe Admin: per-store Twilio texting setup. Platform admins only. */
export function AdminTexting() {
  const list = useServerFn(listTextingAdmin);
  const savePhone = useServerFn(saveMyTestPhone);
  const q = useQuery({ queryKey: ["admin-texting"], queryFn: () => list() });
  const [editing, setEditing] = useState<Store | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const qc = useQueryClient();

  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading texting…</p>;
  if (q.isError) return <p role="alert">Unable to load texting.</p>;
  const d = q.data;
  const myPhone = phone ?? formatPhone(d.myPhone) ?? "";

  return (
    <section className="space-y-4" aria-labelledby="texting-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="texting-heading" className="flex items-center gap-2 text-2xl"><MessageSquare aria-hidden="true" className="h-5 w-5" />Texting</h2>
          <p className="text-sm text-muted-foreground">
            Each store's texting number and Twilio details. Dealers see these read-only. Twilio is{" "}
            {d.twilioConnected ? "connected" : "not connected yet, so live stores fail safely and nothing is sent"}.
          </p>
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try { await savePhone({ data: { phone: myPhone } }); toast.success("Your test phone is saved"); qc.invalidateQueries({ queryKey: ["admin-texting"] }); }
            catch (err) { toast.error((err as Error).message); }
          }}
        >
          <label className="space-y-1 text-sm">My phone for preview texts
            <Input aria-label="My phone for preview texts" type="tel" value={myPhone} onChange={(e) => setPhone(e.target.value)} placeholder="(214) 555-0123" className="w-48" />
          </label>
          <Button size="sm" variant="outline" type="submit">Save</Button>
        </form>
      </div>
      <div className="overflow-hidden rounded-2xl bg-background shadow-sm">
        {d.orgs.map((o) => (
          <div key={o.id} className="border-b p-4 last:border-0">
            <div className="font-semibold">{o.name}</div>
            {o.stores.length === 0 && <p className="text-sm text-muted-foreground">No stores yet.</p>}
            <ul className="mt-2 divide-y">
              {o.stores.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground"> · {formatPhone(s.sms_number) ?? "Not set up yet"} · {s.live ? "Live" : "Off"}</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setEditing(s)} aria-label={`Edit texting for ${s.name}`}>Edit</Button>
                </li>
              ))}
            </ul>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium">Texting hours and timing</summary>
              <TextingSettings orgId={o.id} canEdit />
            </details>
          </div>
        ))}
      </div>
      {editing && <EditStore store={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function EditStore({ store, onClose }: { store: Store; onClose: () => void }) {
  const save = useServerFn(saveStoreTexting);
  const preview = useServerFn(sendPreviewText);
  const qc = useQueryClient();
  const [f, setF] = useState({
    smsNumber: formatPhone(store.sms_number) ?? "",
    phoneNumberSid: store.phone_number_sid ?? "",
    messagingServiceSid: store.messaging_service_sid ?? "",
    live: store.live,
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.live && !store.live && !window.confirm(`Turn on live texting for ${store.name}? Real texts will go to candidates and managers.`)) return;
    setBusy(true);
    try {
      await save({ data: { storeId: store.id, smsNumber: f.smsNumber || null, phoneNumberSid: f.phoneNumberSid || null, messagingServiceSid: f.messagingServiceSid || null, live: f.live } });
      toast.success("Texting saved");
      qc.invalidateQueries({ queryKey: ["admin-texting"] });
      onClose();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{store.name} — Texting</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1.5 text-sm">Store texting number
            <Input aria-label="Store texting number" type="tel" value={f.smsNumber} onChange={(e) => setF({ ...f, smsNumber: e.target.value })} placeholder="(214) 555-0123" />
          </label>
          <label className="block space-y-1.5 text-sm">Twilio phone number SID
            <Input aria-label="Twilio phone number SID" value={f.phoneNumberSid} onChange={(e) => setF({ ...f, phoneNumberSid: e.target.value })} placeholder="PN…" />
          </label>
          <label className="block space-y-1.5 text-sm">Twilio messaging service SID
            <Input aria-label="Twilio messaging service SID" value={f.messagingServiceSid} onChange={(e) => setF({ ...f, messagingServiceSid: e.target.value })} placeholder="MG…" />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <span><span className="font-medium">Live texting</span><br /><span className="text-muted-foreground">Off: texts are practice only and never sent.</span></span>
            <Switch aria-label="Live texting" checked={f.live} onCheckedChange={(v) => setF({ ...f, live: v })} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save texting"}</Button>
            <Button
              type="button" variant="outline" disabled={busy || !store.sms_number}
              title={!store.sms_number ? "Save a texting number first" : undefined}
              onClick={async () => {
                try { const r = await preview({ data: { storeId: store.id } }); toast.success(`Preview text sent to ${formatPhone(r.sentTo)}`); }
                catch (err) { toast.error((err as Error).message); }
              }}
            >Send me a preview text</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
