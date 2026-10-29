import { clearAttention, getTextingOptOut, sendStaffText, setAssistantPaused, setTextingOptOut } from "@/lib/takeover.functions";
import { rescheduleInterview, scheduleStaffInterview, sendBookingLink } from "@/lib/booking.functions";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Loader2, Send, CalendarPlus, Download, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { assistantMessage } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deliveryLabel } from "@/lib/messaging/labels";
import { EmailHistory } from "@/components/email-compose";
import { useMessagingMode } from "@/lib/texting-mode";
import { ScorecardButton, ScorecardSummary } from "@/components/interview-scorecard";
import { QuickFeedbackButton, QuickFeedbackSummary } from "@/components/quick-interview-feedback";

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
      {party === "candidate" && <TextingOptOut appId={appId} onChanged={onChanged} />}
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

/** "Do not text" status for the applicant's number, with a button for staff to set it. */
function TextingOptOut({ appId, onChanged }: { appId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const read = useServerFn(getTextingOptOut);
  const save = useServerFn(setTextingOptOut);
  const [busy, setBusy] = useState(false);
  const { data: s } = useQuery({ queryKey: ["texting-opt-out", appId], queryFn: () => read({ data: { applicationId: appId } }) });
  if (!s?.phone) return null;
  const byStaff = s.source === "staff";
  async function set(optedOut: boolean) {
    if (optedOut && !window.confirm("Stop all texts to this number? Use this when the applicant asks not to be texted.")) return;
    setBusy(true);
    try {
      await save({ data: { applicationId: appId, optedOut } });
      toast.success(optedOut ? "Marked do-not-text. No more texts will go to this number." : "Do-not-text mark removed.");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["texting-opt-out", appId] }); onChanged();
  }
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-xs", s.optedOut && "bg-destructive/10")}>
      <span className={s.optedOut ? "font-medium text-destructive" : "text-muted-foreground"}>
        {s.optedOut
          ? `Opted out of texts${s.since ? ` on ${new Date(s.since).toLocaleDateString()}` : ""}${byStaff ? " (marked by the team)" : s.source === "carrier" ? " (reported by the phone company)" : " (by the applicant)"}. No texts will be sent.`
          : "Texts allowed to this number."}
      </span>
      {!s.optedOut && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => set(true)}>Mark do not text</Button>}
      {s.optedOut && byStaff && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => set(false)}>Undo</Button>}
      {s.optedOut && !byStaff && <span className="text-[10px] text-muted-foreground">Only the applicant can turn texts back on, by texting START.</span>}
    </div>
  );
}

/** .ics text for one interview, shared by the applicant panel and the Interviews page. */
export function ics(i: { id: string; starts_at: string; duration_min: number; location: string | null }, title: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const s = new Date(i.starts_at); const e = new Date(s.getTime() + i.duration_min * 60000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WerkandMe//Hiring//EN", "BEGIN:VEVENT", `UID:${i.id}@werkandme`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(s)}`, `DTEND:${f(e)}`, `SUMMARY:${title}`, `LOCATION:${i.location ?? ""}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

export function InterviewsPanel({ appId, orgId, title, onChanged, focusInterviewId }: { appId: string; orgId: string; title: string; onChanged: () => void; focusInterviewId?: string | undefined }) {
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
          <li key={i.id} ref={(node) => { if (node && i.id === focusInterviewId) node.scrollIntoView({ block: "nearest" }); }} className="rounded-lg bg-secondary px-2 py-1">
            <div className="flex flex-wrap items-center justify-between gap-1">
            <span className={i.status === "cancelled" ? "text-muted-foreground line-through" : ""}>{new Date(i.starts_at).toLocaleString()} <span className="text-xs text-muted-foreground">· {i.status === "cancelled" ? "cancelled" : i.source === "werkandme" ? "booked in WerkandMe" : i.source === "self_scheduled" ? "picked by the candidate" : `found on ${i.source} calendar`}</span></span>
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              <QuickFeedbackButton interviewId={i.id} appId={appId} orgId={orgId} />
              {i.status !== "cancelled" && isUpcoming(i.starts_at) && (
                <RescheduleButton interviewId={i.id} startsAt={i.starts_at} onDone={() => { qc.invalidateQueries({ queryKey: ["interviews", appId] }); onChanged(); }} />
              )}
              <ScorecardButton interviewId={i.id} appId={appId} orgId={orgId} />
              <Button size="sm" variant="ghost" onClick={() => download(i)} aria-label="Add to calendar"><Download /></Button>
            </span>
            </div>
            <ScorecardSummary appId={appId} interviewId={i.id} />
            <QuickFeedbackSummary appId={appId} interviewId={i.id} />
          </li>
        ))}
      </ul>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Input className="min-w-0 w-full" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <Button size="sm" className="min-h-11 sm:min-h-9" onClick={add} disabled={!when || scheduleBusy}>{scheduleBusy ? "Saving…" : "Schedule"}</Button></div>
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

/** "Text" button dialog: sends through the app's texting (queueText), never the device's messaging app. */
export function TextCompose({ open, onOpenChange, appId, name, onSent }: { open: boolean; onOpenChange: (o: boolean) => void; appId: string; name: string; onSent: () => void }) {
  const qc = useQueryClient();
  const staffSend = useServerFn(sendStaffText);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function send() {
    const text = body.trim(); if (!text) return;
    setBusy(true); setNote(null);
    try {
      const r = await staffSend({ data: { applicationId: appId, body: text } });
      if (r.status === "blocked") { setNote(r.note ? `Not sent: ${r.note}` : "Not sent"); }
      else { setBody(""); setNote(r.status === "simulated" ? "Sent (demo)" : r.status === "queued" ? "Queued to send" : "Sent"); }
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["messages", appId] }); onSent();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setNote(null); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Text {name}</DialogTitle></DialogHeader>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <Input value={body} maxLength={600} onChange={(e) => setBody(e.target.value)} placeholder="Reply to the candidate as the team..." autoFocus />
          <Button size="icon" disabled={busy || !body.trim()} aria-label="Send to candidate">{busy ? <Loader2 className="animate-spin" /> : <Send />}</Button>
        </form>
        {note && <p className={cn("text-xs text-muted-foreground", note.startsWith("Not sent") && "text-destructive")}>{note}</p>}
      </DialogContent>
    </Dialog>
  );
}

/** Upcoming includes anything later today. */
export function isUpcoming(startsAt: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Date.parse(startsAt) >= today.getTime();
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Moves an existing interview to a new time (same picker as Schedule). */
export function RescheduleButton({ interviewId, startsAt, onDone }: { interviewId: string; startsAt: string; onDone: () => void }) {
  const move = useServerFn(rescheduleInterview);
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!when) return;
    setBusy(true);
    try {
      const r = await move({ data: { interviewId, startsAt: new Date(when).toISOString() } });
      if (r.demo) toast.success("Rescheduled (demo)");
      else if (r.note) toast.warning(r.note);
      else toast.success("Rescheduled");
      setOpen(false); onDone();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWhen(toLocalInput(startsAt)); setOpen(true); }}>Reschedule</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader><DialogTitle>Reschedule interview</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Currently {new Date(startsAt).toLocaleString()}</p>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Input className="min-w-0 w-full" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <Button size="sm" className="min-h-11 sm:min-h-9" onClick={save} disabled={!when || busy}>{busy ? "Saving…" : "Reschedule"}</Button></div>
          {!when && <p className="mt-1 text-xs text-muted-foreground">Pick a date and time to schedule.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
