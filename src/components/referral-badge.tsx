import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { referralBadge } from "@/lib/referrals";
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
export function ReferralPanelRow({ app, orgId, isHr, onLink }: { app: RefFields; orgId: string; isHr: boolean; onLink: (referrerId: string) => Promise<boolean> }) {
  const { data: refs = [] } = useReferrerNames(orgId);
  const names = new Map(refs.map((r) => [r.id, r.employee_name]));
  const [pick, setPick] = useState("");
  const b = referralBadge(app, names);
  if (!b) return null;
  return (
    <div className="rounded-xl border p-3 text-sm">
      <div className="text-xs text-muted-foreground">Employee referral</div>
      <ReferralBadge app={app} names={names} />
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
