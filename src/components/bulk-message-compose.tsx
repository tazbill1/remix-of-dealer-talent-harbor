import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Loader2, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { bulkReadiness, previewBulkMessage } from "@/lib/bulk-messaging.functions";
import { bulkReasonLabel, type BulkChannel } from "@/lib/bulk-messaging";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function useBulkSettings(orgId: string) {
  return useQuery({ queryKey: ["bulk-settings", orgId], queryFn: async () => {
    const result = await supabase.from("messaging_settings").select("bulk_messaging_enabled, mode, email_mode").eq("org_id", orgId).maybeSingle();
    if (result.error) throw new Error("Could not load messaging settings.");
    return result.data;
  } });
}

export function BulkMessageCompose({ orgId, applicationIds, onClose, onSent }: { orgId: string; applicationIds: string[]; onClose: () => void; onSent: () => void }) {
  const qc = useQueryClient();
  const readinessFn = useServerFn(bulkReadiness);
  const previewFn = useServerFn(previewBulkMessage);
  const [channel, setChannel] = useState<BulkChannel>("text");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<{ sent: number; skipped: number; queued: number; emailDemo: boolean; textDemo: boolean } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const { data: templates = [] } = useQuery({ queryKey: ["bulk-templates", orgId], queryFn: async () => {
    const out = await supabase.from("message_templates").select("id, name, channel, subject, body").eq("org_id", orgId).order("name");
    if (out.error) throw new Error("Could not load templates.");
    return out.data ?? [];
  } });
  const eligibility = useQuery({ queryKey: ["bulk-readiness", orgId, applicationIds, channel], queryFn: () => readinessFn({ data: { orgId, applicationIds, channel } }), staleTime: 0 });
  const ready = eligibility.data;
  const valid = !!body.trim() && body.length <= 10000 && (channel === "text" || (!!subject.trim() && subject.length <= 200));
  const modes = ready ? [channel !== "text" ? `Email${ready.emailDemo ? " (demo)" : " (live)"}` : null, channel !== "email" ? `Text${ready.textDemo ? " (demo)" : " (live)"}` : null].filter(Boolean).join(" · ") : "";
  function insert(key: string) {
    const start = textarea.current?.selectionStart ?? body.length;
    const end = textarea.current?.selectionEnd ?? start;
    const field = `{${key}}`;
    setBody(body.slice(0, start) + field + body.slice(end));
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + field.length, start + field.length); });
  }
  async function send() {
    if (!valid || !ready?.eligible || busy) return;
    setBusy(true);
    try {
      const latest = await eligibility.refetch();
      if (latest.error || !latest.data?.eligible) throw new Error(latest.error?.message ?? "No selected applicants can receive this message.");
      const out = await supabase.rpc("send_bulk_applicants", { _org: orgId, _applicant_ids: applicationIds, _channel: channel, _body: body.trim(), ...(channel === "text" ? {} : { _subject: subject.trim() }) });
      if (out.error) throw new Error(out.error.message);
      const counts = z.object({ sent: z.number(), skipped: z.number(), queued: z.number() }).parse(out.data);
      setResult({ ...counts, emailDemo: latest.data.emailDemo, textDemo: latest.data.textDemo });
      await Promise.all([qc.invalidateQueries({ queryKey: ["bulk-history"] }), qc.invalidateQueries({ queryKey: ["applicants", orgId] }), qc.invalidateQueries({ queryKey: ["messages"] }), qc.invalidateQueries({ queryKey: ["events"] })]);
      onSent();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send message."); }
    finally { setBusy(false); }
  }
  async function preview() {
    setPreviewing(true);
    try {
      const out = await previewFn({ data: { orgId, applicationIds, channel, subject, body } });
      if (out.status === "sent" || out.status === "simulated") toast.success(`${out.status === "simulated" ? "Sent (demo)" : "Preview sent"} · ${out.to}`);
      else toast.error(out.error ?? "Could not send preview.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send preview."); }
    finally { setPreviewing(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Send message</DialogTitle><DialogDescription>{applicationIds.length} selected</DialogDescription></DialogHeader>
      {result ? <div className="space-y-4" role="status">
        <p className="font-semibold">{((channel === "email" && result.emailDemo) || (channel === "text" && result.textDemo) || (channel === "both" && result.emailDemo && result.textDemo)) ? "Sent (demo)" : "Send complete"}</p>
        <p>{result.sent} sent · {result.skipped} skipped · {result.queued} queued</p>
        {channel === "both" && <p className="text-sm text-muted-foreground">{modes} · Counts are individual email/text deliveries.</p>}
        <Button onClick={onClose}>Done</Button>
      </div> : <div className="space-y-4">
        <div className="flex gap-1" role="group" aria-label="Message channel">
          {(["email", "text", "both"] as const).map((c) => <Button key={c} size="sm" variant={channel === c ? "default" : "outline"} aria-pressed={channel === c} onClick={() => { setChannel(c); setTemplate(""); }}>{c === "email" ? <Mail /> : c === "text" ? <MessageSquare /> : <Send />}{c === "email" ? "Email" : c === "text" ? "Text" : "Both"}</Button>)}
        </div>
        <label className="block space-y-1 text-sm">Template (optional)
          <select aria-label="Template (optional)" className="h-9 w-full rounded-md border bg-background px-2" value={template} onChange={(e) => { setTemplate(e.target.value); const t = templates.find((t) => t.id === e.target.value); if (t) { setSubject(t.subject ?? ""); setBody(t.body); } }}>
            <option value="">No template</option>{templates.filter((t) => channel === "both" || t.channel === (channel === "text" ? "sms" : "email")).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        {channel !== "text" && <label className="block space-y-1 text-sm">Subject<Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} /></label>}
        <label className="block space-y-1 text-sm">Message<Textarea ref={textarea} rows={6} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="flex flex-wrap gap-1">{[{ key: "first_name", label: "First name" }, { key: "job_title", label: "Job" }, { key: "store_name", label: "Store" }].map((f) => <Button key={f.key} size="sm" variant="outline" onClick={() => insert(f.key)}>{f.label}</Button>)}</div>
        <Button variant="link" className="h-auto p-0" disabled={!valid || previewing} onClick={preview}>{previewing && <Loader2 className="animate-spin" />}Send me a preview</Button>
        <div aria-live="polite" className="space-y-1 text-sm">
          {eligibility.isFetching ? <p>Checking recipients…</p> : eligibility.error ? <p className="text-destructive">{eligibility.error.message}</p> : ready && <>
            <p className="font-medium">Sending to {ready.eligible} of {ready.selected} · {ready.skipped} skipped{channel !== "both" && Object.keys(ready.reasons).length > 0 && ` (${Object.entries(ready.reasons).map(([r, n]) => `${n} ${bulkReasonLabel(r)}`).join(", ")})`}</p>
            {channel === "both" && <><p>{ready.perChannel.map((c) => `${c.channel === "email" ? "Email" : "Text"}: ${c.sending} sending, ${c.skipped} skipped`).join(" · ")}</p><p className="text-muted-foreground">{Object.entries(ready.reasons).map(([r, n]) => `${n} ${bulkReasonLabel(r)}`).join(" · ")}</p></>}
            <p className="text-muted-foreground">{modes}</p>
          </>}
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={send} disabled={!valid || !ready?.eligible || eligibility.isFetching || busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Send message</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}