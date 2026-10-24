import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getCareers = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: org } = await sb.from("organizations").select("id, name, slug").eq("slug", data.slug).maybeSingle();
    if (!org) return null;
    const [{ data: stores }, { data: jobs }] = await Promise.all([
      sb.from("dealerships").select("id, name, brand, city, state").eq("org_id", org.id).order("name"),
      sb.from("jobs").select("id, title, department, employment_type, pay_min, pay_max, pay_period, dealership_id, created_at")
        .eq("org_id", org.id).eq("status", "open").order("created_at", { ascending: false }),
    ]);
    return { org, stores: stores ?? [], jobs: jobs ?? [] };
  });

export const getPublicJob = createServerFn({ method: "GET" })
  .inputValidator((d: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: job } = await sb.from("jobs").select("*").eq("id", data.jobId).eq("status", "open").maybeSingle();
    if (!job) return null;
    const [{ data: store }, { data: org }] = await Promise.all([
      sb.from("dealerships").select("id, name, brand, city, state, address, assistant_name").eq("id", job.dealership_id).maybeSingle(),
      sb.from("organizations").select("id, name, slug").eq("id", job.org_id).maybeSingle(),
    ]);
    return { job, store, org };
  });

const applySchema = z.object({
  jobId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  source: z.string().trim().max(40).optional(),
  resumeFileName: z.string().max(200).optional(),
});

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator((d: z.input<typeof applySchema>) => applySchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin.from("jobs").select("id, org_id, dealership_id, status").eq("id", data.jobId).maybeSingle();
    if (!job || job.status !== "open") throw new Error("This job is no longer accepting applications.");
    const { data: app, error } = await supabaseAdmin.from("applications").insert({
      org_id: job.org_id, job_id: job.id, dealership_id: job.dealership_id,
      full_name: data.fullName, email: data.email.toLowerCase(), phone: data.phone || null,
      source: (data.source || "careers").toLowerCase(),
    }).select("id, status_token").single();
    if (error) throw new Error("We couldn't save your application. Please try again.");
    await supabaseAdmin.from("application_events").insert({
      org_id: job.org_id, application_id: app.id, kind: "applied", message: "Application received",
    });
    let uploadUrl: string | null = null;
    let uploadToken: string | null = null;
    let resumePath: string | null = null;
    if (data.resumeFileName) {
      const ext = data.resumeFileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
      resumePath = `${job.org_id}/${app.id}/resume.${ext}`;
      const { data: signed } = await supabaseAdmin.storage.from("resumes").createSignedUploadUrl(resumePath);
      uploadUrl = signed?.signedUrl ?? null;
      uploadToken = signed?.token ?? null;
      await supabaseAdmin.from("applications").update({ resume_path: resumePath }).eq("id", app.id);
    }
    return { token: app.status_token, resumePath, uploadToken };
  });

export const getApplicationStatus = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app } = await supabaseAdmin.from("applications")
      .select("id, full_name, status, created_at, updated_at, job_id, dealership_id")
      .eq("status_token", data.token).maybeSingle();
    if (!app) return null;
    const [{ data: job }, { data: store }, { data: events }] = await Promise.all([
      supabaseAdmin.from("jobs").select("title").eq("id", app.job_id).maybeSingle(),
      supabaseAdmin.from("dealerships").select("name, assistant_name").eq("id", app.dealership_id).maybeSingle(),
      supabaseAdmin.from("application_events").select("kind, message, created_at").eq("application_id", app.id).order("created_at"),
    ]);
    return {
      firstName: app.full_name.split(" ")[0],
      status: app.status,
      appliedAt: app.created_at,
      updatedAt: app.updated_at,
      jobTitle: job?.title ?? "",
      storeName: store?.name ?? "",
      assistantName: store?.assistant_name ?? "Penny",
      events: (events ?? []).map((e) => ({ kind: e.kind, message: e.message, at: e.created_at })),
    };
  });
