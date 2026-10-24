import { createFileRoute } from "@tanstack/react-router";
import { escapeXml } from "@/lib/jobs";

// Indeed-format XML job feed (also read by ZipRecruiter, Glassdoor and others). Public, read-only.
export const Route = createFileRoute("/api/public/feed/$orgSlug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const slug = params.orgSlug.replace(/[^a-z0-9-]/g, "").slice(0, 40);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: org } = await supabaseAdmin.from("organizations").select("id, name, slug").eq("slug", slug).eq("status", "active").maybeSingle();
        if (!org) return new Response("Not found", { status: 404 });
        const [{ data: jobs }, { data: stores }] = await Promise.all([
          supabaseAdmin.from("jobs").select("id, title, description, employment_type, pay_min, pay_max, pay_period, dealership_id, created_at")
            .eq("org_id", org.id).eq("status", "open"),
          supabaseAdmin.from("dealerships").select("id, name, city, state").eq("org_id", org.id),
        ]);
        const origin = new URL(request.url).origin;
        const x = (s: unknown) => `<![CDATA[${String(s ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
        const items = (jobs ?? []).map((j) => {
          const st = stores?.find((s) => s.id === j.dealership_id);
          const salary = j.pay_min ? `$${j.pay_min}${j.pay_max ? ` - $${j.pay_max}` : ""} per ${j.pay_period === "HOUR" ? "hour" : "year"}` : "";
          return `<job><title>${x(j.title)}</title><date>${x(new Date(j.created_at).toUTCString())}</date><referencenumber>${x(j.id)}</referencenumber>` +
            `<url>${x(`${origin}/c/${org.slug}/jobs/${j.id}?source=indeed`)}</url><company>${x(st?.name ?? org.name)}</company>` +
            `<city>${x(st?.city)}</city><state>${x(st?.state)}</state><country>${x("US")}</country>` +
            `<description>${x(j.description)}</description><salary>${x(salary)}</salary><jobtype>${x(j.employment_type.replace("_", " ").toLowerCase())}</jobtype></job>`;
        }).join("");
        const xml = `<?xml version="1.0" encoding="utf-8"?><source><publisher>${escapeXml(org.name)}</publisher><publisherurl>${escapeXml(`${origin}/c/${org.slug}`)}</publisherurl><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}</source>`;
        return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
      },
    },
  },
});
