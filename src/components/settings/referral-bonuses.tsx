import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { TierSettings, ProgramRules } from "@/components/referral-program";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

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
    <label className="flex items-center gap-3 py-2 text-sm"><Switch aria-label="Employee self-signup" checked={data.settings.self_signup_enabled} onCheckedChange={async enabled=>{
      const {data:saved,error}=await supabase.from("referral_settings").update({self_signup_enabled:enabled}).eq("org_id",org.orgId).select("org_id").maybeSingle();
      if(error||!saved)return toast.error("Couldn't change employee signup.");toast.success(enabled?"Employee signup enabled":"Employee signup disabled");refresh();
    }}/>Employee self-signup</label>
    <h2 className="text-xl">Bonus tiers</h2>
    <TierSettings key={JSON.stringify(data.tiers)} orgId={org.orgId} tiers={data.tiers} canEdit={canEdit} onSaved={refresh} />
    <h2 className="text-xl">Program rules</h2>
    <ProgramRules key={JSON.stringify(data.settings)} orgId={org.orgId} initial={data.settings} canEdit={canEdit} onSaved={refresh} />
  </div>;
}