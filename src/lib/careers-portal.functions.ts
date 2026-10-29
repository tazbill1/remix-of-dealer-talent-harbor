import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CAREERS_ORG_SLUG } from "@/lib/site";
import { portalStage, isCurrent, suggestJobs } from "@/lib/applicant-portal";

async function careersOrg() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("organizations").select("id, name").eq("slug", CAREERS_ORG_SLUG).maybeSingle();
  return { admin: supabaseAdmin, org: data };
}

/** Public: careers video (link or signed URL for an uploaded file). */
export const getCareersVideo = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, org } = await careersOrg();
  if (!org) return null;
  const { data } = await admin.from("careers_settings").select("video_url, video_path").eq("org_id", org.id).maybeSingle();
  if (data?.video_url) return { kind: "link" as const, url: data.video_url };
  if (data?.video_path) {
    const { data: s } = await admin.storage.from("careers-videos").createSignedUrl(data.video_path, 60 * 60 * 6);
    if (s?.signedUrl) return { kind: "file" as const, url: s.signedUrl };
  }
  return null;
});

/** Public: newsletter signup. */
export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; website?: string }) => z.object({ email: z.string().trim().toLowerCase().email().max(255), website: z.string().max(0).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { admin, org } = await careersOrg();
    if (!org) throw new Error("Not available");
    const { error } = await admin.from("newsletter_subscribers").upsert(
      { org_id: org.id, email: data.email, consented_at: new Date().toISOString(), unsubscribed_at: null },
      { onConflict: "org_id,email" });
    if (error) throw new Error("Couldn't sign you up. Please try again.");
    return { ok: true };
  });

/** Signed-in applicant: their applications (sanitized), suggestions and newsletter status. */
export const getMyApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string }).email?.toLowerCase();
    const { admin, org } = await careersOrg();
    if (!org || !email) return { orgName: org?.name ?? "", email: email ?? "", current: [], past: [], suggested: [], subscribed: false };
    const [{ data: apps }, { data: open }, { data: sub }] = await Promise.all([
      admin.from("applications").select("id, status, created_at, job_id, jobs(id, title, department), dealerships!applications_dealership_id_fkey(name)")
        .eq("org_id", org.id).ilike("email", email).is("archived_at", null).is("merged_into_id", null).order("created_at", { ascending: false }),
      admin.from("jobs").select("id, title, department, dealership_id, dealerships(name)").eq("org_id", org.id).eq("status", "open"),
      admin.from("newsletter_subscribers").select("unsubscribed_at").eq("org_id", org.id).eq("email", email).maybeSingle(),
    ]);
    const rows = (apps ?? []).map((a) => {
      const job = a.jobs as { id: string; title: string; department: string | null } | null;
      return { id: a.id, appliedAt: a.created_at, jobTitle: job?.title ?? "Job", jobId: job?.id ?? a.job_id, department: job?.department ?? null,
        storeName: (a.dealerships as { name: string } | null)?.name ?? "", stage: portalStage(a.status), current: isCurrent(a.status) };
    });
    const suggested = suggestJobs(rows.map((r) => ({ id: r.jobId, title: r.jobTitle, department: r.department })),
      (open ?? []).map((j) => ({ id: j.id, title: j.title, department: j.department, storeName: (j.dealerships as { name: string } | null)?.name ?? "" })));
    return { orgName: org.name, email, current: rows.filter((r) => r.current), past: rows.filter((r) => !r.current), suggested, subscribed: !!sub && !sub.unsubscribed_at };
  });

export const setMyNewsletter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { on: boolean }) => z.object({ on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email?.toLowerCase();
    const { admin, org } = await careersOrg();
    if (!org || !email) throw new Error("Not available");
    const now = new Date().toISOString();
    const { error } = await admin.from("newsletter_subscribers").upsert(
      { org_id: org.id, email, user_id: context.userId, source: "applicant_account", consented_at: now, unsubscribed_at: data.on ? null : now },
      { onConflict: "org_id,email" });
    if (error) throw new Error("Couldn't save");
    return { ok: true };
  });
