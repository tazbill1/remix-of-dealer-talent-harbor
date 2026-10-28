import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Small tag in the applicant panel when an open possible-duplicate match involves this applicant. */
export function PossibleDuplicateTag({ appId }: { appId: string }) {
  const { data } = useQuery({
    queryKey: ["possible-dup", appId],
    queryFn: async () => (await supabase.from("possible_duplicates").select("id").eq("status", "open")
      .or(`and(record_a_type.eq.application,record_a_id.eq.${appId}),and(record_b_type.eq.application,record_b_id.eq.${appId})`).limit(1)).data?.[0] ?? null,
  });
  if (!data) return null;
  return (
    <Link to="/duplicates" search={{ match: data.id }}
      className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground hover:underline">
      <Copy className="size-3" />Possible duplicate
    </Link>
  );
}
