import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { useBulkSettings } from "@/components/bulk-message-compose";
import { Switch } from "@/components/ui/switch";

export function BulkMessagingSetting() {
  const org = useOrg();
  const qc = useQueryClient();
  const { data, isPending, error } = useBulkSettings(org.orgId);
  const [busy, setBusy] = useState(false);
  if (!canPostJobs(org.role, org.isPlatformAdmin)) return null;
  async function save(enabled: boolean) {
    setBusy(true);
    const result = await supabase.from("messaging_settings").update({ bulk_messaging_enabled: enabled }).eq("org_id", org.orgId).select("bulk_messaging_enabled").single();
    setBusy(false);
    if (result.error || result.data?.bulk_messaging_enabled !== enabled) return toast.error("Could not save bulk messaging setting.");
    await qc.invalidateQueries({ queryKey: ["bulk-settings", org.orgId] });
    toast.success("Saved");
  }
  return <div className="flex items-center justify-between gap-4 border-b pb-4">
    <label htmlFor="bulk-messaging-enabled" className="font-semibold">Bulk messaging</label>
    {error && <span className="text-sm text-destructive">Could not load setting</span>}
    <Switch id="bulk-messaging-enabled" checked={data?.bulk_messaging_enabled ?? false} disabled={isPending || busy || !!error || !data} onCheckedChange={save} />
  </div>;
}