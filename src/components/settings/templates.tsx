import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { MERGE_FIELDS, unknownFields } from "@/lib/email/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BulkMessagingSetting } from "@/components/bulk-messaging-setting";


type Tpl = {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  updated_at: string;
};
type Draft = { id?: string; name: string; channel: "email" | "sms"; subject: string; body: string };
const blank: Draft = { name: "", channel: "email", subject: "", body: "" };

/** Starter ideas shown until a group saves its own. */
const STARTERS: Draft[] = [
  {
    name: "New openings near you",
    channel: "email",
    subject: "{first_name}, we're hiring at {store_name}",
    body: "Hi {first_name},\n\nThanks again for your interest in working with us. We have new openings at {store_name} and thought of you. Reply to this email and we'll set up a time to talk.\n\nThanks!",
  },
  {
    name: "Still interested?",
    channel: "email",
    subject: "Still interested in the {job_title} role?",
    body: "Hi {first_name},\n\nWe'd love to keep talking about the {job_title} role at {store_name}. Are you still interested? Just reply and let us know a good time.",
  },
  {
    name: "Interview follow-up (text)",
    channel: "sms",
    subject: "",
    body: "Hi {first_name}, thanks for coming in to {store_name}! We'll be in touch soon about next steps.",
  },
];

export function MessageTemplatesSettings() {
  const org = useOrg();
  const qc = useQueryClient();
  const canEdit = canPostJobs(org.role, org.isPlatformAdmin);
  const key = ["templates", org.orgId];
  const { data: list = [] } = useQuery({
    queryKey: key,
    queryFn: async () =>
      ((
        await supabase
          .from("message_templates")
          .select("id, name, channel, subject, body, updated_at")
          .eq("org_id", org.orgId)
          .order("name")
      ).data ?? []) as Tpl[],
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function save() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.body.trim())
      return toast.error("Give it a name and a message.");
    if (draft.channel === "email" && !draft.subject.trim())
      return toast.error("Emails need a subject.");
    const row = {
      name: draft.name.trim(),
      channel: draft.channel,
      subject: draft.channel === "email" ? draft.subject.trim() : null,
      body: draft.body.trim(),
      updated_at: new Date().toISOString(),
    };
    const { error } = draft.id
      ? await supabase.from("message_templates").update(row).eq("id", draft.id)
      : await supabase.from("message_templates").insert({ ...row, org_id: org.orgId });
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setDraft(null);
    refresh();
  }
  async function remove(t: Tpl) {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    const { error } = await supabase.from("message_templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  const unknown = draft ? unknownFields(`${draft.subject}\n${draft.body}`) : [];

  return (
    <div className="space-y-6">
      <BulkMessagingSetting />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Templates</h1>
          <p className="text-muted-foreground">
            Corporate-approved emails and texts every store can use. Fields like {"{first_name}"}{" "}
            are filled in for each person.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setDraft({ ...blank })}>
            <Plus />
            New template
          </Button>
        )}
      </div>

      {list.length === 0 && (
        <div className="rounded-2xl bg-background p-5 shadow-sm">
          <p className="font-semibold">No templates yet.</p>
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? "Start from one of these, or write your own."
              : "Recruiting/HR can add templates here."}
          </p>
          {canEdit && (
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <Button key={s.name} variant="outline" size="sm" onClick={() => setDraft({ ...s })}>
                  {s.channel === "email" ? <Mail /> : <MessageSquare />}
                  {s.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((t) => (
          <div key={t.id} className="rounded-2xl bg-background p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                {t.channel === "email" ? (
                  <Mail className="size-4 text-sapphire" />
                ) : (
                  <MessageSquare className="size-4 text-sapphire" />
                )}
                {t.name}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${t.name}`}
                    onClick={() =>
                      setDraft({
                        id: t.id,
                        name: t.name,
                        channel: t.channel === "sms" ? "sms" : "email",
                        subject: t.subject ?? "",
                        body: t.body,
                      })
                    }
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => remove(t)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
            {t.subject && <div className="mt-2 text-sm font-medium">{t.subject}</div>}
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
              {t.body}
            </p>
          </div>
        ))}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <Input
                placeholder="Template name (e.g. New openings near you)"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <div className="flex gap-2 text-sm">
                {(["email", "sms"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft({ ...draft, channel: c })}
                    className={`rounded-full px-3 py-1 ${draft.channel === c ? "bg-sapphire text-primary-foreground" : "bg-secondary"}`}
                  >
                    {c === "email" ? "Email" : "Text"}
                  </button>
                ))}
              </div>
              {draft.channel === "email" && (
                <Input
                  placeholder="Subject"
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                />
              )}
              <Textarea
                rows={8}
                placeholder="Message"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Insert:</span>
                {MERGE_FIELDS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className="rounded-full bg-secondary px-2.5 py-1"
                    onClick={() => setDraft({ ...draft, body: `${draft.body}{${f.key}}` })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {draft.channel === "sms" && (
                <p className="text-xs text-muted-foreground">
                  {draft.body.length} characters. Keep texts under 320 so they arrive as one or two
                  messages.
                </p>
              )}
              {unknown.length > 0 && (
                <p className="text-xs text-destructive">
                  Not a known field: {unknown.map((u) => `{${u}}`).join(", ")}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button onClick={save}>Save template</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
