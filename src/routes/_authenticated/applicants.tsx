import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, FileText, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { STATUSES, STATUS_LABEL, type AppStatus } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/applicants")({
  head: () => ({ meta: [{ title: "Applicants | WerkandMe Hiring" }] }),
  component: Applicants,
});

function Applicants() {
  const org = useOrg();
  const qc = useQueryClient();
  const key = ["applicants", org.orgId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [apps, jobs, stores] = await Promise.all([
        supabase.from("applications").select("*").eq("org_id", org.orgId).order("created_at", { ascending: false }),
        supabase.from("jobs").select("id, title").eq("org_id", org.orgId),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId).order("name"),
      ]);
      return { apps: apps.data ?? [], jobs: jobs.data ?? [], stores: stores.data ?? [] };
    },
  });
  const [store, setStore] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const apps = (data?.apps ?? []).filter((a) => store === "all" || a.dealership_id === store
    || (store === "shared" && a.open_to_other_stores));
  const job = (id: string) => data?.jobs.find((j) => j.id === id)?.title ?? "";
  const storeName = (id: string) => data?.stores.find((s) => s.id === id)?.name ?? "";
  const current = data?.apps.find((a) => a.id === selected);

  async function update(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("applications").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl">Applicants</h1><p className="text-muted-foreground">Drag a card to move it along.</p></div>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={store} onChange={(e) => setStore(e.target.value)}>
          <option value="all">All stores</option>
          <option value="shared">Open to other stores</option>
          {data?.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map((st) => {
          const col = apps.filter((a) => a.status === st);
          return (
            <div key={st} className="w-72 shrink-0 rounded-2xl bg-secondary p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) update(dragId, { status: st }); setDragId(null); }}>
              <div className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                <span className={cn(st === "hired" && "text-lime")}>{STATUS_LABEL[st]}</span>
                <span className="text-muted-foreground">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((a) => (
                  <button key={a.id} draggable onDragStart={() => setDragId(a.id)} onClick={() => setSelected(a.id)}
                    className="w-full rounded-xl bg-background p-3 text-left shadow-sm transition hover:shadow-md">
                    <div className="font-semibold">{a.full_name}</div>
                    <div className="text-xs text-muted-foreground">{job(a.job_id)} · {storeName(a.dealership_id)}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="rounded-full bg-accent px-2 py-0.5">{a.source}</span>
                      <span>{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={!!current} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {current && <Profile app={current} jobTitle={job(current.job_id)} storeName={storeName(current.dealership_id)} onUpdate={(p) => update(current.id, p)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type App = { id: string; full_name: string; email: string; phone: string | null; status: AppStatus; resume_path: string | null;
  open_to_other_stores: boolean; rating: number | null; notes: string | null; source: string; created_at: string };

function Profile({ app, jobTitle, storeName, onUpdate }: { app: App; jobTitle: string; storeName: string; onUpdate: (p: Record<string, unknown>) => void }) {
  const [notes, setNotes] = useState(app.notes ?? "");
  const { data: events = [] } = useQuery({
    queryKey: ["events", app.id, app.status],
    queryFn: async () => (await supabase.from("application_events").select("*").eq("application_id", app.id).order("created_at", { ascending: false })).data ?? [],
  });
  async function openResume() {
    if (!app.resume_path) return;
    const { data, error } = await supabase.storage.from("resumes").createSignedUrl(app.resume_path, 300);
    if (error || !data) return toast.error("Resume isn't available yet.");
    window.open(data.signedUrl, "_blank");
  }
  return (
    <div className="space-y-6">
      <SheetHeader><SheetTitle className="text-2xl">{app.full_name}</SheetTitle>
        <p className="text-sm text-muted-foreground">{jobTitle} · {storeName}</p></SheetHeader>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild><a href={`mailto:${app.email}`}><Mail />Email</a></Button>
        {app.phone && <Button size="sm" variant="outline" asChild><a href={`sms:${app.phone}`}><Phone />Text</a></Button>}
        {app.resume_path && <Button size="sm" variant="outline" onClick={openResume}><FileText />Resume</Button>}
      </div>
      <div className="text-sm text-muted-foreground">{app.email}{app.phone ? ` · ${app.phone}` : ""}</div>
      <div>
        <div className="mb-2 text-sm font-semibold">Stage</div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => onUpdate({ status: s })}
              className={cn("rounded-full border px-3 py-1 text-xs", app.status === s ? "border-sapphire bg-sapphire text-primary-foreground" : "hover:border-sapphire")}>
              {STATUS_LABEL[s]}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold">Rating</div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-label={`${n} stars`} onClick={() => onUpdate({ rating: n })}>
              <Star className={cn("size-5", (app.rating ?? 0) >= n ? "fill-chartreuse text-chartreuse" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between rounded-xl bg-secondary p-3 text-sm">
        <span><b>Open to other stores</b><br /><span className="text-muted-foreground">Other stores in your group can reach out. Never shared outside your group.</span></span>
        <Switch checked={app.open_to_other_stores} onCheckedChange={(c) => onUpdate({ open_to_other_stores: c })} />
      </label>
      <div>
        <div className="mb-2 text-sm font-semibold">Notes</div>
        <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (app.notes ?? "") && onUpdate({ notes })} />
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold">Timeline</div>
        <ol className="space-y-2 border-l pl-4 text-sm">
          {events.map((e) => (
            <li key={e.id}><div>{e.message}</div><div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div></li>
          ))}
        </ol>
      </div>
    </div>
  );
}
