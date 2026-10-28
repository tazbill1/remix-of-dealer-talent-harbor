import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PREVIEW_TEXT } from "@/lib/store-texting";

type Ctx = { supabase: any; userId: string };

async function requirePlatformAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("is_platform_admin", { _uid: ctx.userId });
  if (!data) throw new Error("Only WerkandMe platform admins can manage texting.");
}

/** Every group and store with its texting setup. Platform admins only (RLS also enforces). */
export const listTextingAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context);
    const sb = context.supabase;
    const [orgs, stores, texting, me] = await Promise.all([
      sb.from("organizations").select("id, name").order("name"),
      sb.from("dealerships").select("id, org_id, name, sms_number").order("name"),
      sb.from("store_texting").select("store_id, phone_number_sid, messaging_service_sid, live"),
      sb.from("platform_admins").select("phone").eq("user_id", context.userId).maybeSingle(),
    ]);
    const { twilioConfigured } = await import("@/lib/messaging/twilio.server");
    const byStore = new Map((texting.data ?? []).map((t: any) => [t.store_id, t]));
    return {
      twilioConnected: twilioConfigured(),
      myPhone: (me.data?.phone as string | null) ?? null,
      orgs: (orgs.data ?? []).map((o: any) => ({
        id: o.id as string,
        name: o.name as string,
        stores: (stores.data ?? [])
          .filter((s: any) => s.org_id === o.id)
          .map((s: any) => {
            const t: any = byStore.get(s.id);
            return {
              id: s.id as string,
              name: s.name as string,
              sms_number: (s.sms_number as string | null) ?? null,
              phone_number_sid: (t?.phone_number_sid as string | null) ?? null,
              messaging_service_sid: (t?.messaging_service_sid as string | null) ?? null,
              live: !!t?.live,
            };
          }),
      })),
    };
  });

const saveSchema = z.object({
  storeId: z.string().uuid(),
  smsNumber: z.string().trim().max(30).nullable(),
  phoneNumberSid: z.string().trim().max(64).nullable(),
  messagingServiceSid: z.string().trim().max(64).nullable(),
  live: z.boolean(),
});

export const saveStoreTexting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const sb = context.supabase;
    const { toE164 } = await import("@/lib/messaging/core");
    const number = data.smsNumber ? toE164(data.smsNumber) : null;
    if (data.smsNumber && !number) throw new Error("Enter a valid texting number, like (214) 555-0123.");
    if (data.live && !number) throw new Error("Set the texting number before turning live texting on.");
    const { data: store, error: e1 } = await sb
      .from("dealerships").update({ sms_number: number }).eq("id", data.storeId).select("id, org_id").single();
    if (e1 || !store) throw new Error(e1?.message ?? "Store not found.");
    const { error: e2 } = await sb.from("store_texting").upsert({
      store_id: store.id,
      org_id: store.org_id,
      phone_number_sid: data.phoneNumberSid || null,
      messaging_service_sid: data.messagingServiceSid || null,
      live: data.live,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" }).select("store_id").single();
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const saveMyTestPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string().trim().max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const { toE164 } = await import("@/lib/messaging/core");
    const phone = data.phone ? toE164(data.phone) : null;
    if (data.phone && !phone) throw new Error("Enter a valid mobile number.");
    const { error } = await context.supabase
      .from("platform_admins").update({ phone }).eq("user_id", context.userId).select("user_id").single();
    if (error) throw new Error(error.message);
    return { phone };
  });

/** Sends one test text from the store's number to the signed-in admin's own saved phone only. */
export const sendPreviewText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const sb = context.supabase;
    const [{ data: me }, { data: store }] = await Promise.all([
      sb.from("platform_admins").select("phone").eq("user_id", context.userId).maybeSingle(),
      sb.from("dealerships").select("name, sms_number").eq("id", data.storeId).single(),
    ]);
    if (!me?.phone) throw new Error("Save your own mobile number first.");
    if (!store?.sms_number) throw new Error("This store has no texting number yet.");
    const { sendTwilio, twilioConfigured } = await import("@/lib/messaging/twilio.server");
    if (!twilioConfigured()) throw new Error("Twilio isn't connected yet, so no text was sent.");
    await sendTwilio({ to: me.phone, from: store.sms_number, body: PREVIEW_TEXT(store.name) });
    return { sentTo: me.phone as string };
  });
