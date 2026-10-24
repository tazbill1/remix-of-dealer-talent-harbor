import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, Pencil, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { ROLE_TEMPLATES, formatPay } from "@/lib/jobs";
import { VoiceJobWriter } from "@/components/voice-job-writer";
import type { AiJobDraft } from "@/lib/ai-job.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({ meta: [{ title: "Jobs | WerkandMe Hiring" }] }),
  component: Jobs,
});

const empty = { title: "", department: "", employment_type: "FULL_TIME", pay_min: "", pay_max: "", pay_period: "YEAR", description: "" };
type Form = typeof empty;

const fromAi = (j: AiJobDraft["job"]) => (prev: Form): Form => ({
  ...prev, title: j.title, department: j.department, employment_type: j.employment_type,
  pay_period: j.pay_period, description: j.description,
  pay_min: j.pay_min != null ? String(j.pay_min) : "", pay_max: j.pay_max != null ? String(j.pay_max) : "",
});

function JobPreview({ f, store }: { f: Form; store?: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How applicants see it</p>
      <h3 className="mt-1 text-xl font-bold">{f.title || "Job title"}</h3>
      <p className="text-sm text-muted-foreground">
        {[store, f.department, f.employment_type.replace("_", " ").toLowerCase(), formatPay(f.pay_min ? Number(f.pay_min) : null, f.pay_max ? Number(f.pay_max) : null, f.pay_period)].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-3 whitespace-pre-line text-sm">{f.description || "No description yet."}</p>
    </div>
  );
}

function JobFields({ f, setF }: { f: Form; setF: (f: Form) => void }) {
  return (
    <>
      <div className="space-y-1.5"><Label>Job title</Label><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Department</Label><Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Type</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.employment_type} onChange={(e) => setF({ ...f, employment_type: e.target.value })}>
            <option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="CONTRACTOR">Contract</option>
          </select></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>Pay from</Label><Input type="number" value={f.pay_min} onChange={(e) => setF({ ...f, pay_min: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Pay to</Label><Input type="number" value={f.pay_max} onChange={(e) => setF({ ...f, pay_max: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Per</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.pay_period} onChange={(e) => setF({ ...f, pay_period: e.target.value })}>
            <option value="YEAR">Year</option><option value="HOUR">Hour</option>
          </select></div>
      </div>
      <div className="space-y-1.5"><Label>Description</Label><Textarea rows={8} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
    </>
  );
}

const payload = (f: Form) => ({
  title: f.title, department: f.department || null, employment_type: f.employment_type, pay_period: f.pay_period,
  description: f.description, pay_min: f.pay_min ? Number(f.pay_min) : null, pay_max: f.pay_max ? Number(f.pay_max) : null,
});

function Jobs() {
  const org = useOrg();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["jobs", org.orgId],
    queryFn: async () => {
      const [jobs, stores, apps] = await Promise.all([
        supabase.from("jobs").select("*").eq("org_id", org.orgId).order("created_at", { ascending: false }),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId).order("name"),
        supabase.from("applications").select("job_id").eq("org_id", org.orgId),
      ]);
      return { jobs: jobs.data ?? [], stores: stores.data ?? [], apps: apps.data ?? [] };
    },
  });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("all");
  const [viewId, setViewId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState(empty);
  const stores = data?.stores ?? [];
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "";
  const refresh = () => qc.invalidateQueries({ queryKey: ["jobs", org.orgId] });
  const viewing = (data?.jobs ?? []).find((j) => j.id === viewId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!picked.length) return toast.error("Pick at least one store.");
    const rows = picked.map((dealership_id) => ({ org_id: org.orgId, dealership_id, ...payload(f) }));
    const { error } = await supabase.from("jobs").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Posted to ${rows.length} store${rows.length > 1 ? "s" : ""}! It's live on your careers site and job feed.`);
    setOpen(false); setF(empty); setPicked([]);
    refresh();
  }
  function openJob(j: NonNullable<typeof viewing>) {
    setEf({
      title: j.title, department: j.department ?? "", employment_type: j.employment_type, pay_period: j.pay_period,
      description: j.description ?? "", pay_min: j.pay_min != null ? String(j.pay_min) : "", pay_max: j.pay_max != null ? String(j.pay_max) : "",
    });
    setEditing(false); setViewId(j.id);
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!viewId) return;
    const { error } = await supabase.from("jobs").update(payload(ef)).eq("id", viewId);
    if (error) return toast.error(error.message);
    toast.success("Changes saved! Your careers site and job feed are updated.");
    setEditing(false); refresh();
  }
  async function setStatus(id: string, status: string) {
    await supabase.from("jobs").update({ status }).eq("id", id);
    refresh();
  }
  const feedUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/feed/${org.orgSlug}` : "";
  const jobs = (data?.jobs ?? []).filter((j) => filter === "all" || j.dealership_id === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl">Jobs</h1><p className="text-muted-foreground">Post once, share to as many stores as you like.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button disabled={!stores.length}><Plus />Post a job</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Post a job</DialogTitle></DialogHeader>
            <VoiceJobWriter onDraft={(j) => setF(fromAi(j))} />
            {f.description && <JobPreview f={f} />}
            <div className="flex flex-wrap gap-2">
              {ROLE_TEMPLATES.map((t) => (
                <button key={t.title} type="button" onClick={() => setF({ ...f, ...t })}
                  className="rounded-full border px-3 py-1 text-xs hover:border-sapphire hover:text-sapphire">{t.title}</button>
              ))}
            </div>
            <form onSubmit={save} className="space-y-3">
              <JobFields f={f} setF={setF} />
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label>Stores</Label>
                  <button type="button" className="text-xs text-sapphire" onClick={() => setPicked(picked.length === stores.length ? [] : stores.map((s) => s.id))}>
                    {picked.length === stores.length ? "Clear" : "Select all"}</button></div>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {stores.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={picked.includes(s.id)} onCheckedChange={(c) => setPicked(c ? [...picked, s.id] : picked.filter((p) => p !== s.id))} />{s.name}
                    </label>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full">Post job</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader><DialogTitle>{editing ? "Edit job" : "Job posting"}</DialogTitle></DialogHeader>
              {editing ? (
                <>
                  <VoiceJobWriter onDraft={(j) => setEf(fromAi(j))} />
                  <JobPreview f={ef} store={storeName(viewing.dealership_id)} />
                  <form onSubmit={saveEdit} className="space-y-3">
                    <JobFields f={ef} setF={setEf} />
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1">Save changes</Button>
                      <Button type="button" variant="outline" onClick={() => openJob(viewing)}>Cancel</Button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <JobPreview f={ef} store={storeName(viewing.dealership_id)} />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setEditing(true)}><Pencil />Edit</Button>
                    <Button variant="outline" asChild>
                      <a href={`/c/${org.orgSlug}/jobs/${viewing.id}`} target="_blank" rel="noreferrer"><ExternalLink />View live page</a>
                    </Button>
                    <Button variant="outline" onClick={() => setStatus(viewing.id, viewing.status === "open" ? "closed" : "open")}>
                      {viewing.status === "open" ? "Close job" : "Reopen job"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="rounded-2xl bg-navy p-5 text-navy-foreground">
        <p className="text-sm font-semibold">Your job feed for Indeed, ZipRecruiter and Glassdoor</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="truncate rounded bg-sidebar-accent px-2 py-1 text-xs">{feedUrl}</code>
          <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(feedUrl); toast.success("Feed link copied"); }}><Copy />Copy</Button>
        </div>
        <p className="mt-2 text-xs text-sidebar-foreground">Send this link to each job site once. New jobs then show up there automatically.</p>
      </div>

      <select className="h-9 rounded-md border bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">All stores</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <div className="overflow-hidden rounded-2xl bg-background shadow-sm">
        {jobs.map((j) => (
          <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-0">
            <button type="button" className="text-left hover:text-sapphire" onClick={() => openJob(j)}>
              <div className="font-semibold">{j.title}</div>
              <div className="text-sm text-muted-foreground">
                {storeName(j.dealership_id)} · {formatPay(j.pay_min, j.pay_max, j.pay_period) ?? "Pay not listed"} · {(data?.apps ?? []).filter((a) => a.job_id === j.id).length} applicants
              </div>
            </button>
            <div className="flex items-center gap-2">
              <Badge variant={j.status === "open" ? "default" : "secondary"}>{j.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => openJob(j)}>Open</Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(j.id, j.status === "open" ? "closed" : "open")}>
                {j.status === "open" ? "Close" : "Reopen"}
              </Button>
            </div>
          </div>
        ))}
        {!jobs.length && <p className="p-6 text-sm text-muted-foreground">{stores.length ? "No jobs yet. Post your first one!" : "Add a store first, then post jobs."}</p>}
      </div>
    </div>
  );
}
