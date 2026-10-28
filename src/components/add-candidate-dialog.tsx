import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LINKEDIN_ERROR, normalizeLinkedInUrl } from "@/lib/linkedin";
import { RESUME_MAX_BYTES, resumeExtension, resumeStoragePath } from "@/lib/manual-candidate";

// Manual entry: no welcome text or confirmation email is sent (inserted directly, not via the apply flow).
export function AddCandidateDialog({ open, onOpenChange, orgId, stores, jobs, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; orgId: string;
  stores: { id: string; name: string }[];
  jobs: { id: string; title: string; dealership_id: string }[];
  onCreated: () => void;
}) {
  const empty = { first: "", last: "", email: "", phone: "", store: "", job: "", linkedin: "", notes: "" };
  const [f, setF] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setF((x) => ({ ...x, [k]: v, ...(k === "store" ? { job: "" } : {}) }));
  const storeJobs = jobs.filter((j) => j.dealership_id === f.store);

  function pick(fl: File | undefined) {
    if (!fl) return setFile(null);
    if (!resumeExtension(fl.name)) return toast.error("Resume must be a PDF, DOC or DOCX file.");
    if (fl.size > RESUME_MAX_BYTES) return toast.error("That file is over 10 MB.");
    setFile(fl);
  }

  async function save() {
    const first = f.first.trim(), last = f.last.trim(), email = f.email.trim().toLowerCase();
    if (!first || !last) return toast.error("First and last name are needed.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Enter a valid email.");
    if (!f.store) return toast.error("Pick a store.");
    if (!f.job) return toast.error("Pick a job.");
    const linkedin = normalizeLinkedInUrl(f.linkedin);
    if (f.linkedin.trim() && !linkedin) return toast.error(LINKEDIN_ERROR);
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) { setBusy(false); return toast.error("Please sign in again."); }
    const { data: app, error } = await supabase.from("applications").insert({
      org_id: orgId, job_id: f.job, dealership_id: f.store,
      full_name: `${first} ${last}`, email, phone: f.phone.trim() || null,
      linkedin_url: linkedin, notes: f.notes.trim() || null, source: "manual",
      created_manually: true, created_by: uid,
    }).select("id").single();
    if (error || !app) { setBusy(false); return toast.error(error?.message ?? "Couldn't save."); }
    await supabase.from("application_events").insert({ org_id: orgId, application_id: app.id, kind: "manual", message: "Added manually", actor_id: uid });
    if (file) {
      const path = resumeStoragePath(orgId, app.id, file.name)!;
      const up = await supabase.storage.from("resumes").upload(path, file, { contentType: file.type || undefined, upsert: true });
      if (up.error) toast.error("Candidate saved, but the resume didn't upload.");
      else {
        const { error: e2 } = await supabase.from("applications").update({ resume_path: path, resume_file_name: file.name }).eq("id", app.id);
        if (e2) toast.error("Candidate saved, but the resume couldn't be linked.");
      }
    }
    toast.success(`${first} ${last} added.`);
    setBusy(false); setF(empty); setFile(null); onOpenChange(false); onCreated();
  }

  const field = (k: keyof typeof empty, label: string, type = "text") => (
    <label className="block text-sm"><span className="font-medium">{label}</span>
      <Input type={type} value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setF(empty); setFile(null); } onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Add candidate</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">{field("first", "First name")}{field("last", "Last name")}</div>
          {field("email", "Email", "email")}
          {field("phone", "Phone", "tel")}
          <label className="block text-sm"><span className="font-medium">Store</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.store} onChange={(e) => set("store", e.target.value)}>
              <option value="">Pick a store...</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          <label className="block text-sm"><span className="font-medium">Job</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.job} disabled={!f.store} onChange={(e) => set("job", e.target.value)}>
              <option value="">{f.store ? (storeJobs.length ? "Pick a job..." : "No jobs at this store") : "Pick a store first"}</option>
              {storeJobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select></label>
          {field("linkedin", "LinkedIn URL (optional)", "url")}
          <label className="block text-sm"><span className="font-medium">Notes (optional)</span>
            <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
          <label className="block text-sm"><span className="font-medium">Resume (optional)</span>
            <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => pick(e.target.files?.[0])} />
            <span className="text-xs text-muted-foreground">PDF, DOC or DOCX, up to 10 MB.</span></label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save candidate</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
