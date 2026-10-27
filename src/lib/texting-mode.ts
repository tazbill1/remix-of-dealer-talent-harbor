import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Whether a dealer group's texting and email are in practice or live mode. */
export function useMessagingMode(orgId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["messaging-mode", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("messaging_settings")
        .select("mode, email_mode")
        .eq("org_id", orgId!)
        .maybeSingle();
      return { textLive: data?.mode === "live", emailLive: data?.email_mode === "live" };
    },
  });
  return data ?? { textLive: false, emailLive: false };
}
