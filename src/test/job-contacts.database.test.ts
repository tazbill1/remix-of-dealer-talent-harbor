import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const url = process.env["SUPABASE_DB_URL"];
const db = url ? postgres(url, { max: 1 }) : undefined;
afterAll(async () => { if (db) await db.end(); });
beforeAll(async () => {
  if (!db) return;
  await db`create temporary table job_contact_test_session (id integer)`;
  const [fn] = await db`select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname='job_manager_is_eligible'`;
  if (!fn) throw new Error("Missing job manager validation");
  await db.unsafe(String(fn["definition"]).replace("FUNCTION public.", "FUNCTION pg_temp.").replace("SECURITY DEFINER", "SECURITY INVOKER"));
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
});