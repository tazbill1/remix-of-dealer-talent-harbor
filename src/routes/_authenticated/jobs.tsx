import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, Pencil, ExternalLink, BookmarkPlus, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { DIVISIONS, REQ_TYPES, STARTER_TEMPLATES, canPostJobs, divisionLabel, formatPay } from "@/lib/jobs";
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

const empty = { title: "", department: "", division: "general", req_type: "replacement", target_start_date: "", hiring_manager: "",
  employment_type: "FULL_TIME", pay_min: "", pay_max: "", pay_period: "YEAR", description: "" };
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
        {[store, divisionLabel(f.division), f.department, f.employment_type.replace("_", " ").toLowerCase(), formatPay(f.pay_min ? Number(f.pay_min) : null, f.pay_max ? Number(f.pay_max) : null, f.pay_period)].filter(Boolean).join(" · ")}
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Division</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.division} onChange={(e) => setF({ ...f, division: e.target.value })}>
            {DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label>Opening is a</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.req_type} onChange={(e) => setF({ ...f, req_type: e.target.value })}>
            {REQ_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label>Hiring manager</Label><Input value={f.hiring_manager} onChange={(e) => setF({ ...f, hiring_manager: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Target start date</Label><Input type="date" value={f.target_start_date} onChange={(e) => setF({ ...f, target_start_date: e.target.value })} /></div>
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
  title: f.title, department: f.department || null, division: f.division, req_type: f.req_type,
  target_start_date: f.target_start_date || null, hiring_manager: f.hiring_manager || null, employment_type: f.employment_type, pay_period: f.pay_period,
  description: f.description, pay_min: f.pay_min ? Number(f.pay_min) : null, pay_max: f.pay_max ? Number(f.pay_max) : null,
});

function Jobs() {
  const org = useOrg();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["jobs", org.orgId],
    queryFn: async () => {
      const [jobs, stores, apps, templates] = await Promise.all([
        supabase.from("jobs").select("*").eq("org_id", org.orgId).order("created_at", { ascending: false }),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId).order("name"),
        supabase.from("applications").select("job_id").eq("org_id", org.orgId),
        supabase.from("job_templates").select("*").eq("org_id", org.orgId).order("title"),
      ]);
      return { jobs: jobs.data ?? [], stores: stores.data ?? [], apps: apps.data ?? [], templates: templates.data ?? [] };
    },
  });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("all");
  const [division, setDivision] = useState("all");
  const hr = canPostJobs(org.role);
  const savedTemplates = data?.templates ?? [];
  const templates: { id?: string; title: string; department: string | null; division: string; employment_type: string; pay_min: number | null; pay_max: number | null; pay_period: string; description: string }[] =
    savedTemplates.length ? savedTemplates : STARTER_TEMPLATES.map((t) => ({ ...t }));
  function applyTemplate(t: (typeof templates)[number]) {
    setF({ ...f, title: t.title, department: t.department ?? "", division: t.division, employment_type: t.employment_type, pay_period: t.pay_period,
      pay_min: t.pay_min != null ? String(t.pay_min) : "", pay_max: t.pay_max != null ? String(t.pay_max) : "", description: t.description });
  }
  async function saveTemplate() {
    if (!f.title) return toast.error("Add a job title first.");
    const p = payload(f);
    const { error } = await supabase.from("job_templates").insert({ org_id: org.orgId, title: p.title, department: p.department, division: p.division,
      employment_type: p.employment_type, pay_min: p.pay_min, pay_max: p.pay_max, pay_period: p.pay_period, description: p.description });
    if (error) return toast.error(error.message);
    toast.success("Saved to your job bank for every store to use.");
    refresh();
  }
  async function deleteTemplate(id: string) {
    await supabase.from("job_templates").delete().eq("id", id);
    refresh();
  }
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
    const rows = picked.map((dealership_id) => ({ org_id: org.orgId, dealership_id, ...payload(f), status: hr ? "open" : "requested" }));
    const { error } = await supabase.from("jobs").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(hr ? `Posted to ${rows.length} store${rows.length > 1 ? "s" : ""}! It's live on your careers site and job feed.`
      : "Request sent! Recruiting/HR will review and post it.");
    setOpen(false); setF(empty); setPicked([]);
    refresh();
  }
  function openJob(j: NonNullable<typeof viewing>) {
    setEf({
      title: j.title, department: j.department ?? "", division: j.division, req_type: j.req_type,
      target_start_date: j.target_start_date ?? "", hiring_manager: j.hiring_manager ?? "", employment_type: j.employment_type, pay_period: j.pay_period,
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
    const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
    if (error) return toast.error("Only Recruiting/HR can change this job.");
    if (status === "open") toast.success("Approved and live!");
    refresh();
  }
  const feedUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/feed/${org.orgSlug}` : "";
  const jobs = (data?.jobs ?? []).filter((j) => (filter === "all" || j.dealership_id === filter) && (division === "all" || j.division === division));
  const openJobs = (data?.jobs ?? []).filter((j) => j.status === "open");
  const requests = (data?.jobs ?? []).filter((j) => j.status === "requested");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl">Jobs</h1><p className="text-muted-foreground">{hr ? "Post once, share to as many stores as you like." : "Request a new opening. Recruiting/HR reviews and posts it."}</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button disabled={!stores.length}><Plus />{hr ? "Post a job" : "Request a job"}</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{hr ? "Post a job" : "Request a job"}</DialogTitle></DialogHeader>
            <VoiceJobWriter onDraft={(j) => setF(fromAi(j))} />
            {f.description && <JobPreview f={f} />}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Job bank</Label>
                {hr && <button type="button" onClick={saveTemplate} className="flex items-center gap-1 text-xs text-sapphire"><BookmarkPlus className="size-3.5" />Save this job to the bank</button>}
              </div>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <span key={t.id ?? t.title} className="flex items-center rounded-full border text-xs hover:border-sapphire">
                    <button type="button" onClick={() => applyTemplate(t)} className="px-3 py-1 hover:text-sapphire">{t.title}</button>
                    {hr && t.id && <button type="button" aria-label={`Remove ${t.title}`} onClick={() => deleteTemplate(t.id!)} className="pr-2 text-muted-foreground hover:text-destructive"><X className="size-3" /></button>}
                  </span>
                ))}
              </div>
              {!savedTemplates.length && <p className="text-xs text-muted-foreground">Starter roles shown. {hr ? "Save your own to build your group's job bank." : ""}</p>}
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
              <Button type="submit" className="w-full">{hr ? "Post job" : "Send request to HR"}</Button>
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
                    {viewing.status === "requested" && hr && <Button onClick={() => setStatus(viewing.id, "open")}><Check />Approve & post</Button>}
                    <Button variant={viewing.status === "requested" && hr ? "outline" : "default"} onClick={() => setEditing(true)}><Pencil />Edit</Button>
                    <Button variant="outline" asChild>
                      <a href={`/c/${org.orgSlug}/jobs/${viewing.id}`} target="_blank" rel="noreferrer"><ExternalLink />View live page</a>
                    </Button>
                    {hr && viewing.status !== "requested" && <Button variant="outline" onClick={() => setStatus(viewing.id, viewing.status === "open" ? "closed" : "open")}>
                      {viewing.status === "open" ? "Close job" : "Reopen job"}
                    </Button>}
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

      <div className="grid gap-3 sm:grid-cols-4">
        {[["Open roles", openJobs.length], ["Fixed Ops open", openJobs.filter((j) => j.division === "fixed_ops").length],
          ["Variable open", openJobs.filter((j) => j.division === "variable").length], ["Waiting on HR", requests.length]].map(([l, n]) => (
          <div key={l} className="rounded-2xl bg-background p-4 shadow-sm"><div className="text-2xl font-bold">{n}</div><div className="text-sm text-muted-foreground">{l}</div></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All stores</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={division} onChange={(e) => setDivision(e.target.value)}>
          <option value="all">All divisions</option>{DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl bg-background shadow-sm">
        {jobs.map((j) => (
          <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-0">
            <button type="button" className="text-left hover:text-sapphire" onClick={() => openJob(j)}>
              <div className="font-semibold">{j.title}</div>
              <div className="text-sm text-muted-foreground">
                {storeName(j.dealership_id)} · {divisionLabel(j.division)} · {j.req_type === "growth" ? "Growth" : "Replacement"}{j.hiring_manager ? ` · ${j.hiring_manager}` : ""} · {formatPay(j.pay_min, j.pay_max, j.pay_period) ?? "Pay not listed"} · {(data?.apps ?? []).filter((a) => a.job_id === j.id).length} applicants
              </div>
            </button>
            <div className="flex items-center gap-2">
              <Badge variant={j.status === "open" ? "default" : "secondary"}>{j.status === "requested" ? "waiting on HR" : j.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => openJob(j)}>Open</Button>
              {hr && (j.status === "requested"
                ? <Button size="sm" onClick={() => setStatus(j.id, "open")}>Approve</Button>
                : <Button size="sm" variant="outline" onClick={() => setStatus(j.id, j.status === "open" ? "closed" : "open")}>{j.status === "open" ? "Close" : "Reopen"}</Button>)}
            </div>
          </div>
        ))}
        {!jobs.length && <p className="p-6 text-sm text-muted-foreground">{stores.length ? "No jobs yet. Post your first one!" : "Add a store first, then post jobs."}</p>}
      </div>
    </div>
  );
}
