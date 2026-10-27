import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { busyFromIcs, calendarHost, checkCalendarUrl } from "@/lib/busy-calendar";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };
const ids = z.object({ orgId: z.string().uuid(), storeId: z.string().uuid() });

async function requireStore(ctx: Ctx, orgId: string, storeId: string) {
  const [{ data: canPost }, { data: canStore }] = await Promise.all([
    ctx.supabase.rpc("can_post_jobs", { _org: orgId, _uid: ctx.userId }),
    ctx.supabase.rpc("can_access_store", { _org: orgId, _store: storeId, _uid: ctx.userId }),
  ]);
  if (!canPost && !canStore) throw new Error("You can't change this store's settings.");
}

/** The calendars linked to a store, without the secret links themselves. */
export const listStoreCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; storeId: string }) => ids.parse(d))
  .handler(async ({ data, context }) => {
    await requireStore(context as Ctx, data.orgId, data.storeId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await db
      .from("store_calendars")
      .select("id, label, ics_url, last_checked_at, last_error, created_at")
      .eq("dealership_id", data.storeId)
      .eq("org_id", data.orgId)
      .order("created_at");
    return (rows ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      host: calendarHost(r.ics_url),
      lastCheckedAt: r.last_checked_at,
      lastError: r.last_error,
    }));
  });

/** Link a manager's private calendar to the store. Checks it can be read first. */
export const addStoreCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; storeId: string; label: string; url: string }) =>
    ids.extend({ label: z.string().trim().min(1).max(60), url: z.string().trim().min(10).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStore(context as Ctx, data.orgId, data.storeId);
    const checked = checkCalendarUrl(data.url);
    if ("error" in checked) throw new Error(checked.error);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: store } = await db
      .from("dealerships")
      .select("timezone")
      .eq("id", data.storeId)
      .eq("org_id", data.orgId)
      .single();
    if (!store) throw new Error("Store not found.");
    const { count } = await db
      .from("store_calendars")
      .select("id", { count: "exact", head: true })
      .eq("dealership_id", data.storeId);
    if ((count ?? 0) >= 10) throw new Error("A store can link up to 10 calendars.");
    const { fetchIcs } = await import("@/lib/busy-calendar.server");
    const now = Date.now();
    const busy = busyFromIcs(await fetchIcs(checked.url), {
      storeTz: store.timezone || "America/Chicago",
      from: now,
      to: now + 7 * 86400e3,
    });
    const { error } = await db.from("store_calendars").insert({
      org_id: data.orgId,
      dealership_id: data.storeId,
      label: data.label,
      ics_url: checked.url,
      last_checked_at: new Date().toISOString(),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { busyThisWeek: busy.length };
  });

export const removeStoreCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; storeId: string; id: string }) =>
    ids.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStore(context as Ctx, data.orgId, data.storeId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("store_calendars").delete().eq("id", data.id).eq("dealership_id", data.storeId).eq("org_id", data.orgId);
    return { ok: true };
  });
