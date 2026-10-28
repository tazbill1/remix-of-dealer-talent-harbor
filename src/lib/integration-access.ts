import type { OrgCtx } from "@/lib/org";

// Presentation gating only; existing RLS and server checks remain authoritative.
export function canEditIntegrationSettings(org: Pick<OrgCtx, "role" | "isPlatformAdmin">) {
  return org.isPlatformAdmin || org.role === "group_admin" || org.role === "recruiter";
}