import { afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
const url = process.env["SUPABASE_DB_URL"];
const db = url ? postgres(url, { max: 1 }) : undefined;
afterAll(async () => { if (db) await db.end(); });
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
      await tx`set local role authenticated`;
      const [access] = await tx`select public.can_interview_feedback(${iv["org_id"]},${iv["id"]},${uid}) allowed`;
      expect(access?.["allowed"]).toBe(allowed);
      const [cross] = await tx`select public.can_interview_feedback(${crypto.randomUUID()},${iv["id"]},${uid}) allowed`;
      expect(cross?.["allowed"]).toBe(false);
      if (allowed) {
        const [saved] = await tx`select (public.save_quick_interview_feedback(${iv["org_id"]},${iv["id"]},'{"rating":4,"recommendation":"hire","onTime":true}'::jsonb)).*`;
        expect(saved?.["feedback_rating"]).toBe(4);
        expect(saved?.["feedback_on_time"]).toBe(true);
        expect(saved?.["author_id"]).toBe(uid);
        const [event] = await tx`select message from public.application_events where id=${saved?.["feedback_event_id"]}`;
        expect(event?.["message"]).toBe("4/5 · Hire · by qa@example.com");
        const [again] = await tx`select (public.save_quick_interview_feedback(${iv["org_id"]},${iv["id"]},'{"rating":5,"recommendation":"pass"}'::jsonb)).*`;
        expect(again?.["id"]).toBe(saved?.["id"]);
        expect(again?.["feedback_event_id"]).toBe(saved?.["feedback_event_id"]);
      } else {
        await expect(tx.savepoint((sp) => sp`select public.save_quick_interview_feedback(${iv["org_id"]},${iv["id"]},'{"rating":4}'::jsonb)`)).rejects.toThrow();
      }
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