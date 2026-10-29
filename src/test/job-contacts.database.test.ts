import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const url = process.env["SUPABASE_DB_URL"];
const db = url ? postgres(url, { max: 1 }) : undefined;
afterAll(async () => { if (db) await db.end(); });
beforeAll(async () => {
  if (!db) return;
  await db`create temporary table if not exists job_contact_test_session (id integer)`;
  const [fn] = await db`select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname='job_manager_is_eligible'`;
  if (!fn) throw new Error("Missing job manager validation");
  await db.unsafe(String(fn["definition"]).replace("FUNCTION public.", "FUNCTION pg_temp.").replace("SECURITY DEFINER", "SECURITY INVOKER"));
  const [guard] = await db`select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname='guard_job_contacts'`;
  if (!guard) throw new Error("Missing job contact guard");
  // Diagnostics cannot read auth. Supply display-only fixtures privately without widening grants.
  await db`create temporary table if not exists job_contact_users (id uuid,raw_user_meta_data jsonb,phone text)`;
  await db`delete from job_contact_users`;
  await db`insert into job_contact_users select user_id,jsonb_build_object('full_name',case email when 'tom@werkandme.com' then 'Tom Azbill' when 'aaron@akillion.us' then 'Aaron Sheeks' else email end),null from public.org_members`;
  await db.unsafe(String(guard["definition"]).replace("FUNCTION public.", "FUNCTION pg_temp.").replace("SECURITY DEFINER", "SECURITY INVOKER").replaceAll("public.job_manager_is_eligible(", "pg_temp.job_manager_is_eligible(").replaceAll("auth.users", "pg_temp.job_contact_users"));
  await db`create temporary table if not exists job_contact_guard_test (like public.jobs including defaults)`;
  await db`create or replace trigger job_contact_guard_test before insert or update on job_contact_guard_test for each row execute function pg_temp.guard_job_contacts()`;
});

describe.skipIf(!db)("job manager database scoping", () => {
  async function scenario(role: string, assigned: boolean, expected: boolean) {
    if (!db) return;
    try {
      await db.begin(async (tx) => {
        const [store] = await tx`select d.id,d.org_id from public.dealerships d join public.organizations o on o.id=d.org_id where o.name='ABC Dealer Group' order by d.id limit 1`;
        if (!store) throw new Error("Missing store fixture");
        const user = crypto.randomUUID();
        const [member] = await tx`insert into public.org_members(org_id,user_id,role) values(${store["org_id"]},${user},${role}) returning id`;
        if (assigned && member) await tx`insert into public.org_member_scopes(org_id,member_id,dealership_id) values(${store["org_id"]},${member["id"]},${store["id"]})`;
        const [result] = await tx`select pg_temp.job_manager_is_eligible(${store["org_id"]},${store["id"]},${user}) allowed`;
        expect(result?.["allowed"]).toBe(expected);
        const [other] = await tx`select d.id,d.org_id from public.dealerships d where d.org_id<>${store["org_id"]} limit 1`;
        if (!other) throw new Error("Missing second organization");
        const [cross] = await tx`select pg_temp.job_manager_is_eligible(${other["org_id"]},${other["id"]},${user}) allowed`;
        expect(cross?.["allowed"]).toBe(false);
        throw new Error("ROLLBACK_TEST");
      });
    } catch (e) { if (!(e instanceof Error) || e.message !== "ROLLBACK_TEST") throw e; }
  }
  it("accepts an assigned GM in their organization", () => scenario("dealer_manager", true, true));
  it("accepts an assigned hiring manager in their organization", () => scenario("hiring_manager", true, true));
  it("rejects an unassigned GM", () => scenario("dealer_manager", false, false));
  it("does not offer a recruiter as a manager", () => scenario("recruiter", true, false));
  it("does not offer a regional leader as a manager", () => scenario("regional_leader", true, false));
  it("defaults to group recruiter when the store has no local HR and preserves explicit overrides", async () => {
    if (!db) return;
    const [store] = await db`select d.id,d.org_id from public.dealerships d join public.organizations o on o.id=d.org_id where o.name='ABC Dealer Group' and d.name='ABC Motors Dallas'`;
    if (!store) throw new Error("Missing Dallas fixture");
    const [row] = await db`insert into job_contact_guard_test(org_id,dealership_id,title) values(${store["org_id"]},${store["id"]},'Test job') returning escalation_name,hiring_manager_user_id`;
    expect(row?.["escalation_name"]).toBe("Aaron Sheeks");
    expect(row?.["hiring_manager_user_id"]).toBeNull();
    const [override] = await db`insert into job_contact_guard_test(org_id,dealership_id,title,escalation_name,escalation_phone) values(${store["org_id"]},${store["id"]},'Test override','Job HR override','5550101000') returning escalation_name,escalation_phone`;
    expect(override?.["escalation_name"]).toBe("Job HR override");
    expect(override?.["escalation_phone"]).toBe("5550101000");
  });
  it("prioritizes store-assigned HR/admin over group fallback", async () => {
    if (!db) return;
    try {
      await db.begin(async (tx) => {
        const [store] = await tx`select d.id,d.org_id,m.id member_id from public.dealerships d join public.organizations o on o.id=d.org_id join public.org_members m on m.org_id=d.org_id and m.email='tom@werkandme.com' where o.name='ABC Dealer Group' and d.name='ABC Motors Dallas'`;
        if (!store) throw new Error("Missing Dallas HR fixture");
        await tx`insert into public.org_member_scopes(org_id,member_id,dealership_id) values(${store["org_id"]},${store["member_id"]},${store["id"]})`;
        const [local] = await tx`insert into job_contact_guard_test(org_id,dealership_id,title) values(${store["org_id"]},${store["id"]},'Local HR test') returning escalation_name`;
        expect(local?.["escalation_name"]).toBe("Tom Azbill");
        throw new Error("ROLLBACK_TEST");
      });
    } catch (e) { if (!(e instanceof Error) || e.message !== "ROLLBACK_TEST") throw e; }
  });
});