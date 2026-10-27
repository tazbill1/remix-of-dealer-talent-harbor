import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { defaultMessagingSettings, messagingSettingsSchema, type MessagingSettings } from "@/lib/messaging-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function TextingSettings({ orgId }: { orgId: string }) {
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
  return <TextingForm key={`${orgId}-${query.dataUpdatedAt}`} orgId={orgId} initial={query.data} />;
}

function TextingForm({ orgId, initial }: { orgId: string; initial: MessagingSettings }) {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = messagingSettingsSchema.safeParse(f);
    if (!parsed.success) return toast.error("Check your texting settings.");
    setSaving(true);
    const { error } = await supabase.from("messaging_settings").upsert({ org_id: orgId, ...parsed.data, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Texting settings saved");
    qc.invalidateQueries({ queryKey: ["messaging-settings", orgId] });
  }
  return <section className="border-t pt-6">
    <h2 className="text-xl">Texting</h2>
    <form onSubmit={save} className="mt-4 max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5"><Label asChild><span>Mode</span></Label><select aria-label="Texting mode" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value === "live" ? "live" : "practice" })}><option value="practice">Practice</option><option value="live">Live</option></select></label>
        <label className="space-y-1.5"><Label asChild><span>AI provider</span></Label><select aria-label="AI provider" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.ai_provider} onChange={(e) => setF({ ...f, ai_provider: e.target.value === "anthropic" ? "anthropic" : "lovable" })}><option value="lovable">Lovable</option><option value="anthropic">Anthropic</option></select></label>
        <label className="space-y-1.5">Texting starts<Input aria-label="Texting starts" type="time" required value={f.send_start.slice(0, 5)} onChange={(e) => setF({ ...f, send_start: e.target.value })} /></label>
        <label className="space-y-1.5">Texting ends<Input aria-label="Texting ends" type="time" required value={f.send_end.slice(0, 5)} onChange={(e) => setF({ ...f, send_end: e.target.value })} /></label>
        <label className="space-y-1.5">Nudge after (hours)<Input aria-label="Nudge after (hours)" type="number" step="1" required value={f.nudge_after_hours} onChange={(e) => setF({ ...f, nudge_after_hours: Number(e.target.value) })} /></label>
        <label className="space-y-1.5">Escalate after (hours)<Input aria-label="Escalate after (hours)" type="number" step="1" required value={f.escalate_after_hours} onChange={(e) => setF({ ...f, escalate_after_hours: Number(e.target.value) })} /></label>
      </div>
      <fieldset><legend className="mb-2 text-sm font-medium">Texting days</legend><div className="flex flex-wrap gap-4">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => <label key={day} className="flex items-center gap-2 text-sm"><Checkbox checked={f.send_days.includes(i + 1)} onCheckedChange={(checked) => setF({ ...f, send_days: checked ? [...f.send_days, i + 1].sort() : f.send_days.filter((d) => d !== i + 1) })} />{day}</label>)}</div></fieldset>
      <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save texting settings"}</Button>
    </form>
  </section>;
}