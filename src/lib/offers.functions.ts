import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isOpen,
  offerInput,
  offerText,
  onboardingInput,
  onboardingTemplatesSchema,
  onboardingText,
  parseOnboardingTemplates,
  prefillFields,
  templateIdSchema,
} from "@/lib/offers";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

async function requireAppAccess(ctx: Ctx, applicationId: string) {
  const { data } = await ctx.supabase.rpc("can_access_application", { _app: applicationId, _uid: ctx.userId });
  if (!data) throw new Error("You don't have access to this applicant.");
}

/** Send the group's BoldSign offer letter to the candidate, and text them the link. */
export const sendOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof offerInput>) => offerInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAppAccess(context as Ctx, data.applicationId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: app } = await db
      .from("applications")
      .select("id, org_id, full_name, email, phone, dealership_id, job_id, status")
      .eq("id", data.applicationId)
      .eq("org_id", data.orgId)
      .single();
    if (!app) throw new Error("Applicant not found.");
    if (!app.email) throw new Error("Add the candidate's email first. BoldSign needs it to send the offer.");

    const [{ data: settings }, { data: store }, { data: job }, { data: open }] = await Promise.all([
      db.from("messaging_settings").select("offer_template_id").eq("org_id", data.orgId).maybeSingle(),
      db.from("dealerships").select("name, manager_name").eq("id", app.dealership_id).single(),
      db.from("jobs").select("hiring_manager").eq("id", app.job_id).maybeSingle(),
      db.from("offers").select("id, status").eq("application_id", app.id).eq("kind", "offer").in("status", ["sent", "viewed"]),
    ]);
    if (!settings?.offer_template_id)
      throw new Error("Add your BoldSign offer letter template on the Integrations page first.");
    if (open?.some((o) => isOpen(o.status)))
      throw new Error("An offer is already out for this candidate. Cancel it before sending a new one.");

    const storeName = store?.name ?? "our dealership";
    const { data: offer, error } = await db
      .from("offers")
      .insert({
        org_id: data.orgId,
        application_id: app.id,
        kind: "offer",
        status: "sent",
        job_title: data.jobTitle,
        pay: data.pay || null,
        start_date: data.startDate ?? null,
        note: data.note || null,
        sent_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !offer) throw new Error(error?.message ?? "Couldn't save the offer.");

    const { sendFromTemplate } = await import("@/lib/esign/boldsign.server");
    let documentId: string;
    try {
      documentId = await sendFromTemplate({
        templateId: settings.offer_template_id,
        title: `Offer: ${data.jobTitle} at ${storeName}`,
        message:
          data.note ||
          `${app.full_name.split(" ")[0]}, we're excited to offer you the ${data.jobTitle} position at ${storeName}. Please review and sign.`,
        signerName: app.full_name,
        signerEmail: app.email,
        fields: prefillFields({
          candidateName: app.full_name,
          jobTitle: data.jobTitle,
          storeName,
          pay: data.pay,
          startDate: data.startDate,
          managerName: job?.hiring_manager ?? store?.manager_name ?? null,
        }),
      });
    } catch (e) {
      await db.from("offers").update({ status: "failed", error: (e as Error).message }).eq("id", offer.id);
      throw e;
    }
    await db.from("offers").update({ provider_document_id: documentId }).eq("id", offer.id);

    const { statusEventRows } = await import("@/lib/status-log");
    const events: { org_id: string; application_id: string; kind: string; message: string; actor_id?: string }[] = [
      { org_id: data.orgId, application_id: app.id, kind: "offer", message: `Offer sent for signature: ${data.jobTitle}`, actor_id: context.userId },
    ];
    if (["new", "screening", "interview"].includes(app.status)) {
      await db.from("applications").update({ status: "offer" }).eq("id", app.id);
      events.push(...statusEventRows(data.orgId, [app.id], "offer"));
    }
    await db.from("application_events").insert(events);

    let texted: string | null = null;
    if (data.textLink && app.phone) {
      try {
        const { offerToken } = await import("@/lib/offers-token.server");
        const { appBaseUrl } = await import("@/lib/email/provider.server");
        const { queueText, deliverDue } = await import("@/lib/messaging/outbox.server");
        const link = `${appBaseUrl(getRequest())}/api/public/offer/${await offerToken(offer.id)}`;
        const row = await queueText(db, {
          applicationId: app.id,
          party: "candidate",
          purpose: "candidate_offer",
          body: offerText({ first: app.full_name.split(" ")[0] ?? "", store: storeName, title: data.jobTitle, link }),
        });
        if (row.status === "queued") await deliverDue(db, { ids: [row.id] });
        texted = row.status === "blocked" ? `Text not sent: ${row.error ?? "blocked"}` : null;
      } catch (e) {
        texted = `Text not sent: ${(e as Error).message}`;
      }
    }
    return { offerId: offer.id, textNote: texted };
  });

