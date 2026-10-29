import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { referralBadge } from "@/lib/referrals";
import { referralBonusDisplay } from "@/lib/referral-bonus-display";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RefFields = { referrer_id: string | null; referred_by_text: string | null };

/** Referrer names the signed-in user may see (RLS: HR all, store staff their stores). */
export function useReferrerNames(orgId: string) {
  return useQuery({
    queryKey: ["referrer-names", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("referrers").select("id, employee_name, active").eq("org_id", orgId).order("employee_name");
      return data ?? [];
    },
  });
}

export function ReferralBadge({ app, names, className }: { app: RefFields; names: Map<string, string>; className?: string }) {
  const b = referralBadge(app, names);
  if (!b) return null;
  return (
    <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
      b.linked ? "bg-lime/30 text-foreground" : "bg-accent text-muted-foreground", className)}
      title={b.linked ? b.label : `${b.label} (not linked to an employee yet)`}>
      <UserPlus className="size-3" />{b.label}
    </span>
  );
}

/** Panel row: the badge, plus a picker for HR to link a typed name to an employee. */
export function ReferralPanelRow({ app, orgId, isHr, onLink }: { app: RefFields & { id: string; status: string; hired_at: string | null; start_date: string | null }; orgId: string; isHr: boolean; onLink: (referrerId: string) => Promise<boolean> }) {
  const { data: refs = [] } = useReferrerNames(orgId);
  const names = new Map(refs.map((r) => [r.id, r.employee_name]));
  const [pick, setPick] = useState("");
  const b = referralBadge(app, names);
  const { data } = useQuery({ queryKey: ["applicant-referral-bonus", orgId, app.id, app.hired_at], enabled: !!b, queryFn: async () => {
    const [application, tiers, settings, bonus] = await Promise.all([
      supabase.from("applications").select("jobs!applications_job_id_fkey(title,referral_tier_id)").eq("org_id", orgId).eq("id", app.id).maybeSingle(),
      supabase.from("referral_tiers").select("*").eq("org_id", orgId).order("sort_order"),
      supabase.from("referral_settings").select("payout_days").eq("org_id", orgId).maybeSingle(),
      supabase.from("referral_bonuses").select("amount,due_date,status,ineligible_reason").eq("org_id", orgId).eq("applicant_id", app.id).order("created_at").limit(1).maybeSingle(),
    ]);
    if (application.error || tiers.error || settings.error || bonus.error) throw new Error("Could not load referral bonus.");
    const job = application.data?.jobs;
    return referralBonusDisplay({ referred: true, hired: app.status === "hired" || !!app.hired_at, hiredDate: app.hired_at, startDate: app.start_date,
      tierId: job?.referral_tier_id ?? null, jobTitle: job?.title ?? "", tiers: tiers.data ?? [], payoutDays: settings.data?.payout_days ?? null, saved: bonus.data });
  } });
  if (!b) return null;
  return (
    <div className="rounded-xl border p-3 text-sm">
      <div className="text-xs text-muted-foreground">Employee referral</div>
      <ReferralBadge app={app} names={names} />
      {data && <p className="mt-1 text-xs text-muted-foreground">{b.label} · {data.note ?? (data.amount !== null ? `$${Number(data.amount).toLocaleString()} bonus${data.days !== null ? ` at ${data.days} days` : ""}` : "Bonus amount not recorded")}</p>}
      {!b.linked && isHr && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="Link to employee" className="h-8 rounded-md border bg-background px-2 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Link to an employee…</option>
            {refs.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.employee_name}</option>)}
          </select>
          <Button size="sm" disabled={!pick} onClick={async () => { if (await onLink(pick)) setPick(""); }}>Link</Button>
        </div>
      )}
    </div>
  );
}
