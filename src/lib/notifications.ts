/** In-app alerts: wording and who gets them. Pure, tested. */
import type { Automations } from "@/lib/automations";

export type Member = { id: string; user_id: string; role: string; email: string | null };
export type Scope = { member_id: string; dealership_id: string | null; region_id: string | null };

export const wantsPersonMessage = (applicant: string, store: string) =>
  `${applicant.trim() || "An applicant"} wants to talk with a person — ${store.trim() || "your store"}.`;

/** Email alerts for "wants a person" are off unless the group turns them on. */
export const humanAlertEmailOn = (a: Automations) => a.humanAlert?.email === true;

/**
 * Hiring managers and GMs assigned to the store (directly or via its region);
 * if none, the group's recruiters (HR); if none of those, group admins.
 */
export function wantsPersonRecipients(
  members: Member[],
  scopes: Scope[],
  store: { id: string; region_id: string | null },
): Member[] {
  const covers = (m: Member) =>
    scopes.some(
      (s) => s.member_id === m.id && (s.dealership_id === store.id || (!!store.region_id && s.region_id === store.region_id)),
    );
  const local = members.filter((m) => (m.role === "hiring_manager" || m.role === "dealer_manager") && covers(m));
  if (local.length) return dedupe(local);
  const hr = members.filter((m) => m.role === "recruiter");
  if (hr.length) return dedupe(hr);
  return dedupe(members.filter((m) => m.role === "group_admin"));
}

function dedupe(ms: Member[]) {
  const seen = new Set<string>();
  return ms.filter((m) => (seen.has(m.user_id) ? false : (seen.add(m.user_id), true)));
}
