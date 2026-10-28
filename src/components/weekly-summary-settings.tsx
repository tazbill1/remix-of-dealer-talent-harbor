import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { useOrg } from "@/lib/org";
import { previewWeeklySummary } from "@/lib/weekly-summary.functions";
import { Button } from "@/components/ui/button";
import type { Automations } from "@/lib/automations";
import { WEEKDAYS, weeklySummarySettings } from "@/lib/weekly-summary";
import { Switch } from "@/components/ui/switch";

const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;

/** On/off, day and time for the weekly HR summary email (saved with the automatic texts). */
export function WeeklySummaryCard({
  a,
  canEdit,
  onChange,
}: {
  a: Automations;
  canEdit: boolean;
  onChange: (a: Automations) => void;
}) {
  const s = weeklySummarySettings(a);
  const org = useOrg();
  const preview = useServerFn(previewWeeklySummary);
  const [sending, setSending] = useState(false);
  async function onPreview() {
    setSending(true);
    try {
      const r = await preview({ data: { orgId: org.orgId } });
      if (r.status === "sent") toast.success(`Preview sent to ${r.to}`);
      else if (r.status === "simulated")
        toast.info(`Email is in practice mode, so the preview to ${r.to} was only simulated.`);
      else toast.error(r.error ?? "The preview couldn't be sent.");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSending(false);
  }
  const set = (p: Partial<NonNullable<Automations["weeklySummary"]>>) =>
    onChange({ ...a, weeklySummary: { ...a.weeklySummary, ...p } });

  return (
    <section className="space-y-3">
      <h2 className="text-lg">Weekly summary</h2>
      <div className="space-y-3 rounded-2xl bg-background p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Mail className="size-4 text-sapphire" />
              Weekly HR summary email
            </div>
            <p className="text-sm text-muted-foreground">
              One email to each person on the team, store by store, covering only the stores they
              can see: new applicants, who's waiting on a decision, interviews, offers, hires and
              new-hire check-ins. It goes to the email they sign in with.
            </p>
          </div>
          <Switch
            checked={s.enabled}
            disabled={!canEdit}
            onCheckedChange={(v) => set({ enabled: v })}
            aria-label="Weekly HR summary on or off"
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Day</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              disabled={!canEdit}
              value={s.day}
              onChange={(e) => set({ day: Number(e.target.value) })}
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">
              Time (each person's first store's time zone)
            </span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              disabled={!canEdit}
              value={s.hour}
              onChange={(e) => set({ hour: Number(e.target.value) })}
            >
              {Array.from({ length: 16 }, (_, i) => i + 5).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" disabled={sending} onClick={onPreview}>
              {sending ? "Sending…" : "Send me a preview now"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Emails you this week's summary for your stores. Works even while the summary is off.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
