import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BG_EVENT_KIND, BG_LABEL, BG_STATUSES, BG_TONE, bgEventMessage, bgPatch, bgStatusOf, type BgStatus } from "@/lib/background-check";

/** Background-check status on the profile. Recruiting/HR can change it; everyone else sees it. */
export function BackgroundCheckPanel({ orgId, appId, status, note, updatedAt, canEdit, onChanged }: {
  orgId: string; appId: string; status: string | null; note: string | null; updatedAt: string | null;
  canEdit: boolean; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const current = bgStatusOf(status);
  const [draft, setDraft] = useState(note ?? "");
  const [saving, setSaving] = useState(false);

  async function save(next: BgStatus | null, nextNote: string | null) {
    const patch = bgPatch({ status: current, note }, { status: next, note: nextNote });
    if (!patch) return;
    setSaving(true);
    const { error } = await supabase.from("applications").update(patch).eq("id", appId);
    if (error) { setSaving(false); return toast.error(error.message); }
    await supabase.from("application_events").insert({ org_id: orgId, application_id: appId, kind: BG_EVENT_KIND,
      message: bgEventMessage(patch.background_check_status, patch.background_check_note) });
    setSaving(false);
    if (!next) setDraft("");
    qc.invalidateQueries({ queryKey: ["events", appId] });
    onChanged();
  }

  if (!canEdit && !current) return null;
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4" />Background check</div>
        {current
          ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", BG_TONE[current])}>{BG_LABEL[current]}</span>
          : <span className="text-xs text-muted-foreground">Not started</span>}
      </div>
      {canEdit ? (
        <>
          <div className="flex flex-wrap gap-2">
            {BG_STATUSES.map((s) => (
              <button key={s} disabled={saving} onClick={() => save(s, draft)}
                className={cn("rounded-full border px-3 py-1 text-xs", current === s ? "border-sapphire bg-sapphire text-primary-foreground" : "hover:border-sapphire")}>
                {BG_LABEL[s]}</button>
            ))}
            {current && <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={saving} onClick={() => save(null, null)}>Remove</Button>}
          </div>
          {current && (
            <Input placeholder="Note (optional, e.g. ordered through vendor, ref #)" value={draft} disabled={saving}
              onChange={(e) => setDraft(e.target.value)} onBlur={() => save(current, draft)} />
          )}
        </>
      ) : note && <p className="text-sm">{note}</p>}
      {current && updatedAt && <p className="text-xs text-muted-foreground">Updated {new Date(updatedAt).toLocaleString()}</p>}
    </div>
  );
}

/** Small pill for the pipeline card; nothing when no check has started. */
export function BackgroundCheckBadge({ status }: { status: string | null }) {
  const bg = bgStatusOf(status);
  if (!bg) return null;
  return <span className={cn("mr-1 mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium", BG_TONE[bg])}>Check: {BG_LABEL[bg]}</span>;
}
