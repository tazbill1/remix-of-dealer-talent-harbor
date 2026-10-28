// Rules for recruiters adding a candidate by hand (pure, tested).
export const RESUME_MAX_BYTES = 10 * 1024 * 1024;
const EXTS = ["pdf", "doc", "docx"] as const;

export function resumeExtension(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return fileName.includes(".") && (EXTS as readonly string[]).includes(ext) ? ext : null;
}

/** Same pattern the public apply form uses: <org>/<application>/resume.<ext>. */
export function resumeStoragePath(orgId: string, appId: string, fileName: string): string | null {
  const ext = resumeExtension(fileName);
  return ext ? `${orgId}/${appId}/resume.${ext}` : null;
}

type Role = "group_admin" | "dealer_manager" | "hiring_manager" | "recruiter" | "regional_leader";
/** Who sees "Add candidate": HR / Recruiter, group admins, platform admins, GMs and hiring managers. */
export function canAddCandidate(role: Role | null | undefined, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || role === "group_admin" || role === "recruiter" || role === "dealer_manager" || role === "hiring_manager";
}
