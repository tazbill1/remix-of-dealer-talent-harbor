import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { screeningBacklog } from "@/lib/messaging.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { defaultMessagingSettings, messagingSettingsSchema, type MessagingSettings } from "@/lib/messaging-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function TextingSettings({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const query = useQuery({
    queryKey: ["messaging-settings", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("messaging_settings").select("*").eq("org_id", orgId).maybeSingle();
      if (error) throw error;
      return data ? messagingSettingsSchema.parse(data) : defaultMessagingSettings();
    },
  });
  if (query.isPending) return <p>Loading texting settings…</p>;
  if (query.isError) return <p role="alert">Unable to load texting settings.</p>;
  return <TextingForm key={`${orgId}-${query.dataUpdatedAt}`} orgId={orgId} initial={query.data} canEdit={canEdit} />;
}

function TextingForm({ orgId, initial, canEdit }: { orgId: string; initial: MessagingSettings; canEdit: boolean }) {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const backlog = useServerFn(screeningBacklog);
  const goingLive = false; // Live texting is now switched per store in WerkandMe Admin.
  const [skipBacklog, setSkipBacklog] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const waiting = useQuery({
    queryKey: ["screening-backlog", orgId],
    enabled: goingLive,
    queryFn: () => backlog({ data: { orgId, apply: false } }),
  });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const parsed = messagingSettingsSchema.safeParse(f);
    if (!parsed.success) return toast.error("Check your texting settings.");
    if (goingLive && !confirmed) return toast.error("Confirm the switch to live texting first.");
    setSaving(true);
    if (goingLive && skipBacklog) {
      try {
        const r = await backlog({ data: { orgId, apply: true } });
        if (r.skipped) toast.message(`Skipped manager summaries for ${r.skipped} candidate${r.skipped === 1 ? "" : "s"} already in Screening.`);
      } catch (err) {
        setSaving(false);
        return toast.error((err as Error).message);
      }
    }
    // Automatic text settings are saved on their own page; never overwrite them here.
    const { automations: _automations, ...fields } = parsed.data;
    const { error } = await supabase.from("messaging_settings").upsert({ org_id: orgId, ...fields, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Texting settings saved");
    qc.invalidateQueries({ queryKey: ["messaging-settings", orgId] });
    qc.invalidateQueries({ queryKey: ["messaging-mode", orgId] });
  }
  return <form onSubmit={save} className="mt-4 space-y-4">
    <fieldset disabled={!canEdit || saving} className="min-w-0 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5"><Label asChild><span>AI provider</span></Label><select aria-label="AI provider" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.ai_provider} onChange={(e) => setF({ ...f, ai_provider: e.target.value === "anthropic" ? "anthropic" : "lovable" })}><option value="lovable">Lovable</option><option value="anthropic" disabled>Anthropic (Claude) — Coming soon</option></select></label>
        <label className="space-y-1.5">Texting starts<Input aria-label="Texting starts" type="time" required value={f.send_start.slice(0, 5)} onChange={(e) => setF({ ...f, send_start: e.target.value })} /></label>
        <label className="space-y-1.5">Texting ends<Input aria-label="Texting ends" type="time" required value={f.send_end.slice(0, 5)} onChange={(e) => setF({ ...f, send_end: e.target.value })} /></label>
        <label className="space-y-1.5">Nudge after (hours)<Input aria-label="Nudge after (hours)" type="number" step="1" required value={f.nudge_after_hours} onChange={(e) => setF({ ...f, nudge_after_hours: Number(e.target.value) })} /></label>
        <label className="space-y-1.5">Escalate after (hours)<Input aria-label="Escalate after (hours)" type="number" step="1" required value={f.escalate_after_hours} onChange={(e) => setF({ ...f, escalate_after_hours: Number(e.target.value) })} /></label>
      </div>
      {goingLive && (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold">Switching to live sends real texts.</p>
          <p>Candidates who agreed to texts and hiring managers will start getting messages from the store's texting number, between the hours below. Make sure each store's texting number is set on the Stores page and Twilio is connected (see Integrations).</p>
          {(waiting.data?.waiting ?? 0) > 0 && (
            <label className="flex items-start gap-2"><Checkbox className="mt-0.5" checked={skipBacklog} onCheckedChange={(c) => setSkipBacklog(c === true)} />
              <span>Don't text managers about the {waiting.data?.waiting} candidate{waiting.data?.waiting === 1 ? "" : "s"} already in Screening. Only candidates who reach Screening from now on get a summary.</span></label>
          )}
          <label className="flex items-start gap-2 font-medium"><Checkbox className="mt-0.5" checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} />
            <span>I understand: turn on live texting.</span></label>
        </div>
      )}
      <fieldset><legend className="mb-2 text-sm font-medium">Texting days</legend><div className="flex flex-wrap gap-4">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => <label key={day} className="flex items-center gap-2 text-sm"><Checkbox checked={f.send_days.includes(i + 1)} onCheckedChange={(checked) => setF({ ...f, send_days: checked ? [...f.send_days, i + 1].sort() : f.send_days.filter((d) => d !== i + 1) })} />{day}</label>)}</div></fieldset>
      {canEdit && <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save texting settings"}</Button>}
    </fieldset>
  </form>;
}