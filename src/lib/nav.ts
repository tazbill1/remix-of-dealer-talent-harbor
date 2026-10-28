/** Which menu pages a person can actually use. Mirrors access rules; the database still enforces them. */
export type NavRole = { role: string; isPlatformAdmin: boolean };

const isStoreRole = (role: string) => role === "dealer_manager" || role === "hiring_manager";
const isHr = (r: NavRole) => r.isPlatformAdmin || r.role === "group_admin" || r.role === "recruiter";

/** HR / group admin / platform admin only pages (never shown to GMs, hiring managers or regional leaders). */
const HR_ONLY = new Set(["/consents", "/adverse-actions", "/templates", "/automations", "/status-rules", "/integrations", "/onboarding-templates", "/duplicates"]);

export function canSeeNav(path: string, r: NavRole): boolean {
  if (r.isPlatformAdmin) return true;
  if (path === "/team") return r.role === "group_admin";
  if (HR_ONLY.has(path)) return isHr(r);
  if (path === "/referrals") return isHr(r) || r.role === "regional_leader";
  if (path === "/events") return isHr(r) || isStoreRole(r.role);
  if (path === "/new-hires") return r.role !== "regional_leader";
  return true;
}
