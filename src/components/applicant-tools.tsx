import { clearAttention, sendStaffText, setAssistantPaused } from "@/lib/takeover.functions";
import { scheduleStaffInterview, sendBookingLink } from "@/lib/booking.functions";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Loader2, Send, CalendarPlus, Download, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseResume, assistantMessage, type ParsedResume } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deliveryLabel } from "@/lib/messaging/labels";
import { EmailHistory } from "@/components/email-compose";
import { useMessagingMode } from "@/lib/texting-mode";
import { ScorecardButton, ScorecardSummary } from "@/components/interview-scorecard";

const toB64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = rej; r.readAsDataURL(f);
});
const ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function AddApplicantDialog({ open, onOpenChange, orgId, jobs, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; orgId: string;
  jobs: { id: string; label: string; dealership_id: string }[]; onCreated: () => void;
}) {
  const parse = useServerFn(parseResume);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [p, setP] = useState<ParsedResume | null>(null);
  const [jobId, setJobId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() { setFile(null); setP(null); setJobId(""); setBusy(false); }
  async function handle(f: File) {
    if (f.size > 10_000_000) return toast.error("That file is over 10 MB.");
    setFile(f); setBusy(true);
    try {
      const out = await parse({ data: { file: await toB64(f), mime: f.type || (f.name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ""), jobs: jobs.map(({ id, label }) => ({ id, label })) } });
      setP(out);
      if (out.suggested_job_id && jobs.some((j) => j.id === out.suggested_job_id)) setJobId(out.suggested_job_id);
    } catch (e: any) { toast.error(e.message); setFile(null); }
    setBusy(false);
  }
  async function save() {
    if (!p || !file) return;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return toast.error("Pick the job they're applying for.");
    if (!p.full_name.trim() || !p.email.trim()) return toast.error("Name and email are needed.");
    setBusy(true);
    const profile = { years_experience: p.years_experience, certifications: p.certifications, current_title: p.current_title,
      past_employers: p.past_employers, skills: p.skills, city: p.city };
    const { data: app, error } = await supabase.from("applications").insert({ org_id: orgId, job_id: job.id, dealership_id: job.dealership_id,
      full_name: p.full_name.trim(), email: p.email.trim(), phone: p.phone.trim() || null, source: "manual", profile, ai_summary: p.summary }).select("id").single();
    if (error || !app) { setBusy(false); return toast.error(error?.message ?? "Couldn't save."); }
    const path = `${orgId}/${app.id}/${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("resumes").upload(path, file, { contentType: file.type });
    if (!up.error) await supabase.from("applications").update({ resume_path: path }).eq("id", app.id);
    await supabase.from("application_events").insert({ org_id: orgId, application_id: app.id, kind: "manual", message: "Added from an uploaded resume" });
    toast.success(`${p.full_name} added to New.`);
    reset(); onOpenChange(false); onCreated();
  }
  const set = (k: keyof ParsedResume, v: any) => setP((x) => (x ? { ...x, [k]: v } : x));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Add an applicant</DialogTitle></DialogHeader>
        {!p ? (
          <button type="button" onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
            className={cn("flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition", over ? "border-sapphire bg-accent" : "hover:border-sapphire")}>
            {busy ? <><Loader2 className="size-8 animate-spin text-sapphire" /><b>Reading {file?.name}...</b><span className="text-sm text-muted-foreground">Pulling out name, contact info, experience and certifications.</span></>
              : <><Upload className="size-8 text-sapphire" /><b>Drop a resume here</b><span className="text-sm text-muted-foreground">PDF, Word (.docx) or a photo. We'll fill everything in for you.</span></>}
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl bg-accent p-3 text-sm"><Sparkles className="size-4 text-sapphire" />Filled in from {file?.name}. Check it over, then save.</div>
            {(["full_name", "email", "phone", "current_title"] as const).map((k) => (
              <label key={k} className="block text-sm"><span className="font-medium capitalize">{k.replace("_", " ")}</span>
                <Input value={p[k]} onChange={(e) => set(k, e.target.value)} /></label>
            ))}
            <label className="block text-sm"><span className="font-medium">Years of experience</span>
              <Input type="number" value={p.years_experience ?? ""} onChange={(e) => set("years_experience", e.target.value ? Number(e.target.value) : null)} /></label>
            <label className="block text-sm"><span className="font-medium">Certifications (comma separated)</span>
              <Input value={p.certifications.join(", ")} onChange={(e) => set("certifications", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></label>
            {p.summary && <p className="rounded-xl bg-secondary p-3 text-sm">{p.summary}</p>}
            <label className="block text-sm"><span className="font-medium">Job {p.suggested_job_id && jobId === p.suggested_job_id && <span className="text-sapphire">(suggested match)</span>}</span>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">Pick a job...</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
              </select></label>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={reset}>Start over</Button>
              <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save applicant</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AssistantThreads({ appId, orgId, assistantName, onChanged, paused, needsAttention }: { appId: string; orgId: string; assistantName: string; onChanged: () => void; paused?: boolean; needsAttention?: string | null }) {
  const send = useServerFn(assistantMessage);
  const pause = useServerFn(setAssistantPaused);
  const handled = useServerFn(clearAttention);
  const staffSend = useServerFn(sendStaffText);
  const [staffText, setStaffText] = useState("");
  async function toggle(p: boolean) {
    try { await pause({ data: { applicationId: appId, paused: p } }); toast.success(p ? "You've taken over. The assistant won't reply." : `${assistantName} is back on these texts.`); }
    catch (e) { toast.error((e as Error).message); }
    onChanged();
  }
  async function sendAsTeam() {
    const body = staffText.trim(); if (!body) return;
    setStaffText("");
    try { const r = await staffSend({ data: { applicationId: appId, body } }); if (r.note) toast.warning(r.note); }
    catch (e) { toast.error((e as Error).message); setStaffText(body); }
    qc.invalidateQueries({ queryKey: ["messages", appId] }); onChanged();
  }
  const qc = useQueryClient();
  const [party, setParty] = useState<"candidate" | "manager">("candidate");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: msgs = [] } = useQuery({
    queryKey: ["messages", appId],
    queryFn: async () => (await supabase.from("messages").select("*").eq("application_id", appId).order("created_at")).data ?? [],
  });
  const thread = msgs.filter((m) => m.party === party && m.channel !== "email");
  // Once a group is live, replies come from real phones, so typing as them is turned off.
  const { textLive } = useMessagingMode(orgId);
  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    const body = text; setText("");
    try {
      const r = await send({ data: { applicationId: appId, party, body, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      if (r.keyword) toast.success(`${r.keyword.toUpperCase()} recorded for this number.`);
      if (r.delivery === "blocked") toast.warning("The reply wasn't sent. See the note under the message.");
      if (r.changed.length) toast.success(`Profile updated: ${r.changed.join(", ")}`);
      if (r.interviewAt) toast.success(`Interview booked for ${new Date(r.interviewAt).toLocaleString()}`);
    } catch (e: any) { toast.error(e.message); setText(body); }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["messages", appId] });
    qc.invalidateQueries({ queryKey: ["interviews", appId] });
    onChanged();
  }
  return (
    <>
    {needsAttention && (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
        <span className="font-semibold text-destructive">Needs a person:</span>
        <span className="min-w-0 flex-1">{needsAttention}</span>
        <Button size="sm" variant="outline" onClick={async () => { await handled({ data: { applicationId: appId } }); onChanged(); }}>Mark handled</Button>
      </div>
    )}
    <div className="rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs">
        <span className={paused ? "font-medium text-destructive" : "text-muted-foreground"}>
          {paused ? `${assistantName} is paused: a team member is handling the candidate texts.` : `${assistantName} is answering the candidate.`}
        </span>
        <div className="shrink-0 text-right">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggle(!paused)}>
            {paused ? `Hand back to ${assistantName}` : `Take over from ${assistantName}`}
          </Button>
          {!paused && <p className="max-w-44 text-[10px] leading-tight text-muted-foreground">{assistantName} stops replying to this candidate until you hand back.</p>}
        </div>
      </div>
      <div className="flex border-b text-sm">
        {(["candidate", "manager"] as const).map((p) => (
          <button key={p} onClick={() => setParty(p)} className={cn("flex-1 px-3 py-2 font-medium", party === p ? "border-b-2 border-sapphire text-sapphire" : "text-muted-foreground")}>
            {p === "candidate" ? "Texts with candidate" : "Texts with hiring manager"}</button>
        ))}
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto p-3">
        {thread.length === 0 && <p className="text-center text-xs text-muted-foreground">No texts yet. Type as the {party === "candidate" ? "candidate" : "hiring manager"} to see how {assistantName} responds and updates this profile.</p>}
        {thread.map((m) => {
          const label = deliveryLabel(m);
          return (
            <div key={m.id} className={cn("max-w-[85%]", m.direction === "out" ? "" : "ml-auto")}>
              <div className={cn("rounded-2xl px-3 py-2 text-sm", m.direction === "out" ? "bg-sapphire text-primary-foreground" : "bg-secondary",
                m.status === "blocked" && "opacity-60")}>
                <div className="text-[10px] opacity-70">{m.direction === "out" ? assistantName : party === "candidate" ? "Candidate" : "Hiring manager"}</div>{m.body}</div>
              {label && <div className={cn("mt-0.5 px-2 text-[11px] text-muted-foreground", (m.status === "blocked" || m.status === "failed") && "text-destructive")}>{label}</div>}
            </div>
          );
        })}
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />{assistantName} is typing...</div>}
      </div>
      {party === "candidate" && paused && (
        <form className="flex gap-2 border-t bg-accent/40 p-2" onSubmit={(e) => { e.preventDefault(); void sendAsTeam(); }}>
          <Input value={staffText} maxLength={600} onChange={(e) => setStaffText(e.target.value)} placeholder="Reply to the candidate as the team..." />
          <Button size="icon" disabled={!staffText.trim()} aria-label="Send to candidate"><Send /></Button>
        </form>
      )}
      {textLive && (
        <p className="border-t p-3 text-xs text-muted-foreground">Live texting is on: replies here come from the {party === "candidate" ? "candidate's" : "hiring manager's"} real phone.</p>
      )}
    </div>
    <EmailHistory messages={msgs} />
    {!textLive && (
      <details className="rounded-xl border bg-secondary/40">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground">
          Practice: text as the {party === "candidate" ? "candidate" : "hiring manager"}
        </summary>
        <div className="space-y-1.5 px-3 pb-3">
          <p className="text-[11px] text-muted-foreground">Practice only. Nothing is sent.</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={party === "candidate" ? "Practice: text as the candidate..." : "Practice: text as the hiring manager..."} />
            <Button size="icon" disabled={busy || !text.trim()} aria-label="Send"><Send /></Button>
          </form>
        </div>
      </details>
    )}
    </>
  );
}

function ics(i: { id: string; starts_at: string; duration_min: number; location: string | null }, title: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const s = new Date(i.starts_at); const e = new Date(s.getTime() + i.duration_min * 60000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WerkandMe//Hiring//EN", "BEGIN:VEVENT", `UID:${i.id}@werkandme`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(s)}`, `DTEND:${f(e)}`, `SUMMARY:${title}`, `LOCATION:${i.location ?? ""}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

export function InterviewsPanel({ appId, orgId, title, onChanged }: { appId: string; orgId: string; title: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [when, setWhen] = useState("");
  const schedule = useServerFn(scheduleStaffInterview);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const textLink = useServerFn(sendBookingLink);
  const [linkBusy, setLinkBusy] = useState(false);
  const { data: list = [] } = useQuery({
    queryKey: ["interviews", appId],
    queryFn: async () => (await supabase.from("interviews").select("*").eq("application_id", appId).order("starts_at")).data ?? [],
  });
  async function add() {
    if (!when) return;
    const starts_at = new Date(when).toISOString();
    setScheduleBusy(true);
    try {
      const result = await schedule({ data: { applicationId: appId, startsAt: starts_at } });
      if (result.invite.note) toast.warning(result.invite.note);
      else toast.success(result.invite.status === "sent" ? "Interview saved. Staff calendar invite emailed." : "Interview saved.");
    } catch (e) { toast.error((e as Error).message); return; }
    finally { setScheduleBusy(false); }
    setWhen(""); qc.invalidateQueries({ queryKey: ["interviews", appId] }); onChanged();
  }
  function download(i: (typeof list)[number]) {
    const url = URL.createObjectURL(new Blob([ics(i, title)], { type: "text/calendar" }));
    const a = document.createElement("a"); a.href = url; a.download = "interview.ics"; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CalendarPlus className="size-4" />Interviews</div>
      {list.length === 0 && <p className="mb-2 text-xs text-muted-foreground">None yet. The assistant books these automatically when a time is agreed by text, or add one here.</p>}
      <ul className="mb-2 space-y-1 text-sm">
        {list.map((i) => (
          <li key={i.id} className="flex items-center justify-between rounded-lg bg-secondary px-2 py-1">
            <span className={i.status === "cancelled" ? "text-muted-foreground line-through" : ""}>{new Date(i.starts_at).toLocaleString()} <span className="text-xs text-muted-foreground">· {i.status === "cancelled" ? "cancelled" : i.source === "werkandme" ? "booked in WerkandMe" : i.source === "self_scheduled" ? "picked by the candidate" : `found on ${i.source} calendar`}</span></span>
            <span className="flex shrink-0 items-center">
              {i.status !== "cancelled" && <ScorecardButton interviewId={i.id} appId={appId} orgId={orgId} />}
              <Button size="sm" variant="ghost" onClick={() => download(i)} aria-label="Add to calendar"><Download /></Button>
            </span>
          </li>
        ))}
      </ul>
      <ScorecardSummary appId={appId} />
      <div className="flex gap-2"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <Button size="sm" onClick={add} disabled={!when || scheduleBusy}>{scheduleBusy ? "Saving…" : "Schedule"}</Button></div>
      {!when && <p className="mt-1 text-xs text-muted-foreground">Pick a date and time to schedule.</p>}
      <Button size="sm" variant="outline" className="mt-2" disabled={linkBusy} onClick={async () => {
        setLinkBusy(true);
        try {
          const r = await textLink({ data: { applicationId: appId } });
          if (r.note) toast.message(r.note); else toast.success("Booking link texted");
          try { await navigator.clipboard.writeText(r.link); } catch { /* clipboard is optional */ }
        } catch (e) { toast.error((e as Error).message); }
        setLinkBusy(false);
      }}><Send />Text booking link</Button>
      <p className="mt-1 text-xs text-muted-foreground">They pick from this store's interview hours. The link is also copied for you.</p>
    </div>
  );
}
