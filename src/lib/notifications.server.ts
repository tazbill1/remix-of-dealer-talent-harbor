/** Creates in-app alerts (and the optional manager email). Server-only; never throws. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { parseAutomations } from "@/lib/automations";
import { loadEmailSettings } from "@/lib/email/outbox.server";
import { appBaseUrl } from "@/lib/email/provider.server";
import { humanAlertEmailOn, wantsPersonMessage, wantsPersonRecipients } from "@/lib/notifications";

type DB = SupabaseClient<Database>;

export async function notifyWantsPerson(
  admin: DB,
  app: { id: string; org_id: string; dealership_id: string; full_name: string },
) {
  try {
    const [{ data: store }, { data: members }, { data: scopes }, { data: settings }, { data: org }] = await Promise.all([
      admin.from("dealerships").select("id, name, region_id").eq("id", app.dealership_id).maybeSingle(),
      admin.from("org_members").select("id, user_id, role, email").eq("org_id", app.org_id),
      admin.from("org_member_scopes").select("member_id, dealership_id, region_id").eq("org_id", app.org_id),
      admin.from("messaging_settings").select("automations").eq("org_id", app.org_id).maybeSingle(),
      admin.from("organizations").select("name").eq("id", app.org_id).maybeSingle(),
    ]);
    const storeName = store?.name ?? "your store";
    const to = wantsPersonRecipients(members ?? [], scopes ?? [], { id: app.dealership_id, region_id: store?.region_id ?? null });
    const message = wantsPersonMessage(app.full_name, storeName);
    if (to.length)
      await admin.from("notifications").insert(
        to.map((m) => ({
          org_id: app.org_id, store_id: app.dealership_id, recipient_id: m.user_id,
          type: "wants_person", application_id: app.id, message,
        })),
      );
    if (!humanAlertEmailOn(parseAutomations(settings?.automations))) return to.length;
    const emailSettings = await loadEmailSettings(admin, app.org_id);
    const { sendStaffEmail } = await import("@/lib/weekly-summary.server");
    const appUrl = appBaseUrl();
    for (const m of to) {
      if (!m.email) continue;
      await sendStaffEmail(admin, emailSettings, {
        orgId: app.org_id, to: m.email, subject: message, footerName: org?.name ?? storeName, appUrl,
        body: `${message}\n\nOpen the applicant: ${appUrl}/applicants?applicant=${app.id}&tab=messages\n\nNo texts were sent. Reply to the candidate from hireme.`,
        key: `wants-person-${app.id}-${m.user_id}`,
      });
    }
    return to.length;
  } catch (e) {
    console.error("wants-a-person alert failed", e);
    return 0;
  }
}
