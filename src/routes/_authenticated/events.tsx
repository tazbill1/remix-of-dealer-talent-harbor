import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
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

type Ev = { id: string; name: string; event_date: string; location: string | null; store_id: string | null; job_id: string | null; code: string; is_active: boolean };
const EMPTY = { name: "", event_date: "", location: "", store_id: "", job_id: "" };

function EventsPage() {
  const org = useOrg();
  const qc = useQueryClient();
  const isHr = canPostJobs(org.role, org.isPlatformAdmin);
  const key = ["recruiting-events", org.orgId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [ev, stores, jobs, counts] = await Promise.all([
        supabase.from("recruiting_events").select("id, name, event_date, location, store_id, job_id, code, is_active").eq("org_id", org.orgId).order("event_date", { ascending: false }),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId).order("name"),
        supabase.from("jobs").select("id, title, dealership_id, status").eq("org_id", org.orgId),
        supabase.from("applicant_scan_counts").select("event_id, applicants, hires").eq("org_id", org.orgId).eq("kind", "event"),
      ]);
      return { events: (ev.data ?? []) as Ev[], stores: stores.data ?? [], jobs: jobs.data ?? [], counts: counts.data ?? [] };
    },
  });
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const [qrFor, setQrFor] = useState<Ev | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const stores = data?.stores ?? [];
  const storeName = (id: string | null) => (id ? stores.find((s) => s.id === id)?.name ?? "Store" : "Group-wide");
  const jobTitle = (id: string | null) => (id ? data?.jobs.find((j) => j.id === id)?.title ?? "Job" : "All jobs");
  const count = (id: string) => (data?.counts ?? []).filter((c) => c.event_id === id).reduce((a, c) => ({ applicants: a.applicants + (c.applicants ?? 0), hires: a.hires + (c.hires ?? 0) }), { applicants: 0, hires: 0 });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.name.trim() || !draft.event_date) return toast.error("Name and date are needed.");
    if (!isHr && !draft.store_id) return toast.error("Pick one of your stores.");
    const { error } = await supabase.from("recruiting_events").insert({
      org_id: org.orgId, name: draft.name.trim(), event_date: draft.event_date, location: draft.location.trim() || null,
      store_id: draft.store_id || null, job_id: draft.job_id || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Event added.");
    setDraft(null); qc.invalidateQueries({ queryKey: key });
  }
  async function toggle(ev: Ev, on: boolean) {
    const { data: saved, error } = await supabase.from("recruiting_events").update({ is_active: on }).eq("id", ev.id).select("id").maybeSingle();
    if (error || !saved) return toast.error(error?.message ?? "You can't change this event.");
    qc.invalidateQueries({ queryKey: key });
  }

  const draftJobs = (data?.jobs ?? []).filter((j) => j.status === "open" && (!draft?.store_id || j.dealership_id === draft.store_id));
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
                <td className="px-3 py-2.5">{storeName(ev.store_id)}</td>
                <td className="px-3 py-2.5">{jobTitle(ev.job_id)}</td>
                <td className="px-3 py-2.5 text-right">{c.applicants}</td>
                <td className="px-3 py-2.5 text-right">{c.hires}</td>
                <td className="px-3 py-2.5"><Switch aria-label="Active" checked={ev.is_active} onCheckedChange={(on) => toggle(ev, on)} /></td>
                <td className="px-3 py-2.5 text-right"><Button size="sm" variant="outline" onClick={() => setQrFor(ev)}><QrCode />QR code</Button></td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add event</DialogTitle></DialogHeader>
          {draft && (
            <form onSubmit={save} className="space-y-3">
              <label className="block text-sm"><span className="font-medium">Name</span><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <label className="block text-sm"><span className="font-medium">Date</span><Input type="date" value={draft.event_date} onChange={(e) => setDraft({ ...draft, event_date: e.target.value })} /></label>
              <label className="block text-sm"><span className="font-medium">Location (optional)</span><Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></label>
              <label className="block text-sm"><span className="font-medium">Store</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.store_id} onChange={(e) => setDraft({ ...draft, store_id: e.target.value, job_id: "" })}>
                  {isHr ? <option value="">Group-wide (all stores)</option> : <option value="">Pick a store...</option>}
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>
              <label className="block text-sm"><span className="font-medium">Job (optional)</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.job_id} onChange={(e) => setDraft({ ...draft, job_id: e.target.value })}>
                  <option value="">None: show the jobs page</option>
                  {draftJobs.map((j) => <option key={j.id} value={j.id}>{draft.store_id ? j.title : `${storeName(j.dealership_id)} · ${j.title}`}</option>)}
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
            caption={`Scans open ${qrFor.job_id ? "the job's apply page" : "the jobs page"}, tagged with this event.`}
            fileName={`${qrFor.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-event-qr.png`} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
