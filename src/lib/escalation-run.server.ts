import type { SupabaseClient } from "@supabase/supabase-js";
import { chunk, fetchAll } from "@/lib/fetch-all";
import {
  escalationEventRow,
  ESCALATING_STAGES,
  findStalled,
  type EscApp,
  type Touch,
} from "@/lib/escalation";

/** Same logic as /api/cron/escalate: pool candidates untouched for 3 business days. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runEscalation(supabaseAdmin: SupabaseClient<any>) {
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
        supabaseAdmin
          .from("messages")
          .select("application_id, created_at")
          .in("application_id", ids)
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
