import { createFileRoute } from "@tanstack/react-router";
import { buildIcs, visibleStoreIds, type FeedEvent } from "@/lib/calendar-feed";

/**
 * A team member's interview calendar (.ics), subscribed to from Outlook or Google.
 * Shows interviews at the stores they can see, from 30 days back onward.
 */
export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { readCalendarToken } = await import("@/lib/calendar-feed.server");
        const memberId = await readCalendarToken(params.token);
        if (!memberId) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: member } = await supabaseAdmin
          .from("org_members")
          .select("id, org_id, role")
          .eq("id", memberId)
          .maybeSingle();
        if (!member) return new Response("Not found", { status: 404 });

        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        const [{ data: org }, { data: scopes }, { data: stores }, { data: interviews }] = await Promise.all([
          supabaseAdmin.from("organizations").select("name").eq("id", member.org_id).maybeSingle(),
          supabaseAdmin.from("org_member_scopes").select("dealership_id, region_id").eq("member_id", member.id),
          supabaseAdmin.from("dealerships").select("id, name, address, city, state, region_id").eq("org_id", member.org_id),
          supabaseAdmin
            .from("interviews")
            .select("id, application_id, starts_at, duration_min, location, status")
            .eq("org_id", member.org_id)
            .gte("starts_at", since)
            .order("starts_at")
            .limit(1000),
        ]);
        const allowed = visibleStoreIds(member.role, scopes ?? [], stores ?? []);
        const appIds = [...new Set((interviews ?? []).map((i) => i.application_id))];
        const { data: apps } = appIds.length
          ? await supabaseAdmin.from("applications").select("id, full_name, dealership_id, job_id").in("id", appIds)
          : { data: [] };
        const jobIds = [...new Set((apps ?? []).map((a) => a.job_id).filter(Boolean))] as string[];
        const { data: jobs } = jobIds.length
          ? await supabaseAdmin.from("jobs").select("id, title").in("id", jobIds)
          : { data: [] };

        const { appBaseUrl } = await import("@/lib/email/provider.server");
        const base = appBaseUrl(request);
        const events: FeedEvent[] = [];
        for (const i of interviews ?? []) {
          const app = apps?.find((a) => a.id === i.application_id);
          if (!app || !allowed.has(app.dealership_id)) continue;
          const store = stores?.find((s) => s.id === app.dealership_id);
          const job = jobs?.find((j) => j.id === app.job_id);
          const where = [store?.name, store?.address, [store?.city, store?.state].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(", ");
          events.push({
            id: i.id,
            startsAt: i.starts_at,
            durationMin: i.duration_min,
            status: i.status,
            title: `Interview: ${app.full_name}${job ? ` · ${job.title}` : ""}`,
            location: i.location || where,
            description: `${app.full_name}${job ? `, ${job.title}` : ""}${store ? ` at ${store.name}` : ""}.\nOpen in hireme: ${base}/calendar`,
          });
        }
        const body = buildIcs(`hireme interviews · ${org?.name ?? "WerkandMe"}`, events);
        return new Response(body, {
          headers: {
            "content-type": "text/calendar; charset=utf-8",
            "content-disposition": 'inline; filename="hireme-interviews.ics"',
            "cache-control": "private, max-age=300",
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
