import { afterAll, beforeAll, describe, it, expect } from "vitest";
import postgres from "postgres";
const url = process.env["SUPABASE_DB_URL"];
const db = url ? postgres(url, { max: 1 }) : undefined;
afterAll(async () => { if (db) await db.end(); });
beforeAll(async () => {
  if (!db) return;
  await db`create temporary table feedback_test_session(id integer)`;
  const names = ["is_platform_admin", "has_org_role", "is_org_member", "can_access_store", "can_interview_feedback"];
  const definitions = await db`select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname=any(${names})`;
  for (const name of names) {
    const fn = definitions.find((f) => f["proname"] === name);
    if (!fn) throw new Error(`Missing ${name}`);
    let sql = String(fn["definition"]).replace("FUNCTION public.", "FUNCTION pg_temp.").replace("SECURITY DEFINER", "SECURITY INVOKER");
    for (const helper of names) sql = sql.replaceAll(`public.${helper}(`, `pg_temp.${helper}(`);
    await db.unsafe(sql);
  }
});
describe.skipIf(!db)("quick feedback database permissions", () => {
  async function check(role: string, assigned: boolean, allowed: boolean) {
    if (!db) return;
    try { await db.begin(async (tx) => {
      const [iv] = await tx`select i.id,i.org_id,i.application_id,a.dealership_id from public.interviews i join public.applications a on a.id=i.application_id join public.organizations o on o.id=i.org_id where o.name='ABC Dealer Group' limit 1`;
      if (!iv) throw new Error("Missing interview fixture");
      const uid = crypto.randomUUID();
      const [member] = await tx`insert into public.org_members(org_id,user_id,role) values(${iv["org_id"]},${uid},${role}) returning id`;
      if (assigned && member) await tx`insert into public.org_member_scopes(org_id,member_id,dealership_id) values(${iv["org_id"]},${member["id"]},${iv["dealership_id"]})`;
      await tx`select set_config('request.jwt.claim.sub',${uid},true),set_config('request.jwt.claims',${JSON.stringify({ sub: uid, email: "qa@example.com" })},true)`;
      const [access] = await tx`select pg_temp.can_interview_feedback(${iv["org_id"]},${iv["id"]},${uid}) allowed`;
      expect(access?.["allowed"]).toBe(allowed);
      const [cross] = await tx`select pg_temp.can_interview_feedback(${crypto.randomUUID()},${iv["id"]},${uid}) allowed`;
      expect(cross?.["allowed"]).toBe(false);
      throw new Error("ROLLBACK_QA");
    }); } catch (e) { if (!(e instanceof Error) || e.message !== "ROLLBACK_QA") throw e; }
  }
  it("HR sees and saves all group interviews", () => check("recruiter",false,true));
  it("group admins see and save all group interviews", () => check("group_admin",false,true));
  it("assigned GMs can save", () => check("dealer_manager",true,true));
  it("assigned hiring managers can save", () => check("hiring_manager",true,true));
  it("unassigned GMs cannot save", () => check("dealer_manager",false,false));
  it("unassigned hiring managers cannot save", () => check("hiring_manager",false,false));
  it("regional leaders cannot save quick feedback", () => check("regional_leader",true,false));
});