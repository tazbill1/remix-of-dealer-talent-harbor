import type { NavRole } from "@/lib/nav";

export type BulkChannel = "email" | "text" | "both";
export function canSendBulk(r: NavRole, enabled: boolean) {
  return enabled && (r.isPlatformAdmin || ["group_admin", "recruiter", "dealer_manager", "hiring_manager"].includes(r.role));
}
export function summarizeBulkEligibility(rows: { email?: string | null; text?: string | null }[], channel: BulkChannel) {
  const channels = channel === "both" ? ["email", "text"] as const : [channel];
  const reasons: Record<string, number> = {};
  let eligible = 0;
  const perChannel = channels.map((ch) => {
    let sending = 0;
    for (const row of rows) {
      const reason = row[ch];
      if (reason) reasons[reason] = (reasons[reason] ?? 0) + 1;
      else sending++;
    }
    return { channel: ch, sending, skipped: rows.length - sending };
  });
  for (const row of rows) if (channels.some((ch) => !row[ch])) eligible++;
  return { eligible, selected: rows.length, skipped: rows.length - eligible, reasons, perChannel };
}
export const bulkReasonLabel = (reason: string) => ({
  "Text opt-out": "opted out of texts", "Email opt-out": "opted out of email",
  "No text consent": "no text consent", "No valid email address": "no valid email",
  "No valid mobile number": "no valid mobile number", "Applicant unavailable": "unavailable",
  "Archived applicant": "archived", "Live bulk email service not configured": "live bulk email unavailable",
}[reason] ?? reason);