import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, FileText, Star, ArrowRightLeft, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { STATUSES, STATUS_LABEL, type AppStatus } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AddApplicantDialog, AssistantThreads, InterviewsPanel } from "@/components/applicant-tools";
import { UserPlus } from "lucide-react";

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
        supabase.from("jobs").select("id, title, dealership_id, status").eq("org_id", org.orgId),
        supabase.from("dealerships").select("id, name, assistant_name").eq("org_id", org.orgId).order("name"),
      ]);
      return { apps: apps.data ?? [], jobs: jobs.data ?? [], stores: stores.data ?? [] };
    },
  });
  const [store, setStore] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<AppStatus>("screening");
  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const chosen = (data?.apps ?? []).filter((a) => checked.includes(a.id));
  async function bulkMove() {
    const { error } = await supabase.from("applications").update({ status: bulkStatus }).in("id", checked);
    if (error) return toast.error(error.message);
    toast.success(`Moved ${checked.length} applicant${checked.length > 1 ? "s" : ""} to ${STATUS_LABEL[bulkStatus]}.`);
    setChecked([]); qc.invalidateQueries({ queryKey: key });
  }
  function bulkEmail() {
    const emails = [...new Set(chosen.map((a) => a.email))].join(",");
    window.location.href = `mailto:?bcc=${encodeURIComponent(emails)}`;
  }
  async function transfer(appId: string, jobId: string) {
    const target = data?.jobs.find((j) => j.id === jobId);
    const app = data?.apps.find((a) => a.id === appId);
    if (!target || !app) return;
    const { error } = await supabase.from("applications").update({ job_id: target.id, dealership_id: target.dealership_id }).eq("id", appId);
    if (error) return toast.error(error.message);
    await supabase.from("application_events").insert({ org_id: org.orgId, application_id: appId, kind: "transfer",
      message: `Transferred from ${job(app.job_id)} at ${storeName(app.dealership_id)} to ${target.title} at ${storeName(target.dealership_id)}` });
    toast.success(`Transferred to ${storeName(target.dealership_id)}. Notes and history came along.`);
    qc.invalidateQueries({ queryKey: key });
  }
  const apps = (data?.apps ?? []).filter((a) => store === "all" || a.dealership_id === store
    || (store === "shared" && a.open_to_other_stores));
  const job = (id: string) => data?.jobs.find((j) => j.id === id)?.title ?? "";
  const storeName = (id: string) => data?.stores.find((s) => s.id === id)?.name ?? "";
  const current = data?.apps.find((a) => a.id === selected);

  async function update(id: string, patch: Database["public"]["Tables"]["applications"]["Update"]) {
    const { error } = await supabase.from("applications").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl">Applicants</h1><p className="text-muted-foreground">Drag a card to move it along, or tick several to update them at once.</p></div>
        <div className="flex gap-2"><Button onClick={() => setAdding(true)}><UserPlus />Add applicant</Button>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={store} onChange={(e) => setStore(e.target.value)}>
          <option value="all">All stores</option>
          <option value="shared">Open to other stores</option>
          {data?.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></div>
      </div>
      <AddApplicantDialog open={adding} onOpenChange={setAdding} orgId={org.orgId} onCreated={() => qc.invalidateQueries({ queryKey: key })}
        jobs={(data?.jobs ?? []).filter((j) => j.status === "open").map((j) => ({ id: j.id, dealership_id: j.dealership_id, label: `${storeName(j.dealership_id)} · ${j.title}` }))} />
      {checked.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-navy p-3 text-navy-foreground shadow-lg">
          <span className="text-sm font-semibold">{checked.length} selected</span>
          <Button size="sm" variant="secondary" onClick={bulkEmail}><Mail />Email them</Button>
          <span className="text-sm">Move to</span>
          <select className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as AppStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <Button size="sm" variant="secondary" onClick={bulkMove}>Update stage</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setChecked([])}><X />Clear</Button>
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map((st) => {
          const col = apps.filter((a) => a.status === st);
          return (
            <div key={st} className="w-72 shrink-0 rounded-2xl bg-secondary p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) update(dragId, { status: st }); setDragId(null); }}>
              <div className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                <span className={cn(st === "hired" && "text-lime")}>{STATUS_LABEL[st]}</span>
                <span className="flex items-center gap-2 text-muted-foreground">{col.length}
                  {col.length > 0 && <Checkbox aria-label={`Select all ${STATUS_LABEL[st]}`} checked={col.every((a) => checked.includes(a.id))}
                    onCheckedChange={(c) => setChecked((prev) => c ? [...new Set([...prev, ...col.map((a) => a.id)])] : prev.filter((id) => !col.some((a) => a.id === id)))} />}</span>
              </div>
              <div className="space-y-2">
                {col.map((a) => (
                  <div key={a.id} role="button" tabIndex={0} draggable onDragStart={() => setDragId(a.id)} onClick={() => setSelected(a.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(a.id)}
                    className={cn("w-full cursor-pointer rounded-xl bg-background p-3 text-left shadow-sm transition hover:shadow-md", checked.includes(a.id) && "ring-2 ring-sapphire")}>
                    <div className="flex items-start justify-between gap-2"><div className="font-semibold">{a.full_name}</div>
                      <span onClick={(e) => e.stopPropagation()}><Checkbox aria-label={`Select ${a.full_name}`} checked={checked.includes(a.id)} onCheckedChange={() => toggle(a.id)} /></span></div>
                    <div className="text-xs text-muted-foreground">{job(a.job_id)} · {storeName(a.dealership_id)}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="rounded-full bg-accent px-2 py-0.5">{a.source}</span>
                      <span>{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={!!current} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {current && <Profile app={current} jobTitle={job(current.job_id)} storeName={storeName(current.dealership_id)} onUpdate={(p) => update(current.id, p)}
            transferOptions={(data?.jobs ?? []).filter((j) => j.status === "open" && j.id !== current.job_id).map((j) => ({ id: j.id, label: `${storeName(j.dealership_id)} · ${j.title}` }))}
            onTransfer={(jobId) => transfer(current.id, jobId)} orgId={org.orgId}
            assistantName={data?.stores.find((s) => s.id === current.dealership_id)?.assistant_name ?? "Assistant"}
            onRefresh={() => qc.invalidateQueries({ queryKey: key })} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type App = { profile: unknown; ai_summary: string | null; id: string; full_name: string; email: string; phone: string | null; status: AppStatus; resume_path: string | null;
  open_to_other_stores: boolean; rating: number | null; notes: string | null; source: string; created_at: string };

function Profile({ app, jobTitle, storeName, onUpdate, transferOptions, onTransfer, orgId, assistantName, onRefresh }: { orgId: string; assistantName: string; onRefresh: () => void; app: App; jobTitle: string; storeName: string;
  onUpdate: (p: Database["public"]["Tables"]["applications"]["Update"]) => void; transferOptions: { id: string; label: string }[]; onTransfer: (jobId: string) => void }) {
  const [notes, setNotes] = useState(app.notes ?? "");
  const [target, setTarget] = useState("");
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
      {app.ai_summary && <p className="rounded-xl bg-accent p-3 text-sm">{app.ai_summary}</p>}
      <ProfileFacts profile={app.profile as Record<string, unknown>} />
      <AssistantThreads appId={app.id} orgId={orgId} assistantName={assistantName} onChanged={onRefresh} />
      <InterviewsPanel appId={app.id} orgId={orgId} title={`Interview: ${app.full_name} (${jobTitle})`} onChanged={onRefresh} />
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
      <div className="rounded-xl border p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><ArrowRightLeft className="size-4" />Transfer to another store</div>
        <p className="mb-2 text-xs text-muted-foreground">Better fit somewhere else in your group? Move them to that store's opening. Notes, rating and history come along.</p>
        <div className="flex gap-2">
          <select className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Pick an open job...</option>
            {transferOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <Button size="sm" disabled={!target} onClick={() => { onTransfer(target); setTarget(""); }}>Transfer</Button>
        </div>
      </div>
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

const FACT_LABELS: Record<string, string> = { current_title: "Current title", years_experience: "Experience (yrs)", certifications: "Certifications",
  availability: "Availability", desired_pay: "Desired pay", earliest_start: "Earliest start", has_drivers_license: "Driver's license",
  past_employers: "Past employers", skills: "Skills", city: "City", facts: "Other notes" };
function ProfileFacts({ profile }: { profile: Record<string, unknown> }) {
  const rows = Object.entries(profile ?? {}).filter(([k, v]) => FACT_LABELS[k] && v !== null && v !== "" && !(Array.isArray(v) && !v.length));
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm">
      {rows.map(([k, v]) => (
        <div key={k}><dt className="text-xs text-muted-foreground">{FACT_LABELS[k]}</dt>
          <dd>{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</dd></div>
      ))}
    </dl>
  );
}
