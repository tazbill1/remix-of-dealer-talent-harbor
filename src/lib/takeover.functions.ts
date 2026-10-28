import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

async function access(ctx: Ctx, applicationId: string) {
  const { data } = await ctx.supabase.rpc("can_access_application", { _app: applicationId, _uid: ctx.userId });
  if (!data) throw new Error("You don't have access to this applicant.");
}

/** Pause the assistant (a person takes over) or hand the conversation back. */
export const setAssistantPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { applicationId: string; paused: boolean }) =>
    z.object({ applicationId: z.string().uuid(), paused: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await access(context as Ctx, data.applicationId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: app } = await db.from("applications").select("org_id").eq("id", data.applicationId).single();
    await db
      .from("applications")
      .update(data.paused ? { ai_paused_at: new Date().toISOString() } : { ai_paused_at: null, needs_attention: null })
      .eq("id", data.applicationId);
    await db.from("application_events").insert({
      org_id: app!.org_id,
      application_id: data.applicationId,
      kind: "assistant",
      message: data.paused ? "A team member took over the texts (assistant paused)" : "Texts handed back to the assistant",
      actor_id: context.userId,
    });
    return { ok: true };
  });

/** Clear the "needs a person" flag. */
export const clearAttention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { applicationId: string }) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await access(context as Ctx, data.applicationId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("applications").update({ needs_attention: null }).eq("id", data.applicationId);
    return { ok: true };
  });

/** A team member texts the candidate directly (shows in the thread under their store). */
export const sendStaffText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { applicationId: string; body: string }) =>
    z.object({ applicationId: z.string().uuid(), body: z.string().trim().min(1).max(600) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await access(context as Ctx, data.applicationId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { queueText, deliverDue } = await import("@/lib/messaging/outbox.server");
    const row = await queueText(db, {
      applicationId: data.applicationId,
      party: "candidate",
      purpose: "staff_reply",
      body: data.body,
    });
    if (row.status === "queued" && row.scheduled_for && Date.parse(row.scheduled_for) <= Date.now())
      await deliverDue(db, { ids: [row.id] });
    await db.from("applications").update({ needs_attention: null }).eq("id", data.applicationId);
    let status = row.status as string;
    if (row.status !== "blocked") {
      const { data: after } = await db.from("messages").select("status, org_id").eq("id", row.id).maybeSingle();
      status = after?.status ?? status;
      const preview = data.body.length > 80 ? `${data.body.slice(0, 80)}…` : data.body;
      if (after?.org_id) await db.from("application_events").insert({
        org_id: after.org_id, application_id: data.applicationId, kind: "texting",
        message: `${status === "simulated" ? "Text sent (demo)" : "Text sent"}: "${preview}"`,
      });
    }
    return { status, note: row.status === "blocked" ? (row.error ?? "Not sent") : null };
  });

/** Can this applicant be texted? Opt-outs are server-only, so staff read them here. */
export const getTextingOptOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { applicationId: string }) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await access(context as Ctx, data.applicationId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { toE164 } = await import("@/lib/messaging/core");
    const { data: app } = await db.from("applications").select("org_id, phone").eq("id", data.applicationId).single();
    const phone = toE164(app?.phone);
    const { data: row } = phone
      ? await db.from("sms_opt_outs").select("opted_out_at, source").eq("org_id", app!.org_id).eq("phone", phone).maybeSingle()
      : { data: null };
    return { phone, optedOut: !!row, since: row?.opted_out_at ?? null, source: row?.source ?? null };
  });

/**
 * A team member marks the applicant's number as "don't text" (e.g. they asked on the
 * phone). Only an opt-out a team member made can be undone here; one the applicant
 * made by text can only be undone by them texting START.
 */
export const setTextingOptOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { applicationId: string; optedOut: boolean }) =>
    z.object({ applicationId: z.string().uuid(), optedOut: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await access(context as Ctx, data.applicationId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { toE164 } = await import("@/lib/messaging/core");
    const { data: app } = await db.from("applications").select("org_id, phone, candidate_id").eq("id", data.applicationId).single();
    const phone = toE164(app?.phone);
    if (!app || !phone) throw new Error("This applicant has no valid mobile number.");
    if (!data.optedOut) {
      const { data: row } = await db.from("sms_opt_outs").select("source").eq("org_id", app.org_id).eq("phone", phone).maybeSingle();
      if (row && row.source !== "staff")
        throw new Error("The applicant opted out themselves. Texts can only start again if they text START.");
    }
    // Leaves sms_opt_in alone, so undoing a mistaken mark restores what the applicant
    // agreed to on the form, and never grants consent they didn't give.
    const nowIso = new Date().toISOString();
    if (data.optedOut)
      await db.from("sms_opt_outs").upsert(
        { org_id: app.org_id, phone, source: "staff", opted_out_at: nowIso },
        { onConflict: "org_id,phone", ignoreDuplicates: true },
      );
    else await db.from("sms_opt_outs").delete().eq("org_id", app.org_id).eq("phone", phone);
    if (app.candidate_id)
      await db.from("candidates").update({ sms_opted_out_at: data.optedOut ? nowIso : null }).eq("id", app.candidate_id);
    await db.from("application_events").insert({
      org_id: app.org_id,
      application_id: data.applicationId,
      kind: "texting",
      message: data.optedOut ? "A team member marked this number as do-not-text" : "A team member undid the do-not-text mark",
      actor_id: context.userId,
    });
    return { ok: true };
  });
