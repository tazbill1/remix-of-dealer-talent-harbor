import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chunk, fetchAll } from "@/lib/fetch-all";
import {
  escalationEventRow,
  ESCALATING_STAGES,
  findStalled,
  type EscApp,
  type Touch,
} from "@/lib/escalation";

/** Release candidates nobody has touched for 3 business days to the group's open pool. */
export async function runEscalation(supabaseAdmin: SupabaseClient<Database>) {
  const now = Date.now();
  const apps = await fetchAll<EscApp & { org_id: string }>((f, t) =>
    supabaseAdmin
      .from("applications")
      .select("id, org_id, status, created_at, open_to_other_stores")
      .in("status", ESCALATING_STAGES)
      .eq("open_to_other_stores", false)
      .order("created_at")
      .range(f, t),
  );
  const touches: Touch[] = [];
  for (const ids of chunk(apps.map((a) => a.id))) {
    const [events, messages] = await Promise.all([
      fetchAll<Touch>((f, t) =>
        supabaseAdmin
          .from("application_events")
          .select("application_id, created_at, kind")
          .in("application_id", ids)
          .range(f, t),
      ),
      fetchAll<Touch>((f, t) =>
        // Bulk emails aren't a personal touch, so they don't stop the 3-day clock.
        supabaseAdmin
          .from("messages")
          .select("application_id, created_at")
          .in("application_id", ids)
          .is("campaign_id", null)
          // Texts that never went out (no consent, skipped at go-live) aren't a touch either.
          .neq("status", "blocked")
          .range(f, t),
      ),
    ]);
    touches.push(...events, ...messages);
  }

  const stalled = findStalled(apps, touches, now);
  const orgOf = new Map(apps.map((a) => [a.id, a.org_id]));
  let escalated = 0;
  for (const s of stalled) {
    const { data: updated, error } = await supabaseAdmin
      .from("applications")
      .update({ open_to_other_stores: true })
      .eq("id", s.id)
      .eq("open_to_other_stores", false)
      .in("status", ESCALATING_STAGES)
      .select("id");
    if (error || !updated?.length) continue;
    await supabaseAdmin
      .from("application_events")
      .insert(escalationEventRow(orgOf.get(s.id)!, s.id, s.idleBusinessDays));
    escalated++;
  }
  return { checked: apps.length, escalated, at: new Date(now).toISOString() };
}
