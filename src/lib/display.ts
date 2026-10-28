/** Display-only helpers: wording and labels. Nothing here changes stored values. */

/** "1 applicant", "2 applicants" — pass an irregular plural as the third arg. */
export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

const SOURCE_NAMES: Record<string, string> = {
  own_site: "Careers site",
  "walk-in": "Walk-in",
  walk_in: "Walk-in",
  indeed: "Indeed",
  ziprecruiter: "ZipRecruiter",
  glassdoor: "Glassdoor",
  referral: "Referral",
  linkedin: "LinkedIn",
  job_board: "Job board",
};

/** Friendly name for an applicant source. Stored values stay as they are. */
export function sourceLabel(source: string | null | undefined): string {
  const raw = (source ?? "").trim();
  if (!raw) return "Unknown";
  const known = SOURCE_NAMES[raw.toLowerCase()];
  if (known) return known;
  const words = raw.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Test applicants (e.g. "Tom Contact Test") are hidden by default, never deleted. */
export function isTestName(fullName: string | null | undefined): boolean {
  return /test/i.test(fullName ?? "");
}
