import { createFileRoute } from "@tanstack/react-router";
import { buildIcs } from "@/lib/calendar-feed";

export const Route = createFileRoute("/api/public/interview-invite/$token")({
  server: { handlers: { GET: async ({ params }) => {
    const { readInterviewInviteToken } = await import("@/lib/interview-invite-token.server");
    const signed = readInterviewInviteToken(params.token);
    if (!signed) return new Response("Not found", { status: 404 });
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: member } = await db.from("org_members").select("id, org_id").eq("id", signed.memberId).maybeSingle();
    if (!member) return new Response("Not found", { status: 404 });
    const { data: iv } = await db.from("interviews").select("*").eq("id", signed.interviewId).eq("org_id", member.org_id).maybeSingle();
    if (!iv) return new Response("Not found", { status: 404 });
    const { data: app } = await db.from("applications").select("full_name, job_id, dealership_id").eq("id", iv.application_id).eq("org_id", member.org_id).maybeSingle();
    if (!app) return new Response("Not found", { status: 404 });
    const { storeInterviewers } = await import("@/lib/member-calendars.functions");
    const people = await storeInterviewers(db, member.org_id, app.dealership_id);
    if (!people.some(p => p.id === member.id)) return new Response("Not found", { status: 404 });
    const [{ data: store }, { data: job }] = await Promise.all([
      db.from("dealerships").select("name, address, city, state").eq("id", app.dealership_id).eq("org_id", member.org_id).maybeSingle(),
      db.from("jobs").select("title").eq("id", app.job_id).eq("org_id", member.org_id).maybeSingle(),
    ]);
    const body = buildIcs("hireme interview", [{ id: iv.id, startsAt: iv.starts_at, durationMin: iv.duration_min, status: iv.status, title: `Interview: ${app.full_name} · ${job?.title ?? ""}`, location: iv.location || [store?.name, store?.address, store?.city, store?.state].filter(Boolean).join(", "), description: "hireme by WerkandMe" }]);
    return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="interview.ics"', "cache-control": "private, no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" } });
  } } },
});