import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { busyFromIcs, calendarHost, checkCalendarUrl } from "@/lib/busy-calendar";

type DB = import("@supabase/supabase-js").SupabaseClient;
type Ctx = { supabase: DB; userId: string };
const orgOnly = z.object({ orgId: z.string().uuid() });
/** Roles whose calendars count for a store's interview booking. */
export const INTERVIEWER_ROLES = ["hiring_manager", "dealer_manager"] as const;

async function isAdmin(ctx: Ctx, orgId: string) {
  const [a, p] = await Promise.all([
    ctx.supabase.rpc("has_org_role", { _org: orgId, _uid: ctx.userId, _role: "group_admin" }),
    ctx.supabase.rpc("is_platform_admin", { _uid: ctx.userId }),
  ]);
  return !!a.data || !!p.data;
}

/** The member to act on: yourself, or (group admins only) someone on the team. */
async function targetMember(db: DB, ctx: Ctx, orgId: string, memberId?: string | null) {
  if (memberId) {
    const { data: m } = await db.from("org_members").select("id, user_id").eq("id", memberId).eq("org_id", orgId).maybeSingle();
    if (!m) throw new Error("Team member not found.");
    if (m.user_id !== ctx.userId && !(await isAdmin(ctx, orgId)))
      throw new Error("Only group admins can set someone else's calendar.");
    return m.id as string;
  }
  const { data: me } = await db.from("org_members").select("id").eq("org_id", orgId).eq("user_id", ctx.userId).maybeSingle();
  if (!me) throw new Error("You're not on this group's team.");
  return me.id as string;
}

const status = (r: { ics_url: string; last_checked_at: string | null; last_error: string | null } | null) =>
  r ? { linked: true, host: calendarHost(r.ics_url), lastCheckedAt: r.last_checked_at, lastError: r.last_error } : { linked: false as const };

/** Your own calendar link status (never the link itself). */
export const myCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: me } = await db.from("org_members").select("id, role").eq("org_id", data.orgId).eq("user_id", context.userId).maybeSingle();
    if (!me) return { member: false as const };
    const { data: row } = await db.from("store_calendars").select("ics_url, last_checked_at, last_error").eq("member_id", me.id).maybeSingle();
    return { member: true as const, interviewer: (INTERVIEWER_ROLES as readonly string[]).includes(me.role), ...status(row) };
  });

/** Group admins: calendar status for everyone on the team. */
export const teamCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context as Ctx, data.orgId))) throw new Error("Only group admins can see this.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await db
      .from("store_calendars")
      .select("member_id, ics_url, last_checked_at, last_error")
      .eq("org_id", data.orgId)
      .not("member_id", "is", null);
    return Object.fromEntries((rows ?? []).map((r) => [r.member_id as string, status(r)]));
  });

/** Link (or replace) a calendar for yourself, or for a team member if you're a group admin. */
export const setMemberCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; memberId?: string | null; url: string }) =>
    orgOnly.extend({ memberId: z.string().uuid().nullish(), url: z.string().trim().min(10).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const checked = checkCalendarUrl(data.url);
    if ("error" in checked) throw new Error(checked.error);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const memberId = await targetMember(db, context as Ctx, data.orgId, data.memberId);
    const { data: store } = await db.from("dealerships").select("timezone").eq("org_id", data.orgId).limit(1).maybeSingle();
    const { fetchIcs } = await import("@/lib/busy-calendar.server");
    const now = Date.now();
    const busy = busyFromIcs(await fetchIcs(checked.url), {
      storeTz: store?.timezone || "America/Chicago",
      from: now,
      to: now + 7 * 86400e3,
    });
    await db.from("store_calendars").delete().eq("member_id", memberId);
    const { error } = await db.from("store_calendars").insert({
      org_id: data.orgId,
      member_id: memberId,
      label: "Personal calendar",
      ics_url: checked.url,
      last_checked_at: new Date().toISOString(),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { busyThisWeek: busy.length };
  });

export const removeMemberCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; memberId?: string | null }) =>
    orgOnly.extend({ memberId: z.string().uuid().nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const memberId = await targetMember(db, context as Ctx, data.orgId, data.memberId);
    await db.from("store_calendars").delete().eq("member_id", memberId);
    return { ok: true };
  });

/** The people who interview at a store: hiring managers and GMs who cover it. */
export async function storeInterviewers(db: DB, orgId: string, storeId: string) {
  const { data: store } = await db.from("dealerships").select("region_id").eq("id", storeId).maybeSingle();
  const { data: scopes } = await db.from("org_member_scopes").select("member_id, dealership_id, region_id").eq("org_id", orgId);
  const covering = new Set(
    (scopes ?? [])
      .filter((s) => s.dealership_id === storeId || (!!store?.region_id && s.region_id === store.region_id))
      .map((s) => s.member_id),
  );
  if (!covering.size) return [];
  const { data: members } = await db
    .from("org_members")
    .select("id, email, role")
    .eq("org_id", orgId)
    .in("id", [...covering])
    .in("role", [...INTERVIEWER_ROLES]);
  return members ?? [];
}

/** Store page: who interviews here and whether their calendar is linked. */
export const storeInterviewerCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; storeId: string }) => orgOnly.extend({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const [{ data: canPost }, { data: canStore }] = await Promise.all([
      ctx.supabase.rpc("can_post_jobs", { _org: data.orgId, _uid: ctx.userId }),
      ctx.supabase.rpc("can_access_store", { _org: data.orgId, _store: data.storeId, _uid: ctx.userId }),
    ]);
    if (!canPost && !canStore) throw new Error("You can't see this store's settings.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const people = await storeInterviewers(db, data.orgId, data.storeId);
    const { data: rows } = people.length
      ? await db.from("store_calendars").select("member_id, ics_url, last_checked_at, last_error").in("member_id", people.map((p) => p.id))
      : { data: [] };
    return people.map((p) => ({
      id: p.id,
      email: p.email,
      role: p.role,
      ...status(rows?.find((r) => r.member_id === p.id) ?? null),
    }));
  });
