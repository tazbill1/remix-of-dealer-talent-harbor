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
    // Only public columns: hiring-manager phones and question rules stay private.
    const { data: job } = await sb
      .from("jobs")
      .select("id, org_id, dealership_id, title, department, description, division, employment_type, pay_min, pay_max, pay_period, status, created_at")
      .eq("id", data.jobId).eq("status", "open").maybeSingle();
    if (!job) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseQuestions, toPublic } = await import("@/lib/questions");
    const { data: q } = await supabaseAdmin.from("jobs").select("questions").eq("id", job.id).maybeSingle();
    const questions = toPublic(parseQuestions(q?.questions));
    const [{ data: store }, { data: org }] = await Promise.all([
      sb.from("dealerships").select("id, name, brand, city, state, address, assistant_name").eq("id", job.dealership_id).maybeSingle(),
      sb.from("organizations").select("id, name, slug").eq("id", job.org_id).maybeSingle(),
    ]);
    return { job, store, org, questions };
  });

const applySchema = z.object({
  jobId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  linkedinUrl: z.string().trim().max(300).optional().or(z.literal("")),
  source: z.string().trim().max(40).optional(),
  sourceDetail: z.string().trim().max(120).optional(),
  resumeFileName: z.string().max(200).optional(),
  smsConsent: z.boolean().optional(),
  answers: z.record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
  ref: z.string().trim().max(20).optional(),
  refVia: z.enum(["link", "qr"]).optional(),
  referredBy: z.string().trim().max(120).optional(),
});

