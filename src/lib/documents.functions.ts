import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { documentFields, sendDocsInput } from "@/lib/offers";
import { parseAutomations, wordingFor } from "@/lib/automations";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

async function requireMember(ctx: Ctx, orgId: string) {
  const [m, p] = await Promise.all([
    ctx.supabase.rpc("is_org_member", { _org: orgId, _uid: ctx.userId }),
    ctx.supabase.rpc("is_platform_admin", { _uid: ctx.userId }),
  ]);
  if (!m.data && !p.data) throw new Error("Not a member of this group.");
}

async function requireSender(ctx: Ctx, orgId: string) {
  const { data } = await ctx.supabase.rpc("can_post_jobs", { _org: orgId, _uid: ctx.userId });
  if (!data) throw new Error("Only group admins and recruiters can send documents.");
}

/** BoldSign templates, read live so new or edited templates show up right away. */
export const listSignTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMember(context as Ctx, data.orgId);
    const { boldsignConfigured, listTemplates } = await import("@/lib/esign/boldsign.server");
    if (!boldsignConfigured()) return { connected: false, templates: [], error: null as string | null };
    try {
      return { connected: true, templates: await listTemplates(), error: null as string | null };
    } catch (e) {
      return { connected: true, templates: [], error: (e as Error).message };
    }
  });

/** Send one or more BoldSign templates to the applicant, filled in from their profile. */
export const sendDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof sendDocsInput>) => sendDocsInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireSender(context as Ctx, data.orgId);
    const { data: ok } = await context.supabase.rpc("can_access_application", { _app: data.applicationId, _uid: context.userId });
    if (!ok) throw new Error("You don't have access to this applicant.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: app } = await db
      .from("applications")
      .select("id, full_name, email, phone, dealership_id, job_id")
      .eq("id", data.applicationId)
      .eq("org_id", data.orgId)
      .single();
    if (!app) throw new Error("Applicant not found.");
    if (!app.email) throw new Error("Add the applicant's email first. BoldSign needs it to send documents.");
    const [{ data: settings }, { data: store }, { data: job }] = await Promise.all([
      db.from("messaging_settings").select("offer_template_id").eq("org_id", data.orgId).maybeSingle(),
      db.from("dealerships").select("name, manager_name").eq("id", app.dealership_id).single(),
      db.from("jobs").select("hiring_manager").eq("id", app.job_id).maybeSingle(),
    ]);
    const storeName = store?.name ?? "our dealership";
    const fields = documentFields({
      candidateName: app.full_name,
      jobTitle: data.jobTitle,
      storeName,
      pay: data.pay,
      startDate: data.startDate,
      managerName: job?.hiring_manager ?? store?.manager_name ?? null,
    });
    const { sendFromTemplate } = await import("@/lib/esign/boldsign.server");
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const t of data.templates) {
      const isOffer = t.id === settings?.offer_template_id;
      const { data: row, error } = await db
        .from("offers")
        .insert({
          org_id: data.orgId,
          application_id: app.id,
          status: "sent",
          job_title: data.jobTitle,
          pay: data.pay || null,
          start_date: data.startDate ?? null,
          note: data.note || null,
          sent_by: context.userId,
          template_id: t.id,
          template_name: t.name,
          is_offer_letter: isOffer,
        })
        .select("id")
        .single();
      if (error || !row) {
        results.push({ name: t.name, ok: false, error: error?.message ?? "Couldn't save." });
        continue;
      }
      try {
        const documentId = await sendFromTemplate({
          templateId: t.id,
          title: `${t.name}: ${app.full_name}`,
          message: data.note || `Please review and sign ${t.name} from ${storeName}.`,
          signerName: app.full_name,
          signerEmail: app.email,
          fields,
        });
        await db.from("offers").update({ provider_document_id: documentId }).eq("id", row.id);
        results.push({ name: t.name, ok: true });
      } catch (e) {
        await db.from("offers").update({ status: "failed", error: (e as Error).message }).eq("id", row.id);
        results.push({ name: t.name, ok: false, error: (e as Error).message });
      }
    }
    const sent = results.filter((r) => r.ok).map((r) => r.name);
    if (sent.length)
      await db.from("application_events").insert({
        org_id: data.orgId,
        application_id: app.id,
        kind: "offer",
        message: `Sent for signature: ${sent.join(", ")}`,
        actor_id: context.userId,
      });

    let textNote: string | null = null;
    if (sent.length && data.textLink && app.phone) {
      try {
        const { docsToken } = await import("@/lib/offers-token.server");
        const { appBaseUrl } = await import("@/lib/email/provider.server");
        const { queueText, deliverDue, loadSettings } = await import("@/lib/messaging/outbox.server");
        const link = `${appBaseUrl(getRequest())}/api/public/docs/${await docsToken(app.id)}`;
        const msg = await queueText(db, {
          applicationId: app.id,
          party: "candidate",
          purpose: "candidate_documents",
          body: wordingFor(parseAutomations((await loadSettings(db, data.orgId)).automations), "documents", {
            first: app.full_name.split(" ")[0] ?? "",
            store: storeName,
            documents: sent.length === 1 ? "a document" : `${sent.length} documents`,
            link,
          }),
        });
        if (msg.status === "queued") await deliverDue(db, { ids: [msg.id] });
        textNote = msg.status === "blocked" ? `Text not sent: ${msg.error ?? "blocked"}` : null;
      } catch (e) {
        textNote = `Text not sent: ${(e as Error).message}`;
      }
    }
    return { results, textNote };
  });

/** The signed PDF, as base64 so the browser can save it. */
export const signedCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; offerId: string }) =>
    z.object({ orgId: z.string().uuid(), offerId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: doc } = await db
      .from("offers")
      .select("application_id, status, provider_document_id, template_name, job_title")
      .eq("id", data.offerId)
      .eq("org_id", data.orgId)
      .single();
    if (!doc) throw new Error("Document not found.");
    const { data: ok } = await context.supabase.rpc("can_access_application", { _app: doc.application_id, _uid: context.userId });
    if (!ok) throw new Error("You don't have access to this applicant.");
    if (doc.status !== "signed" || !doc.provider_document_id) throw new Error("This document isn't signed yet.");
    const { downloadDocument } = await import("@/lib/esign/boldsign.server");
    const bytes = await downloadDocument(doc.provider_document_id);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { filename: `${doc.template_name ?? doc.job_title}.pdf`, base64: btoa(bin) };
  });

/** Group admins: move the applicant to Hired when the offer letter is signed. */
export const saveHireOnSign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; on: boolean }) => z.object({ orgId: z.string().uuid(), on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const [admin, platform] = await Promise.all([
      context.supabase.rpc("has_org_role", { _org: data.orgId, _uid: context.userId, _role: "group_admin" }),
      context.supabase.rpc("is_platform_admin", { _uid: context.userId }),
    ]);
    if (!admin.data && !platform.data) throw new Error("Only group admins can change this.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db
      .from("messaging_settings")
      .upsert({ org_id: data.orgId, hire_on_offer_signed: data.on, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
