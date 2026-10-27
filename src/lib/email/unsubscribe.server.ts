import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Record an email unsubscribe for the whole dealer group (admin client only). */
export async function applyEmailOptOut(
  admin: SupabaseClient<Database>,
  orgId: string,
  email: string,
  source: string,
) {
  const now = new Date().toISOString();
  await admin
    .from("email_opt_outs")
    .upsert({ org_id: orgId, email, source, opted_out_at: now }, { onConflict: "org_id,email" });
  await admin
    .from("candidates")
    .update({ email_opted_out_at: now })
    .eq("org_id", orgId)
    .eq("email", email);
}
