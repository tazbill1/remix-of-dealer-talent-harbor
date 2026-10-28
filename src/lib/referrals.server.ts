/** Referral bonus due alerts: in-app notifications to HR only. No texts or emails. Never throws. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { bonusDueMessage, bonusesToAlert } from "@/lib/referrals";

type DB = SupabaseClient<Database>;

export async function notifyDueReferralBonuses(admin: DB, now = new Date()) {
  try {
    const today = now.toISOString().slice(0, 10);
    const { data } = await admin.from("referral_bonuses")
      .select("id, org_id, applicant_id, referrer_id, payout_stage, status, due_date, due_notified_at")
      .eq("status", "pending").is("due_notified_at", null).lte("due_date", today).limit(200);
    const due = bonusesToAlert(data ?? [], today);
    let sent = 0;
    for (const b of due) {
      const [{ data: members }, { data: ref }, { data: app }] = await Promise.all([
        admin.from("org_members").select("user_id, role").eq("org_id", b.org_id).in("role", ["recruiter", "group_admin"]),
        admin.from("referrers").select("employee_name").eq("id", b.referrer_id).maybeSingle(),
        admin.from("applications").select("full_name, dealership_id").eq("id", b.applicant_id).maybeSingle(),
      ]);
      const recruiters = (members ?? []).filter((m) => m.role === "recruiter");
      const to = [...new Set((recruiters.length ? recruiters : members ?? []).map((m) => m.user_id))];
      const message = bonusDueMessage(ref?.employee_name ?? "An employee", app?.full_name ?? "an applicant", b.payout_stage);
      if (to.length) {
        const { error } = await admin.from("notifications").insert(to.map((uid) => ({
          org_id: b.org_id, store_id: app?.dealership_id ?? null, recipient_id: uid,
          type: "referral_bonus_due", application_id: b.applicant_id, message,
        })));
        if (error) continue;
      }
      await admin.from("referral_bonuses").update({ due_notified_at: now.toISOString() }).eq("id", b.id);
      sent++;
    }
    return { referralBonusesDue: sent };
  } catch (e) {
    console.error("referral bonus alerts failed", e);
    return { referralBonusesDue: 0 };
  }
}
