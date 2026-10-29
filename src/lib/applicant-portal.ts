/** Pure helpers for the careers-site applicant portal. Never expose internal stage names. */
export const PORTAL_STEPS = ["Applied", "Reviewing", "Interview", "Offer", "Hired"] as const;
export type PortalStage = { step: number; label: string; closed: boolean };

const CLOSED = new Set(["rejected", "unqualified", "do_not_hire"]);

export function portalStage(status: string): PortalStage {
  if (CLOSED.has(status)) return { step: -1, label: "Not moving forward", closed: true };
  const map: Record<string, number> = { new: 0, screening: 1, other_location: 1, hiring_event: 1, interview: 2, offer: 3, hired: 4 };
  const step = map[status] ?? 0;
  return { step, label: PORTAL_STEPS[step], closed: false };
}

/** Finished applications (hired or closed) are history; everything else is current. */
export const isCurrent = (status: string) => !CLOSED.has(status) && status !== "hired";

type Job = { id: string; title: string; department: string | null };
const words = (t: string) => t.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);

/** Open jobs sharing a department or a title word with past applications, minus ones already applied to. */
export function suggestJobs<T extends Job>(applied: Job[], open: T[], limit = 6): T[] {
  const ids = new Set(applied.map((a) => a.id));
  const depts = new Set(applied.map((a) => a.department?.toLowerCase()).filter(Boolean));
  const ws = new Set(applied.flatMap((a) => words(a.title)));
  return open.filter((j) => !ids.has(j.id) && ((j.department && depts.has(j.department.toLowerCase())) || words(j.title).some((w) => ws.has(w)))).slice(0, limit);
}

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) && e.trim().length <= 255;

/** Accept YouTube/Vimeo links and return an embeddable URL, or null. */
export function videoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtube.com") { const v = u.searchParams.get("v"); return v ? `https://www.youtube.com/embed/${v}` : null; }
    if (host === "youtu.be") { const v = u.pathname.slice(1); return v ? `https://www.youtube.com/embed/${v}` : null; }
    if (host === "vimeo.com") { const v = u.pathname.split("/").filter(Boolean)[0]; return v && /^\d+$/.test(v) ? `https://player.vimeo.com/video/${v}` : null; }
    return null;
  } catch { return null; }
}
