import { supabase } from "@/integrations/supabase/client";
import type { AApp, AEvent, AJob, AMessage, ARegion, AStore } from "@/lib/analytics";
import { fetchAll } from "@/lib/fetch-all";
import { isTestName } from "@/lib/display";
import { STATUS_EVENT_KIND } from "@/lib/status-log";

/** Everything computeAnalytics needs for one group. Shared by Analytics and the Dashboard. */
export async function loadAnalyticsInputs(orgId: string) {
  const [apps, jobs, stores, regions, events, messages] = await Promise.all([
    fetchAll<AApp>((f, t) =>
      supabase
        .from("applications")
        .select(
          "id, job_id, dealership_id, status, source:source_channel, full_name, created_at, updated_at, hired_at, start_date, departed_at",
        )
        .eq("org_id", orgId)
        .order("created_at")
        .range(f, t),
    ),
    fetchAll<AJob>((f, t) =>
      supabase
        .from("jobs")
        .select(
          "id, title, dealership_id, status, division, department, hiring_manager, created_at",
        )
        .eq("org_id", orgId)
        .order("created_at")
        .range(f, t),
    ),
    fetchAll<AStore>((f, t) =>
      supabase
        .from("dealerships")
        .select("id, name, region_id, brand")
        .eq("org_id", orgId)
        .order("name")
        .range(f, t),
    ),
    fetchAll<ARegion>((f, t) =>
      supabase.from("regions").select("id, name").eq("org_id", orgId).order("name").range(f, t),
    ),
    fetchAll<AEvent>((f, t) =>
      supabase
        .from("application_events")
        .select("application_id, kind, message, created_at")
        .eq("org_id", orgId)
        .eq("kind", STATUS_EVENT_KIND)
        .order("created_at")
        .range(f, t),
    ),
    fetchAll<AMessage>((f, t) =>
      supabase
        .from("messages")
        .select("application_id, party, direction, created_at")
        .eq("org_id", orgId)
        .eq("party", "manager")
        .order("created_at")
        .range(f, t),
    ),
  ]);
  return {
    apps: apps.filter((x) => !isTestName(x.full_name)),
    jobs,
    stores,
    regions,
    events,
    messages,
  };
}
