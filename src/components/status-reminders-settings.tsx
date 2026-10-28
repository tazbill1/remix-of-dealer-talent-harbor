import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { STATUSES, STATUS_LABEL } from "@/lib/jobs";
import { NEVER_REMINDED, type ReminderRule } from "@/lib/status-reminders";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function useReminderRules(orgId: string) {
  return useQuery({
    queryKey: ["status-reminder-rules", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("status_reminder_rules")
        .select("id, status, remind_after_days, is_active").eq("org_id", orgId);
      if (error) throw error;
      return data as (ReminderRule & { id: string })[];
    },
  });
}

/** Per-stage reminder settings. HR / Recruiter and group admins edit; others see read-only. */
export function StatusRemindersSettings({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: rules = [] } = useReminderRules(orgId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  useEffect(() => setDrafts(Object.fromEntries(rules.map((r) => [r.status, String(r.remind_after_days)]))), [rules]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["status-reminder-rules", orgId] });

  async function save(status: string, patch: Partial<ReminderRule>) {
    const existing = rules.find((r) => r.status === status);
    const row = { org_id: orgId, status: status as never, remind_after_days: existing?.remind_after_days ?? 3, is_active: existing?.is_active ?? true, ...patch, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("status_reminder_rules").upsert(row, { onConflict: "org_id,status" }).select("id").maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Couldn't save. Please try again."); return; }
    toast.success("Reminder saved");
    await refresh();
  }

  function saveDays(status: string) {
    const n = Number(drafts[status]);
    const current = rules.find((r) => r.status === status)?.remind_after_days;
    if (!Number.isInteger(n) || n < 1 || n > 365) { toast.error("Use a whole number of days from 1 to 365."); return; }
    if (n !== current) void save(status, { remind_after_days: n });
  }

  async function runNow() {
    setRunning(true);
    const { data, error } = await supabase.rpc("run_status_reminders_now", { _org: orgId });
    setRunning(false);
    if (error) return toast.error(error.message);
    toast.success(data === 1 ? "1 applicant reminded." : `${data ?? 0} applicants reminded.`);
  }

  return (
    <section className="space-y-3 rounded-2xl bg-background p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl"><BellRing className="size-5 text-sapphire" />Status reminders</h2>
          <p className="text-sm text-muted-foreground">
            Once a day, store managers get a bell alert for applicants who have sat in a stage too long. No emails or texts.{" "}
            {canEdit ? "" : "Only Recruiting/HR and group admins can make changes."}
          </p>
        </div>
        {canEdit && <Button variant="outline" onClick={runNow} disabled={running}>{running ? "Checking…" : "Run check now"}</Button>}
      </div>
      <div className="divide-y rounded-xl border">
        {STATUSES.map((s) => {
          const never = NEVER_REMINDED.includes(s);
          const rule = rules.find((r) => r.status === s);
          return (
            <div key={s} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <StatusPill status={s} />
              {never ? <span className="text-muted-foreground">Never reminded</span> : (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-muted-foreground">
                    Remind after
                    <Input aria-label={`Days for ${STATUS_LABEL[s]}`} type="number" min={1} max={365} className="h-8 w-16" disabled={!canEdit}
                      value={drafts[s] ?? ""} placeholder="—" onChange={(e) => setDrafts((d) => ({ ...d, [s]: e.target.value }))}
                      onBlur={() => canEdit && drafts[s] && saveDays(s)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                    days
                  </label>
                  <Switch aria-label={`Reminders for ${STATUS_LABEL[s]}`} disabled={!canEdit} checked={!!rule?.is_active}
                    onCheckedChange={(c) => save(s, { is_active: c, remind_after_days: Number(drafts[s]) || rule?.remind_after_days || 3 })} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