/** Public referral lookup: name only, active referrers in this group. */
export const getReferrer = createServerFn({ method: "GET" })
  .inputValidator((d: { orgId: string; code: string }) => z.object({ orgId: z.string().uuid(), code: z.string().max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { cleanCode } = await import("@/lib/referrals");
    const code = cleanCode(data.code);
    if (!code) return null;
    const { data: rows } = await publicClient().rpc("referrer_by_code", { _org: data.orgId, _code: code });
    const r = rows?.[0];
    return r ? { name: r.employee_name } : null;
  });

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator((d: z.input<typeof applySchema>) => applySchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin.from("jobs").select("id, org_id, dealership_id, status, questions").eq("id", data.jobId).maybeSingle();
    if (!job || job.status !== "open") throw new Error("This job is no longer accepting applications.");
    // Screening questions: check the answers, and flag (never reject) unmet requirements.
    const { cleanAnswers, parseQuestions, unmet } = await import("@/lib/questions");
    const questions = parseQuestions(job.questions);
    const answers = cleanAnswers(questions, data.answers);
    const knockoutFailed = unmet(questions, answers).length > 0;
    const email = data.email.toLowerCase();
    const phone = data.phone || null;
    // Find an existing candidate in this group by email, then by phone, or create one.
    // Separate .eq() lookups keep user input out of a hand-built filter string.
    let candidateId: string | null = null;
    const byEmail = await supabaseAdmin.from("candidates").select("id, sms_opt_in")
      .eq("org_id", job.org_id).eq("email", email).limit(1);
    let existing = byEmail.data?.[0];
    if (!existing && phone) {
      const byPhone = await supabaseAdmin.from("candidates").select("id, sms_opt_in")
        .eq("org_id", job.org_id).eq("phone", phone).limit(1);
      existing = byPhone.data?.[0];
    }
    if (existing) {
      candidateId = existing.id;
      if (data.smsConsent && !existing.sms_opt_in) {
        await supabaseAdmin.from("candidates").update({
          sms_opt_in: true, sms_opt_in_at: new Date().toISOString(), sms_opted_out_at: null, consent_source: "apply_form",
        }).eq("id", candidateId);
      }
    } else {
      const { data: created } = await supabaseAdmin.from("candidates").insert({
        org_id: job.org_id, full_name: data.fullName, email, phone,
        sms_opt_in: !!data.smsConsent,
        sms_opt_in_at: data.smsConsent ? new Date().toISOString() : null,
        consent_source: data.smsConsent ? "apply_form" : null,
      }).select("id").single();
      candidateId = created?.id ?? null;
    }
    const { normalizeLinkedInUrl } = await import("@/lib/linkedin");
    const linkedinUrl = normalizeLinkedInUrl(data.linkedinUrl);
    if (data.linkedinUrl?.trim() && !linkedinUrl) throw new Error("Please paste your LinkedIn profile link (linkedin.com/in/…)");
    // Employee referral: a valid ?ref= code wins; otherwise keep what the candidate typed.
    let referrerId: string | null = null;
    let referralSource: string | null = null;
    let referredByText: string | null = null;
    {
      const { cleanCode, matchTypedReferrer } = await import("@/lib/referrals");
      const code = cleanCode(data.ref);
      if (code) {
        const { data: r } = await supabaseAdmin.from("referrers").select("id")
          .eq("org_id", job.org_id).eq("referral_code", code).eq("active", true).maybeSingle();
        if (r) { referrerId = r.id; referralSource = data.refVia ?? "link"; }
      }
      if (!referrerId && data.referredBy?.trim()) {
        referredByText = data.referredBy.trim();
        referralSource = "typed";
        const { data: refs } = await supabaseAdmin.from("referrers")
          .select("id, employee_name, store_id, active, referral_code").eq("org_id", job.org_id).eq("active", true);
        referrerId = matchTypedReferrer(referredByText, refs ?? [])?.id ?? null;
      }
    }
    const { data: app, error } = await supabaseAdmin.from("applications").insert({
      referrer_id: referrerId, referral_source: referralSource, referred_by_text: referredByText,
      org_id: job.org_id, job_id: job.id, dealership_id: job.dealership_id,
      full_name: data.fullName, email, phone,
      linkedin_url: linkedinUrl,
      source: (data.source || "careers").toLowerCase(),
      source_detail: data.sourceDetail || null, // source_channel is derived from source by a database trigger
      candidate_id: candidateId,
      answers,
      knockout_failed: knockoutFailed,
    }).select("id, status_token").single();
    if (error) throw new Error("We couldn't save your application. Please try again.");
    await supabaseAdmin.from("application_events").insert({
      org_id: job.org_id, application_id: app.id, kind: "applied", message: "Application received",
    });
    // AI-use notice shown above the submit button: keep the exact wording as evidence.
    {
      const { AI_NOTICE_TEXT, AI_NOTICE_VERSION } = await import("@/lib/ai-notice");
      await supabaseAdmin.from("applicant_consents").insert({
        org_id: job.org_id, store_id: job.dealership_id, applicant_id: app.id,
        consent_type: "ai_notice", granted: true, consent_text: AI_NOTICE_TEXT,
        consent_version: AI_NOTICE_VERSION, source: "careers_form",
      });
    }
    // Welcome text (respects consent, STOP and texting hours; never blocks applying).
    const { welcomeOnApply } = await import("@/lib/workflows/run.server");
    await welcomeOnApply(supabaseAdmin, app.id);
    const { emailApplicant } = await import("@/lib/email/applicant.server");
    await emailApplicant(supabaseAdmin, app.id, { kind: "confirmation" });
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

const contactSchema = z.object({
  orgSlug: z.string().min(1).max(60),
  jobId: z.string().uuid().nullable(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional(),
  message: z.string().trim().min(1).max(2000),
  /** Hidden field real people leave empty. */
  website: z.string().max(0).optional(),
});

/**
 * Careers-site contact form. Each message lands in the pipeline as a new applicant
 * (stage New, source "Our website") with the message in their notes. With no job
 * picked, it goes on the group's newest open job, flagged "any role".
 */
export const submitContact = createServerFn({ method: "POST" })
  .inputValidator((d: z.input<typeof contactSchema>) => contactSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin.from("organizations").select("id").eq("slug", data.orgSlug).maybeSingle();
    if (!org) throw new Error("This careers site isn't available.");
    let q = supabaseAdmin.from("jobs").select("id, dealership_id").eq("org_id", org.id).eq("status", "open");
    q = data.jobId ? q.eq("id", data.jobId) : q.order("created_at", { ascending: false });
    const { data: jobs } = await q.limit(1);
    const job = jobs?.[0];
    if (!job) throw new Error("There are no open jobs right now. Please check back soon.");
    const email = data.email.toLowerCase();
    const { data: cand } = await supabaseAdmin.from("candidates").select("id").eq("org_id", org.id).eq("email", email).limit(1);
    let candidateId = cand?.[0]?.id ?? null;
    if (!candidateId) {
      const { data: created } = await supabaseAdmin.from("candidates")
        .insert({ org_id: org.id, full_name: data.fullName, email, phone: data.phone || null }).select("id").single();
      candidateId = created?.id ?? null;
    }
    const note = `${data.jobId ? "" : "Interested in any open role. "}Message from the careers site:\n${data.message}`;
    const { data: app, error } = await supabaseAdmin.from("applications").insert({
      org_id: org.id, job_id: job.id, dealership_id: job.dealership_id, full_name: data.fullName, email,
      phone: data.phone || null, source: "own_site", candidate_id: candidateId, notes: note,
    }).select("id").single();
    if (error || !app) throw new Error("We couldn't send your message. Please try again.");
    await supabaseAdmin.from("application_events").insert({
      org_id: org.id, application_id: app.id, kind: "applied", message: "Contacted us through the careers site",
    });
    const { emailApplicant } = await import("@/lib/email/applicant.server");
    await emailApplicant(supabaseAdmin, app.id, { kind: "confirmation" });
    return { ok: true };
  });
