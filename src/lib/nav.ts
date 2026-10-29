/** Which menu pages a person can actually use. Mirrors access rules; the database still enforces them. */
export type NavRole = { role: string; isPlatformAdmin: boolean };

const isStoreRole = (role: string) => role === "dealer_manager" || role === "hiring_manager";
const isHr = (r: NavRole) => r.isPlatformAdmin || r.role === "group_admin" || r.role === "recruiter";

/** HR / group admin / platform admin only pages (never shown to GMs, hiring managers or regional leaders). */
const HR_ONLY = new Set(["/consents", "/adverse-actions", "/templates", "/automations", "/status-rules", "/integrations", "/onboarding-templates", "/duplicates"]);

export function canSeeNav(path: string, r: NavRole): boolean {
  if (r.isPlatformAdmin) return true;
  if (path === "/sent-messages") return isHr(r) || isStoreRole(r.role);
  if (path === "/team") return r.role === "group_admin";
  if (HR_ONLY.has(path)) return isHr(r);
  if (path === "/referrals") return isHr(r) || isStoreRole(r.role) || r.role === "regional_leader";
  if (path === "/events") return isHr(r) || isStoreRole(r.role);
  if (path === "/new-hires") return r.role !== "regional_leader";
  return true;
}

/** Settings page tabs, in order, with the role check for each. */
export const SETTINGS_TABS = [
  { id: "rules", label: "Status rules", path: "/status-rules" },
  { id: "templates", label: "Templates", path: "/templates" },
  { id: "texts", label: "Automatic texts", path: "/automations" },
  { id: "onboarding", label: "Onboarding templates", path: "/onboarding-templates" },
  { id: "videos", label: "Videos", path: "/settings/videos" },
  { id: "referrals", label: "Employee referral bonus", path: "/settings/referrals" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export function settingsTabsFor(r: NavRole) {
  // Videos: HR edit all, GMs/hiring managers their stores, regional leaders view.
  return SETTINGS_TABS.filter((t) => t.id === "videos" ? true : t.id === "referrals" ? isHr(r) : canSeeNav(t.path, r));
}
