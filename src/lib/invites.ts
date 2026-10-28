/**
 * Team invites: the rules, kept apart from the database so they're easy to test.
 * HR invites someone by email with a role and the stores/regions they cover; the
 * person signs in with that same email and joins with exactly that access.
 */
import { z } from "zod";

export const ROLES = [
  { v: "group_admin", l: "Group admin", scoped: false },
  { v: "recruiter", l: "Recruiter / HR", scoped: false },
  { v: "regional_leader", l: "Regional leader", scoped: true },
  { v: "dealer_manager", l: "Dealer manager (GM)", scoped: true },
  { v: "hiring_manager", l: "Hiring manager", scoped: true },
] as const;
export type Role = (typeof ROLES)[number]["v"];
export const roleLabel = (r: string) => ROLES.find((x) => x.v === r)?.l ?? r;
/** Roles that only see the stores/regions they're given. */
export const isScopedRole = (r: string) => !!ROLES.find((x) => x.v === r)?.scoped;

export const scopeSchema = z.union([
  z.object({ dealership_id: z.string().uuid() }).strict(),
  z.object({ region_id: z.string().uuid() }).strict(),
]);
export type Scope = z.infer<typeof scopeSchema>;

export const inviteInput = z
  .object({
    orgId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email().max(200),
    role: z.enum(ROLES.map((r) => r.v) as [Role, ...Role[]]),
    scopes: z.array(scopeSchema).max(100).default([]),
    /** Optional: their private calendar link, linked when they accept. */
    calendarUrl: z.string().trim().max(1000).optional().default(""),
  })
  .refine((d) => !isScopedRole(d.role) || d.scopes.length > 0, {
    message: "Pick at least one store or region this person covers.",
    path: ["scopes"],
  });
export type InviteInput = z.input<typeof inviteInput>;

export type InviteRow = {
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
export type InviteStatus = "open" | "expired" | "accepted" | "cancelled";

export function inviteStatus(i: InviteRow, now = Date.now()): InviteStatus {
  if (i.accepted_at) return "accepted";
  if (i.revoked_at) return "cancelled";
  if (Date.parse(i.expires_at) <= now) return "expired";
  return "open";
}

/** Whether this signed-in person may accept the invite. */
export function canAccept(i: InviteRow, userEmail: string | null | undefined, now = Date.now()) {
  const status = inviteStatus(i, now);
  if (status !== "open")
    return {
      ok: false as const,
      reason:
        status === "expired"
          ? "This invite has expired. Ask your HR team to send a new one."
          : status === "accepted"
            ? "This invite has already been used."
            : "This invite was cancelled.",
    };
  if (!userEmail || userEmail.trim().toLowerCase() !== i.email.trim().toLowerCase())
    return {
      ok: false as const,
      reason: `This invite is for ${i.email}. Sign in with that email to accept it.`,
    };
  return { ok: true as const };
}

export function inviteEmail(a: {
  orgName: string;
  role: string;
  link: string;
  inviter: string | null;
}) {
  return {
    subject: `You're invited to ${a.orgName} on hireme`,
    text: [
      `Hi,`,
      `${a.inviter ? `${a.inviter} invited you` : "You've been invited"} to join ${a.orgName} on hireme by WerkandMe as ${roleLabel(a.role)}.`,
      `hireme keeps hiring moving: you'll get texts about new applicants for your stores and can reply 1 to interview or 2 to pass.`,
      `Accept your invite (sign in or create an account with this email address):\n${a.link}`,
      `This link expires in 14 days.`,
    ].join("\n\n"),
  };
}
