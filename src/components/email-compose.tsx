import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendEmails } from "@/lib/email.functions";
import { MERGE_FIELDS, renderTemplate, unknownFields, type MergeValues } from "@/lib/email/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Recipient = {
  id: string;
  full_name: string;
  email: string;
  jobTitle: string;
  storeName: string;
};

/**
 * Write an email to one applicant or many, optionally from a corporate template.
 * Merge fields like {first_name} are filled in for each person when it's sent.
 */
export function EmailCompose({
  open,
  onOpenChange,
  orgId,
  recipients,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  recipients: Recipient[];
  onSent?: () => void;
}) {
  const qc = useQueryClient();
  const send = useServerFn(sendEmails);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["email-compose", orgId],
    enabled: open,
    queryFn: async () => {
      const [t, s] = await Promise.all([
        supabase
          .from("message_templates")
          .select("id, name, subject, body")
          .eq("org_id", orgId)
          .eq("channel", "email")
          .order("name"),
        supabase.from("messaging_settings").select("email_mode").eq("org_id", orgId).maybeSingle(),
      ]);
      return { templates: t.data ?? [], live: s.data?.email_mode === "live" };
    },
  });

  const first = recipients[0];
  const sample: MergeValues = first
    ? {
        first_name: first.full_name.trim().split(/\s+/)[0] ?? "",
        full_name: first.full_name,
        job_title: first.jobTitle,
        store_name: first.storeName,
      }
    : {};
  const unknown = unknownFields(`${subject}\n${body}`);

  function applyTemplate(id: string) {
    const t = data?.templates.find((x) => x.id === id);
    setTemplateId(t?.id ?? null);
    if (t) {
      setSubject(t.subject ?? "");
      setBody(t.body);
    }
  }
  const insertField = (key: string) => setBody((b) => `${b}{${key}}`);

  async function submit() {
    if (!subject.trim() || !body.trim()) return toast.error("Add a subject and a message.");
    setBusy(true);
    try {
      const r = await send({
        data: { orgId, applicationIds: recipients.map((x) => x.id), subject, body, templateId },
      });
      const skipped = [
        r.blocked ? `${r.blocked} skipped (unsubscribed or no email)` : null,
        r.duplicates ? `${r.duplicates} duplicate address${r.duplicates > 1 ? "es" : ""}` : null,
      ].filter(Boolean);
      toast.success(
        `${r.mode === "live" ? "Sent" : "Logged in practice mode"}: ${r.sent} email${r.sent === 1 ? "" : "s"}${skipped.length ? ` · ${skipped.join(" · ")}` : ""}`,
      );
      recipients.forEach((x) => qc.invalidateQueries({ queryKey: ["messages", x.id] }));
      setSubject("");
      setBody("");
      setTemplateId(null);
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Email {recipients.length === 1 ? first?.full_name : `${recipients.length} applicants`}
          </DialogTitle>
        </DialogHeader>
        {data && !data.live && (
          <p className="rounded-lg bg-accent px-3 py-2 text-sm">
            <b>Practice mode.</b> Emails are saved on each profile but not sent.{" "}
            <Link to="/integrations" className="underline">
              Connect email
            </Link>
          </p>
        )}
        <div className="space-y-3">
          {(data?.templates.length ?? 0) > 0 && (
            <select
              aria-label="Template"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={templateId ?? ""}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">Start from a template…</option>
              {data?.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Textarea
            placeholder="Write your message…"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Insert:</span>
            {MERGE_FIELDS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => insertField(f.key)}
                className="rounded-full bg-secondary px-2.5 py-1 hover:bg-secondary/70"
              >
                {f.label}
              </button>
            ))}
          </div>
          {unknown.length > 0 && (
            <p className="text-xs text-destructive">
              Not a known field: {unknown.map((u) => `{${u}}`).join(", ")}. It will be sent as
              written.
            </p>
          )}
          {first && (subject || body) && (
            <div className="rounded-xl border bg-muted/40 p-3 text-sm">
              <div className="mb-1 text-xs font-semibold text-muted-foreground">
                Preview for {first.full_name}
              </div>
              <div className="font-semibold">{renderTemplate(subject, sample)}</div>
              <div className="mt-1 whitespace-pre-wrap">{renderTemplate(body, sample)}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                + store name, address and an unsubscribe link
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || recipients.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <Mail />}
            {recipients.length === 1 ? "Send email" : `Send to ${recipients.length}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The emails sent to this applicant, newest first, with their delivery status. */
export function EmailHistory({
  messages,
}: {
  messages: {
    id: string;
    channel: string;
    subject: string | null;
    body: string;
    status: string;
    error: string | null;
    created_at: string;
    direction: string;
    scheduled_for: string | null;
  }[];
}) {
  const emails = messages.filter((m) => m.channel === "email").reverse();
  if (!emails.length) return null;
  const label = (m: (typeof emails)[number]) =>
    m.status === "simulated"
      ? "Practice · not sent"
      : m.status === "blocked"
        ? `Not sent: ${m.error ?? "blocked"}`
        : m.status === "failed"
          ? `Failed${m.error ? `: ${m.error}` : ""}`
          : m.status === "queued" || m.status === "sending"
            ? "Sending…"
            : m.status === "delivered"
              ? "Delivered"
              : "Sent";
  return (
    <div className="rounded-xl border">
      <div className="border-b px-3 py-2 text-sm font-medium">Emails</div>
      <div className="divide-y">
        {emails.map((m) => (
          <details key={m.id} className="px-3 py-2 text-sm">
            <summary className="flex cursor-pointer items-center justify-between gap-2">
              <span className="truncate font-medium">{m.subject || "(no subject)"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(m.created_at).toLocaleDateString()} · {label(m)}
              </span>
            </summary>
            <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{m.body}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
