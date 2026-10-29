import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, QrCode, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { coveredEventStores, eventScopeOptions, eventScanCounts } from "@/lib/event-coverage";
import { Checkbox } from "@/components/ui/checkbox";
import { scanLink } from "@/lib/scan";
import { QrCard } from "@/components/qr-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TITLE = "Recruiting events | WerkandMe Hiring";
const DESC = "Hiring events with their own QR codes, applicants and hires.";

export const Route = createFileRoute("/_authenticated/events")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: EventsPage,
});

type Ev = { id: string; name: string; event_date: string; location: string | null; store_id: string | null; job_id: string | null; code: string; is_active: boolean; coverage_mode: string; covered_store_ids: string[]; region_id: string | null };
const EMPTY = { id: "", name: "", event_date: "", location: "", store_id: "", job_id: "", coverage_mode: "stores", covered_store_ids: [] as string[], region_id: "" };

function EventsPage() {
  const org = useOrg();
  const qc = useQueryClient();

  const key = ["recruiting-events", org.orgId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [ev, stores, jobs, counts, regions, options] = await Promise.all([
        supabase.from("recruiting_events").select("id, name, event_date, location, store_id, job_id, code, is_active, coverage_mode, covered_store_ids, region_id").eq("org_id", org.orgId).order("event_date", { ascending: false }),
        supabase.from("dealerships").select("id, name, region_id").eq("org_id", org.orgId).order("name"),
        supabase.from("jobs").select("id, title, dealership_id, status").eq("org_id", org.orgId),
        supabase.from("applicant_scan_counts").select("event_id, store_id, applicants, hires").eq("org_id", org.orgId).eq("kind", "event"),
        supabase.from("regions").select("id, name").eq("org_id", org.orgId).order("name"),
        supabase.rpc("event_coverage_options", { _org: org.orgId }),
      ]);
      if (ev.error || stores.error || jobs.error || counts.error || regions.error || options.error) throw new Error("Couldn't load recruiting events.");
      const raw = options.data as { group_allowed?: boolean; region_ids?: string[] } | null;
      return { options: eventScopeOptions({ group_allowed: raw?.group_allowed === true, region_ids: raw?.region_ids ?? [] }, regions.data ?? []), events: (ev.data ?? []) as Ev[], stores: stores.data ?? [], jobs: jobs.data ?? [], counts: counts.data ?? [] };
    },
  });
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const [qrFor, setQrFor] = useState<Ev | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const stores = data?.stores ?? [];
  const storeName = (id: string | null) => (id ? stores.find((s) => s.id === id)?.name ?? "Store" : "Group-wide");
  const jobTitle = (id: string | null) => (id ? data?.jobs.find((j) => j.id === id)?.title ?? "Job" : "All jobs");
  const count = (id: string) => eventScanCounts(data?.counts ?? [], id);
  const coverage = (ev: Ev) => ev.coverage_mode === "region" ? data?.options.regions.find((r) => r.id === ev.region_id)?.name ?? "Region" : ev.coverage_mode === "group" || (ev.coverage_mode === "legacy" && !ev.store_id) ? "Group-wide" : coveredEventStores(ev, stores).map((s) => s.name).join(", ");
  const scope = draft ? { ...draft, region_id: draft.region_id || null, store_id: draft.store_id || null } : null;
  const covered = scope ? coveredEventStores(scope, stores) : [];
  const canEdit = (ev: Ev) => ev.coverage_mode === "group" || (ev.coverage_mode === "legacy" && !ev.store_id) ? !!data?.options.group : ev.coverage_mode === "region" ? !!data?.options.regions.some((r) => r.id === ev.region_id) : ev.covered_store_ids.every((id) => stores.some((s) => s.id === id));
  const edit = (ev: Ev) => setDraft({ id: ev.id, name: ev.name, event_date: ev.event_date, location: ev.location ?? "", store_id: ev.store_id ?? "", job_id: ev.job_id ?? "", coverage_mode: ev.coverage_mode, covered_store_ids: ev.covered_store_ids, region_id: ev.region_id ?? "" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.name.trim() || !draft.event_date) return toast.error("Name and date are needed.");
    if (draft.coverage_mode === "stores" && !draft.covered_store_ids.length) return toast.error("Pick one of your stores.");
    if (draft.coverage_mode === "region" && !draft.region_id) return toast.error("Pick a region.");
    const payload = {
      org_id: org.orgId, name: draft.name.trim(), event_date: draft.event_date, location: draft.location.trim() || null,
      store_id: draft.coverage_mode === "legacy" ? draft.store_id || null : draft.coverage_mode === "stores" && draft.covered_store_ids.length === 1 ? draft.covered_store_ids[0] ?? null : null, job_id: draft.job_id || null,
      coverage_mode: draft.coverage_mode, covered_store_ids: draft.covered_store_ids, region_id: draft.region_id || null,
    };
    const { data: saved, error } = draft.id
      ? await supabase.from("recruiting_events").update(payload).eq("id", draft.id).eq("org_id", org.orgId).select("id").maybeSingle()
      : await supabase.from("recruiting_events").insert(payload).select("id").single();
    if (error || !saved) return toast.error(error?.message ?? "You can't change this event.");
    toast.success(draft.id ? "Event updated." : "Event added.");
    setDraft(null); qc.invalidateQueries({ queryKey: key });
  }
  async function toggle(ev: Ev, on: boolean) {
    const { data: saved, error } = await supabase.from("recruiting_events").update({ is_active: on }).eq("id", ev.id).select("id").maybeSingle();
    if (error || !saved) return toast.error(error?.message ?? "You can't change this event.");
    qc.invalidateQueries({ queryKey: key });
  }

  const draftJobs = (data?.jobs ?? []).filter((j) => j.status === "open" && covered.some((s) => s.id === j.dealership_id));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Recruiting events</h1>
          <p className="text-sm text-muted-foreground">Give each hiring event its own QR code. Applicants who scan it are tagged with the event.</p>
        </div>
        <Button onClick={() => setDraft({ ...EMPTY })}><Plus />Add event</Button>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-background shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground"><tr>
            <th className="px-3 py-2">Event</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Store</th><th className="px-3 py-2">Job</th>
            <th className="px-3 py-2 text-right">Applicants</th><th className="px-3 py-2 text-right">Hires</th><th className="px-3 py-2">Active</th><th className="px-3 py-2" />
          </tr></thead>
          <tbody className="divide-y">
            {(data?.events ?? []).length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No events yet.</td></tr>}
            {(data?.events ?? []).map((ev) => { const c = count(ev.id); return (
              <tr key={ev.id}>
                <td className="px-3 py-2.5"><div className="font-medium">{ev.name}</div>{ev.location && <div className="text-xs text-muted-foreground">{ev.location}</div>}</td>
                <td className="px-3 py-2.5">{new Date(`${ev.event_date}T12:00:00`).toLocaleDateString()}</td>
                <td className="max-w-64 px-3 py-2.5">{coverage(ev)}</td>
                <td className="px-3 py-2.5">{jobTitle(ev.job_id)}</td>
                <td className="px-3 py-2.5 text-right">{c.applicants}{c.stores.length > 0 && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">By store</summary>{c.stores.map((r) => <div key={r.store_id}>{storeName(r.store_id)}: {r.applicants ?? 0} applicants · {r.hires ?? 0} hires</div>)}</details>}</td>
                <td className="px-3 py-2.5 text-right">{c.hires}</td>
                <td className="px-3 py-2.5"><Switch aria-label="Active" disabled={!canEdit(ev)} checked={ev.is_active} onCheckedChange={(on) => toggle(ev, on)} /></td>
                <td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-2">{canEdit(ev) && <Button size="icon" variant="outline" aria-label={`Edit ${ev.name}`} title="Edit event" onClick={() => edit(ev)}><Pencil /></Button>}<Button size="sm" variant="outline" onClick={() => setQrFor(ev)}><QrCode />QR code</Button></div></td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit event" : "Add event"}</DialogTitle></DialogHeader>
          {draft && (
            <form onSubmit={save} className="space-y-3">
              <label className="block text-sm"><span className="font-medium">Name</span><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <label className="block text-sm"><span className="font-medium">Date</span><Input type="date" value={draft.event_date} onChange={(e) => setDraft({ ...draft, event_date: e.target.value })} /></label>
              <label className="block text-sm"><span className="font-medium">Location (optional)</span><Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></label>
              <label className="block text-sm"><span className="font-medium">Store</span>
                <select aria-label="Event coverage" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.coverage_mode === "legacy" ? draft.store_id ? "stores" : "group" : draft.coverage_mode} onChange={(e) => setDraft({ ...draft, coverage_mode: e.target.value, covered_store_ids: [], region_id: "", job_id: "" })}>
                  <option value="stores">Specific stores</option>
                  {(data?.options.regions.length ?? 0) > 0 && <option value="region">Whole region</option>}
                  {data?.options.group && <option value="group">Group-wide (all stores)</option>}
                </select></label>
              {(draft.coverage_mode === "stores" || (draft.coverage_mode === "legacy" && !!draft.store_id)) && <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">{stores.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><Checkbox aria-label={s.name} checked={draft.covered_store_ids.includes(s.id)} onCheckedChange={(on) => setDraft({ ...draft, coverage_mode: "stores", job_id: "", covered_store_ids: on ? [...draft.covered_store_ids, s.id] : draft.covered_store_ids.filter((id) => id !== s.id) })} />{s.name}</label>)}</div>}
              {draft.coverage_mode === "region" && <select aria-label="Event region" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.region_id} onChange={(e) => setDraft({ ...draft, region_id: e.target.value, job_id: "" })}><option value="">Pick a region...</option>{data?.options.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
              <label className="block text-sm"><span className="font-medium">Job (optional)</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.job_id} onChange={(e) => setDraft({ ...draft, job_id: e.target.value })}>
                  <option value="">None: show the jobs page</option>
                  {draftJobs.map((j) => <option key={j.id} value={j.id}>{`${storeName(j.dealership_id)} · ${j.title}`}</option>)}
                </select></label>
              <Button type="submit" className="w-full">Save</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrFor} onOpenChange={(o) => !o && setQrFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>QR code: {qrFor?.name}</DialogTitle></DialogHeader>
          {qrFor && <QrCard name={qrFor.name} link={scanLink(origin, "event", qrFor.code)} showLink
            caption={`Scans open ${qrFor.coverage_mode === "legacy" && qrFor.job_id ? "the job's apply page" : "the jobs page"}, tagged with this event.`}
            fileName={`${qrFor.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-event-qr.png`} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
