import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { TierSettings, ProgramRules } from "@/components/referral-program";

export function ReferralBonusesSettings() {
  const org = useOrg();
  const canEdit = canPostJobs(org.role, org.isPlatformAdmin);
  const qc = useQueryClient();
  const key = ["referral-bonus-settings", org.orgId];
  const { data, error } = useQuery({ queryKey: key, enabled: canEdit, queryFn: async () => {
    const [tiers, settings] = await Promise.all([
      supabase.from("referral_tiers").select("*").eq("org_id", org.orgId).order("sort_order"),
      supabase.from("referral_settings").select("*").eq("org_id", org.orgId).maybeSingle(),
    ]);
    if (tiers.error || settings.error || !settings.data) throw new Error("Could not load referral bonus settings.");
    return { tiers: tiers.data ?? [], settings: settings.data };
  } });
  if (!canEdit) return null;
  if (error) return <p role="alert">Could not load referral bonus settings.</p>;
  if (!data) return <p className="text-muted-foreground">Loading...</p>;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["jobs", org.orgId] });
    qc.invalidateQueries({ queryKey: ["referrals", org.orgId] });
    qc.invalidateQueries({ queryKey: ["applicant-referral-bonus", org.orgId] });
  };
  return <div className="space-y-3">
    <h2 className="text-xl">Bonus tiers</h2>
    <TierSettings key={JSON.stringify(data.tiers)} orgId={org.orgId} tiers={data.tiers} canEdit={canEdit} onSaved={refresh} />
    <h2 className="text-xl">Program rules</h2>
    <ProgramRules key={JSON.stringify(data.settings)} orgId={org.orgId} initial={data.settings} canEdit={canEdit} onSaved={refresh} />
  </div>;
}