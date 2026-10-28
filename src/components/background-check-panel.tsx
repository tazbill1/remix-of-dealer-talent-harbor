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
  const steps = ["Requested", "In progress", current === "clear" ? "Cleared" : current === "flagged" ? "Flagged" : "Complete"];
  const stepIndex = current === "requested" ? 0 : current === "in_progress" ? 1 : current ? 2 : -1;
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4" />Background check</div>
        {current
          ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", BG_TONE[current])}>{BG_LABEL[current]}</span>
          : <span className="text-xs text-muted-foreground">Not started</span>}
      </div>
      <ol className="flex items-center py-1 text-[11px]">
        {steps.map((label, i) => (
          <li key={label} className="flex min-w-0 flex-1 items-center last:flex-none">
            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px]",
              i <= stepIndex ? "border-sapphire bg-sapphire text-primary-foreground" : "border-border text-muted-foreground")}>{i + 1}</span>
            <span className={cn("ml-1 whitespace-nowrap", i === stepIndex ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < steps.length - 1 && <span className={cn("mx-1.5 h-px min-w-2 flex-1", i < stepIndex ? "bg-sapphire" : "bg-border")} />}
          </li>
        ))}
      </ol>
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
