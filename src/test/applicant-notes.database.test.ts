import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const url = process.env["SUPABASE_DB_URL"];
const db = url ? postgres(url, { max: 1 }) : undefined;
afterAll(async () => { if (db) await db.end(); });
beforeAll(async () => {
  if (!db) return;
  await db`create temporary table if not exists note_permission_session(id integer)`;
  const functions = await db`select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('is_platform_admin','is_org_member','can_access_store','can_access_application') order by case proname when 'is_platform_admin' then 0 when 'is_org_member' then 1 when 'can_access_store' then 2 else 3 end`;
  for (const fn of functions) {
    let sql = String(fn["definition"]).replace("FUNCTION public.", "FUNCTION pg_temp.").replace("SECURITY DEFINER", "SECURITY INVOKER");
    for (const name of ["is_platform_admin", "is_org_member", "can_access_store", "can_access_application"]) sql = sql.replaceAll(`public.${name}(`, `pg_temp.${name}(`);
    await db.unsafe(sql);
  }
});

describe.skipIf(!db)("applicant note permissions", () => {
  async function access(role: string, assigned: boolean, allowed: boolean) {
    if (!db) return;
    try {
      await db.begin(async (tx) => {
        const [app] = await tx`select a.id,a.org_id,a.dealership_id from public.applications a join public.organizations o on o.id=a.org_id where o.name='ABC Dealer Group' order by a.id limit 1`;
        if (!app) throw new Error("Missing test applicant");
        const user = crypto.randomUUID();
        const [member] = await tx`insert into public.org_members(org_id,user_id,role) values(${app["org_id"]},${user},${role}) returning id`;
        if (assigned && member) await tx`insert into public.org_member_scopes(org_id,member_id,dealership_id) values(${app["org_id"]},${member["id"]},${app["dealership_id"]})`;
        const [application] = await tx`select pg_temp.is_platform_admin(${user}) or (pg_temp.is_org_member(${app["org_id"]},${user}) and pg_temp.can_access_store(${app["org_id"]},${app["dealership_id"]},${user})) allowed`;
        const [events] = await tx`select pg_temp.is_platform_admin(${user}) or (pg_temp.is_org_member(${app["org_id"]},${user}) and pg_temp.can_access_application(${app["id"]},${user})) allowed`;
        expect(application?.["allowed"]).toBe(allowed);
        expect(events?.["allowed"]).toBe(allowed);
        const [other] = await tx`select id from public.applications where org_id<>${app["org_id"]} limit 1`;
        if (!other) throw new Error("Missing cross-org fixture");
        const [cross] = await tx`select pg_temp.can_access_application(${other["id"]},${user}) allowed`;
        expect(cross?.["allowed"]).toBe(false);
        throw new Error("ROLLBACK_TEST");
      });
    } catch (e) { if (!(e instanceof Error) || e.message !== "ROLLBACK_TEST") throw e; }
  }
  it("allows group admins", () => access("group_admin", false, true));
  it("allows HR/recruiters", () => access("recruiter", false, true));
  it("allows assigned GMs", () => access("dealer_manager", true, true));
  it("allows assigned hiring managers", () => access("hiring_manager", true, true));
  it("allows regional leaders under current access rules", () => access("regional_leader", true, true));
  it("denies unassigned GMs", () => access("dealer_manager", false, false));
  it("denies unassigned hiring managers", () => access("hiring_manager", false, false));
  it("allows platform admins without membership", async () => {
    if (!db) return;
    const [admin] = await db`select user_id from public.platform_admins limit 1`;
    if (!admin) throw new Error("Missing platform admin fixture");
    const [allowed] = await db`select pg_temp.is_platform_admin(${admin["user_id"]}) allowed`;
    expect(allowed?.["allowed"]).toBe(true);
  });
});