export const cancelOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; offerId: string }) =>
    z.object({ orgId: z.string().uuid(), offerId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: offer } = await db
      .from("offers")
      .select("id, application_id, kind, status, provider_document_id")
      .eq("id", data.offerId)
      .eq("org_id", data.orgId)
      .single();
    if (!offer) throw new Error("Offer not found.");
    await requireAppAccess(context as Ctx, offer.application_id);
    if (!isOpen(offer.status)) return { ok: true };
    if (offer.provider_document_id) {
      const { revokeDocument } = await import("@/lib/esign/boldsign.server");
      await revokeDocument(offer.provider_document_id, offer.kind === "onboarding" ? "This paperwork request was withdrawn." : "This offer was withdrawn.");
    }
    await db.from("offers").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", offer.id);
    await db.from("application_events").insert({
      org_id: data.orgId,
      application_id: offer.application_id,
      kind: "offer",
      message: offer.kind === "onboarding" ? "Onboarding paperwork cancelled" : "Offer cancelled",
      actor_id: context.userId,
    });
    return { ok: true };
  });

/** Group admins: which BoldSign template is the offer letter. */
export const saveOfferTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; templateId: string }) =>
    z.object({ orgId: z.string().uuid(), templateId: templateIdSchema.or(z.literal("")) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [admin, platform] = await Promise.all([
      context.supabase.rpc("has_org_role", { _org: data.orgId, _uid: context.userId, _role: "group_admin" }),
      context.supabase.rpc("is_platform_admin", { _uid: context.userId }),
    ]);
    if (!admin.data && !platform.data) throw new Error("Only group admins can change this.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db
      .from("messaging_settings")
      .upsert(
        { org_id: data.orgId, offer_template_id: data.templateId || null, updated_at: new Date().toISOString() },
        { onConflict: "org_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Send new-hire paperwork (one or more BoldSign templates) as a single packet. */
export const sendOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof onboardingInput>) => onboardingInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAppAccess(context as Ctx, data.applicationId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: app } = await db
      .from("applications")
      .select("id, org_id, full_name, email, phone, dealership_id, job_id, start_date")
      .eq("id", data.applicationId)
      .eq("org_id", data.orgId)
      .single();
    if (!app) throw new Error("Applicant not found.");
    if (!app.email) throw new Error("Add the new hire's email first. BoldSign needs it to send paperwork.");

    const [{ data: settings }, { data: store }, { data: job }, { data: open }, { data: lastOffer }] = await Promise.all([
      db.from("messaging_settings").select("onboarding_templates").eq("org_id", data.orgId).maybeSingle(),
      db.from("dealerships").select("name, manager_name").eq("id", app.dealership_id).single(),
      db.from("jobs").select("title, hiring_manager").eq("id", app.job_id).maybeSingle(),
      db.from("offers").select("id").eq("application_id", app.id).eq("kind", "onboarding").in("status", ["sent", "viewed"]),
      db.from("offers").select("job_title, pay, start_date").eq("application_id", app.id).eq("kind", "offer").eq("status", "signed")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const templates = parseOnboardingTemplates(settings?.onboarding_templates);
    const chosen = templates.filter((t) => data.templateIds.includes(t.id));
    if (chosen.length !== data.templateIds.length)
      throw new Error("Pick documents from your onboarding list on the Integrations page.");
    if (open?.length) throw new Error("Paperwork is already out for this person. Cancel it before sending more.");

    const storeName = store?.name ?? "our dealership";
    const jobTitle = lastOffer?.job_title ?? job?.title ?? "your new role";
    const startDate = data.startDate ?? lastOffer?.start_date ?? app.start_date ?? undefined;
    const names = chosen.map((t) => t.name);
    const { data: row, error } = await db
      .from("offers")
      .insert({
        org_id: data.orgId,
        application_id: app.id,
        kind: "onboarding",
        status: "sent",
        job_title: jobTitle,
        documents: names,
        start_date: startDate ?? null,
        note: data.note || null,
        sent_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Couldn't save the paperwork request.");

    const { sendPacket } = await import("@/lib/esign/boldsign.server");
    let documentId: string;
    try {
      documentId = await sendPacket({
        templateIds: chosen.map((t) => t.id),
        title: `New-hire paperwork: ${storeName}`,
        message:
          data.note ||
          `Welcome to ${storeName}! Please complete your new-hire paperwork: ${names.join(", ")}.`,
        signerName: app.full_name,
        signerEmail: app.email,
        fields: prefillFields({
          candidateName: app.full_name,
          jobTitle,
          storeName,
          pay: lastOffer?.pay ?? "",
          startDate,
          managerName: job?.hiring_manager ?? store?.manager_name ?? null,
        }),
      });
    } catch (e) {
      await db.from("offers").update({ status: "failed", error: (e as Error).message }).eq("id", row.id);
      throw e;
    }
    await db.from("offers").update({ provider_document_id: documentId }).eq("id", row.id);
    await db.from("application_events").insert({
      org_id: data.orgId,
      application_id: app.id,
      kind: "onboarding",
      message: `Onboarding paperwork sent: ${names.join(", ")}`,
      actor_id: context.userId,
    });

    let textNote: string | null = null;
    if (data.textLink && app.phone) {
      try {
        const { offerToken } = await import("@/lib/offers-token.server");
        const { appBaseUrl } = await import("@/lib/email/provider.server");
        const { queueText, deliverDue } = await import("@/lib/messaging/outbox.server");
        const link = `${appBaseUrl(getRequest())}/api/public/offer/${await offerToken(row.id)}`;
        const msg = await queueText(db, {
          applicationId: app.id,
          party: "candidate",
          purpose: "candidate_onboarding",
          body: onboardingText({ first: app.full_name.split(" ")[0] ?? "", store: storeName, link }),
        });
        if (msg.status === "queued") await deliverDue(db, { ids: [msg.id] });
        textNote = msg.status === "blocked" ? `Text not sent: ${msg.error ?? "blocked"}` : null;
      } catch (e) {
        textNote = `Text not sent: ${(e as Error).message}`;
      }
    }
    return { id: row.id, textNote };
  });

/** Group admins: the BoldSign templates that make up new-hire paperwork. */
export const saveOnboardingTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; templates: { id: string; name: string }[] }) =>
    z.object({ orgId: z.string().uuid(), templates: onboardingTemplatesSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [admin, platform] = await Promise.all([
      context.supabase.rpc("has_org_role", { _org: data.orgId, _uid: context.userId, _role: "group_admin" }),
      context.supabase.rpc("is_platform_admin", { _uid: context.userId }),
    ]);
    if (!admin.data && !platform.data) throw new Error("Only group admins can change this.");
    const ids = data.templates.map((t) => t.id);
    if (new Set(ids).size !== ids.length) throw new Error("Each template can only be listed once.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db
      .from("messaging_settings")
      .upsert(
        { org_id: data.orgId, onboarding_templates: data.templates, updated_at: new Date().toISOString() },
        { onConflict: "org_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
