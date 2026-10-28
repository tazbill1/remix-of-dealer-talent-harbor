import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { parseResume, type ParsedResume } from "@/lib/assistant.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LINKEDIN_ERROR, normalizeLinkedInUrl } from "@/lib/linkedin";
import { SOURCE_CHANNELS } from "@/lib/sources";
import { RESUME_MAX_BYTES, resumeExtension, resumeStoragePath } from "@/lib/manual-candidate";

// Manual entry: no welcome text or confirmation email is sent (inserted directly, not via the apply flow).
export function AddCandidateDialog({ open, onOpenChange, orgId, stores, jobs, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; orgId: string;
  stores: { id: string; name: string }[];
  jobs: { id: string; title: string; dealership_id: string }[];
  onCreated: () => void;
}) {
  const empty = { first: "", last: "", email: "", phone: "", store: "", job: "", linkedin: "", notes: "", channel: "Manual entry", detail: "" };
  const [f, setF] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // Carried over from the old "Add applicant" form: read the resume and fill in blanks.
  const parse = useServerFn(parseResume);
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [over, setOver] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setF((x) => ({ ...x, [k]: v, ...(k === "store" ? { job: "" } : {}) }));
  // Warn (but still allow saving) when the email or phone matches someone already in this group.
  const [matches, setMatches] = useState<{ id: string; full_name: string }[]>([]);
  useEffect(() => {
    const email = f.email.trim().toLowerCase();
    const digits = f.phone.replace(/\D/g, "");
    const phone = digits.length >= 10 ? digits.slice(-10) : "";
    const conds = [/^\S+@\S+\.\S+$/.test(email) ? `email_norm.eq.${email}` : "", phone ? `phone_norm.eq.${phone}` : ""].filter(Boolean);
    if (!open || !conds.length) { setMatches([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("applications").select("id, full_name").eq("org_id", orgId).is("archived_at", null).or(conds.join(",")).limit(3);
      setMatches(data ?? []);
    }, 400);
    return () => clearTimeout(t);
  }, [f.email, f.phone, open, orgId]);
  const storeJobs = jobs.filter((j) => j.dealership_id === f.store);

  function pick(fl: File | undefined) {
    if (!fl) return setFile(null);
    if (!resumeExtension(fl.name)) return toast.error("Resume must be a PDF, DOC or DOCX file.");
    if (fl.size > RESUME_MAX_BYTES) return toast.error("That file is over 10 MB.");
    setFile(fl);
    void autofill(fl);
  }

  async function autofill(fl: File) {
    const lower = fl.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) return; // the reader handles PDF and Word .docx
    setReading(true);
    try {
      const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(fl); });
      const out = await parse({ data: { file: b64, mime: fl.type || (lower.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf"),
        jobs: jobs.map((j) => ({ id: j.id, label: `${stores.find((s) => s.id === j.dealership_id)?.name ?? ""} · ${j.title}` })) } });
      setParsed(out);
      const [first = "", ...rest] = out.full_name.trim().split(/\s+/);
      const suggested = jobs.find((j) => j.id === out.suggested_job_id);
      setF((x) => ({ ...x,
        first: x.first || first, last: x.last || rest.join(" "), email: x.email || out.email.trim(), phone: x.phone || out.phone.trim(),
        ...(suggested && !x.job ? { store: suggested.dealership_id, job: suggested.id } : {}) }));
    } catch { toast.error("Couldn't read that resume. You can still fill the form in yourself."); }
    setReading(false);
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
      source_channel: f.channel, source_detail: f.detail.trim() || null,
      created_manually: true, created_by: uid,
      ...(parsed ? { ai_summary: parsed.summary || null, profile: { years_experience: parsed.years_experience, certifications: parsed.certifications,
        current_title: parsed.current_title, past_employers: parsed.past_employers, skills: parsed.skills, city: parsed.city } } : {}),
    }).select("id").single();
    if (error || !app) { setBusy(false); return toast.error(error?.message ?? "Couldn't save."); }
    // The database fills a hand-added "Company website" as Manual entry; keep what the recruiter picked.
    if (f.channel === "Company website") await supabase.from("applications").update({ source_channel: f.channel }).eq("id", app.id);
    await supabase.from("application_events").insert({ org_id: orgId, application_id: app.id, kind: "manual", message: parsed ? "Added manually from an uploaded resume" : "Added manually", actor_id: uid });
    if (file) {
      const path = resumeStoragePath(orgId, app.id, file.name)!;
      const up = await supabase.storage.from("resumes").upload(path, file, file.type ? { contentType: file.type } : {});
      if (up.error) toast.error("Candidate saved, but the resume didn't upload.");
      else {
        const { error: e2 } = await supabase.from("applications").update({ resume_path: path, resume_file_name: file.name }).eq("id", app.id);
        if (e2) toast.error("Candidate saved, but the resume couldn't be linked.");
      }
    }
    toast.success(`${first} ${last} added.`);
    setBusy(false); setF(empty); setFile(null); setParsed(null); onOpenChange(false); onCreated();
  }

  const field = (k: keyof typeof empty, label: string, type = "text") => (
    <label className="block text-sm"><span className="font-medium">{label}</span>
      <Input type={type} value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setF(empty); setFile(null); setParsed(null); } onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Add candidate</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">{field("first", "First name")}{field("last", "Last name")}</div>
          {field("email", "Email", "email")}
          {field("phone", "Phone", "tel")}
          {matches.length > 0 && (
            <div className="rounded-xl bg-warning/20 p-3 text-sm text-warning-foreground">
              This email or phone matches someone already in your group:{" "}
              {matches.map((m, i) => <span key={m.id}>{i > 0 && ", "}<Link to="/applicants" search={{ applicant: m.id }} onClick={() => onOpenChange(false)} className="font-semibold underline">{m.full_name}</Link></span>)}
              . You can still save.
            </div>
          )}
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
          <label className="block text-sm"><span className="font-medium">Source (optional)</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.channel} onChange={(e) => set("channel", e.target.value)}>
              {SOURCE_CHANNELS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></label>
          {field("detail", "Source detail (optional)")}
          <label className={over ? "block rounded-md bg-accent text-sm" : "block text-sm"}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
            <span className="font-medium">Resume (optional)</span>
            <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => pick(e.target.files?.[0])} />
            <span className="text-xs text-muted-foreground">PDF, DOC or DOCX, up to 10 MB. Drop one here and we'll fill in the blanks.</span></label>
          {reading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Reading {file?.name}...</div>}
          {parsed && !reading && (
            <div className="space-y-1 rounded-xl bg-accent p-3 text-sm">
              <div className="flex items-center gap-2"><Sparkles className="size-4 text-sapphire" />Filled in from {file?.name}. Check it over, then save.</div>
              {(parsed.current_title || parsed.years_experience != null || parsed.certifications.length > 0) && (
                <div className="text-xs text-muted-foreground">{[parsed.current_title, parsed.years_experience != null ? `${parsed.years_experience} yrs experience` : "", parsed.certifications.join(", ")].filter(Boolean).join(" · ")}</div>)}
              {parsed.summary && <p className="text-xs">{parsed.summary}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || reading}>{busy && <Loader2 className="animate-spin" />}Save candidate</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
