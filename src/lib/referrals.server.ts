/** Referral bonus due alerts (in-app, HR only) and quarterly drawing entries. No texts or emails. Never throws. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { bonusDueMessage, bonusesToAlert, quarterKey } from "@/lib/referrals";

type DB = SupabaseClient<Database>;

export async function notifyDueReferralBonuses(admin: DB, now = new Date()) {
  let sent = 0;
  let entries = 0;
  try {
    const today = now.toISOString().slice(0, 10);
    const { data } = await admin.from("referral_bonuses")
      .select("id, org_id, applicant_id, referrer_id, payout_stage, status, due_date, due_notified_at")
      .eq("status", "pending").is("due_notified_at", null).lte("due_date", today).limit(200);
    const due = bonusesToAlert(data ?? [], today);
    for (const b of due) {
      const [{ data: members }, { data: ref }, { data: app }, { data: settings }] = await Promise.all([
        admin.from("org_members").select("user_id, role").eq("org_id", b.org_id).in("role", ["recruiter", "group_admin"]),
        admin.from("referrers").select("employee_name").eq("id", b.referrer_id).maybeSingle(),
        admin.from("applications").select("full_name, dealership_id").eq("id", b.applicant_id).maybeSingle(),
        admin.from("referral_settings").select("payout_days").eq("org_id", b.org_id).maybeSingle(),
      ]);
      const recruiters = (members ?? []).filter((m) => m.role === "recruiter");
      const to = [...new Set((recruiters.length ? recruiters : members ?? []).map((m) => m.user_id))];
      const message = bonusDueMessage(ref?.employee_name ?? "An employee", app?.full_name ?? "an applicant", settings?.payout_days ?? 90);
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

    // Quarterly drawing: each eligible referral that reached its payout day earns one entry for that quarter.
    const { data: reached } = await admin.from("referral_bonuses")
      .select("id, org_id, applicant_id, referrer_id, due_date")
      .in("status", ["pending", "paid"]).not("tier_id", "is", null).lte("due_date", today).limit(500);
    const orgs = [...new Set((reached ?? []).map((b) => b.org_id))];
    if (orgs.length) {
      const { data: on } = await admin.from("referral_settings").select("org_id, drawing_enabled").in("org_id", orgs);
      const enabled = new Set((on ?? []).filter((s) => s.drawing_enabled).map((s) => s.org_id));
      const rows = (reached ?? []).filter((b) => enabled.has(b.org_id) && b.due_date).map((b) => ({
        org_id: b.org_id, bonus_id: b.id, applicant_id: b.applicant_id, referrer_id: b.referrer_id, quarter: quarterKey(b.due_date!),
      }));
      if (rows.length) {
        const { data: ins } = await admin.from("referral_drawing_entries").upsert(rows, { onConflict: "bonus_id", ignoreDuplicates: true }).select("id");
        entries = ins?.length ?? 0;
      }
    }
  } catch (e) {
    console.error("referral bonus alerts failed", e);
  }
  return { referralBonusesDue: sent, referralDrawingEntries: entries };
}
