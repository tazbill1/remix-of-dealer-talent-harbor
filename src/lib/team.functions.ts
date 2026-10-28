import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canAccept,
  inviteEmail,
  inviteInput,
  inviteStatus,
  roleLabel,
  scopeSchema,
} from "@/lib/invites";

/** ilike without wildcards: "_" and "%" in an email are literal characters. */
const exactly = (email: string) => email.replace(/[\\%_]/g, (c) => `\\${c}`);

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

async function requireGroupAdmin(ctx: Ctx, orgId: string) {
  const [admin, platform] = await Promise.all([
    ctx.supabase.rpc("has_org_role", { _org: orgId, _uid: ctx.userId, _role: "group_admin" }),
    ctx.supabase.rpc("is_platform_admin", { _uid: ctx.userId }),
  ]);
  if (!admin.data && !platform.data) throw new Error("Only group admins can manage the team.");
}

/**
 * Invite someone to the group. Returns the link (to copy and send yourself) and whether
 * it was also emailed (only when email is live and a sending address is set).
 */
export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof inviteInput>) => inviteInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireGroupAdmin(context as Ctx, data.orgId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("org_members")
      .select("id")
      .eq("org_id", data.orgId)
      .ilike("email", exactly(data.email))
      .limit(1);
    if (existing?.length) throw new Error(`${data.email} is already on the team.`);

    // Only the stores/regions of this group can be given.
    const [stores, regions] = await Promise.all([
      supabaseAdmin.from("dealerships").select("id").eq("org_id", data.orgId),
      supabaseAdmin.from("regions").select("id").eq("org_id", data.orgId),
    ]);
    const storeIds = new Set((stores.data ?? []).map((s) => s.id));
    const regionIds = new Set((regions.data ?? []).map((r) => r.id));
    const scopes = data.scopes.filter((s) =>
      "dealership_id" in s ? storeIds.has(s.dealership_id) : regionIds.has(s.region_id),
    );
    if (scopes.length !== data.scopes.length)
      throw new Error("Pick stores and regions from this group.");

    // Optional calendar link: check it now so a bad link is caught while you're here.
    let calendarUrl: string | null = null;
    if (data.calendarUrl) {
      const { checkCalendarUrl } = await import("@/lib/busy-calendar");
      const checked = checkCalendarUrl(data.calendarUrl);
      if ("error" in checked) throw new Error(`Calendar link: ${checked.error}`);
      const { fetchIcs } = await import("@/lib/busy-calendar.server");
      try {
        await fetchIcs(checked.url);
      } catch (e) {
        throw new Error(`Calendar link: ${(e as Error).message}`);
      }
      calendarUrl = checked.url;
    }

    // A new invite replaces any open one for the same person.
    await supabaseAdmin
      .from("org_invites")
      .update({ revoked_at: new Date().toISOString(), calendar_url: null })
      .eq("org_id", data.orgId)
      .ilike("email", exactly(data.email))
      .is("accepted_at", null)
      .is("revoked_at", null);
    const { data: invite, error } = await supabaseAdmin
      .from("org_invites")
      .insert({
        org_id: data.orgId,
        email: data.email,
        role: data.role,
        scopes,
        invited_by: context.userId,
        calendar_url: calendarUrl,
      })
      .select("id, token")
      .single();
    if (error) throw new Error(error.message);

    const { appBaseUrl } = await import("@/lib/email/provider.server");
    const link = `${appBaseUrl(getRequest())}/invite/${invite.token}`;

    let emailed = false;
    let emailNote: string | null = null;
    const { loadEmailSettings } = await import("@/lib/email/outbox.server");
    const settings = await loadEmailSettings(supabaseAdmin, data.orgId);
    if (settings.email_mode === "live" && settings.email_from_address) {
      const [{ data: org }, { data: me }] = await Promise.all([
        supabaseAdmin.from("organizations").select("name").eq("id", data.orgId).single(),
        supabaseAdmin
          .from("org_members")
          .select("email")
          .eq("org_id", data.orgId)
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
      const msg = inviteEmail({
        orgName: org?.name ?? "your dealer group",
        role: data.role,
        link,
        inviter: me?.email ?? null,
      });
      try {
        const { sendLovable } = await import("@/lib/email/provider.server");
        await sendLovable({
          fromAddress: settings.email_from_address,
          fromName: `${org?.name ?? "hireme"} via hireme`,
          to: data.email,
          subject: msg.subject,
          text: msg.text,
          replyTo: settings.email_reply_to,
          idempotencyKey: `invite-${invite.id}`,
          label: "team_invite",
        });
        emailed = true;
      } catch (e) {
        emailNote = (e as Error).message;
      }
    } else {
      emailNote = "Email is in practice mode, so copy the link and send it yourself.";
    }
    return { link, emailed, emailNote };
  });

export const cancelInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; inviteId: string }) =>
    z.object({ orgId: z.string().uuid(), inviteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireGroupAdmin(context as Ctx, data.orgId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("org_invites")
      .update({ revoked_at: new Date().toISOString(), calendar_url: null })
      .eq("id", data.inviteId)
      .eq("org_id", data.orgId)
      .is("accepted_at", null);
    return { ok: true };
  });

/** Public: what the invite page shows before anyone signs in. */
export const getInvite = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("org_invites")
      .select("email, role, org_id, expires_at, accepted_at, revoked_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return null;
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", inv.org_id)
      .maybeSingle();
    return {
      email: inv.email,
      roleLabel: roleLabel(inv.role),
      orgName: org?.name ?? "a dealer group",
      status: inviteStatus(inv),
    };
  });

/** Signed in with the invited email: join the group with the invite's role and coverage. */
export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("org_invites")
      .select("id, org_id, email, role, scopes, expires_at, accepted_at, revoked_at, calendar_url")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) throw new Error("This invite link isn't valid.");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = user?.user?.email ?? null;
    const check = canAccept(inv, email);
    if (!check.ok) throw new Error(check.reason);

    const { data: already } = await supabaseAdmin
      .from("org_members")
      .select("id")
      .eq("org_id", inv.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!already) {
      const { data: member, error } = await supabaseAdmin
        .from("org_members")
        .insert({ org_id: inv.org_id, user_id: context.userId, role: inv.role, email })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const scopes = z.array(scopeSchema).catch([]).parse(inv.scopes);
      if (scopes.length)
        await supabaseAdmin.from("org_member_scopes").insert(
          scopes.map((s) => ({
            org_id: inv.org_id,
            member_id: member.id,
            dealership_id: "dealership_id" in s ? s.dealership_id : null,
            region_id: "region_id" in s ? s.region_id : null,
          })),
        );
    }
    // Link the calendar HR added on the invite (unless they already have one).
    if (inv.calendar_url) {
      const { data: member } = await supabaseAdmin
        .from("org_members")
        .select("id")
        .eq("org_id", inv.org_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (member) {
        const { data: existing } = await supabaseAdmin
          .from("store_calendars")
          .select("id")
          .eq("member_id", member.id)
          .maybeSingle();
        if (!existing)
          await supabaseAdmin.from("store_calendars").insert({
            org_id: inv.org_id,
            member_id: member.id,
            label: "Personal calendar",
            ics_url: inv.calendar_url,
            created_by: context.userId,
          });
      }
    }
    // The link is a secret: don't keep a copy on the invite once it's used.
    await supabaseAdmin
      .from("org_invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: context.userId, calendar_url: null })
      .eq("id", inv.id);
    return { orgId: inv.org_id };
  });
