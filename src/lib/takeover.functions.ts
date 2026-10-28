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
    return { status: row.status, note: row.status === "blocked" ? (row.error ?? "Not sent") : null };
  });
