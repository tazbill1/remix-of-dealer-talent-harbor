/**
 * LinkedIn profile links on applicants. One normalizer shared by the public
 * apply form and the staff panel so both accept and store the same shape.
 */

export const LINKEDIN_ERROR = "Please paste your LinkedIn profile link (linkedin.com/in/…)";

/**
 * Accepts a linkedin.com/in/ profile link with or without "https://" or "www.",
 * strips tracking bits after "?" (and any "#..."), and returns the canonical
 * https://www.linkedin.com/in/... form. Returns null for anything else.
 */
export function normalizeLinkedInUrl(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && host !== "www.linkedin.com") return null;
  const match = /^\/in\/([A-Za-z0-9][A-Za-z0-9\-_%]*)\/?$/.exec(url.pathname);
  if (!match) return null;
  return `https://www.linkedin.com/in/${match[1]}`;
}
