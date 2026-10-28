/** Keeps a ?ref= code for this careers site while the candidate browses to a job (browser only). */
import { cleanCode } from "@/lib/referrals";

const key = (slug: string) => `wm_ref:${slug}`;

export function rememberReferral(slug: string, ref?: string, via?: string) {
  const code = cleanCode(ref);
  if (!code || typeof window === "undefined") return;
  try { sessionStorage.setItem(key(slug), JSON.stringify({ code, via: via === "qr" ? "qr" : "link" })); } catch { /* storage blocked */ }
}

export function recallReferral(slug: string): { code: string; via: "link" | "qr" } | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(sessionStorage.getItem(key(slug)) ?? "null") as { code?: string; via?: string } | null;
    const code = cleanCode(v?.code);
    return code ? { code, via: v?.via === "qr" ? "qr" : "link" } : null;
  } catch { return null; }
}
