/** Where an applicant came from. Stored on applications.source as the key. */
export const SOURCES = [
  { key: "referral", label: "Referral" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "job_board", label: "Job board" },
  { key: "own_site", label: "Our website" },
  { key: "walk_in", label: "Walk-in" },
  { key: "other", label: "Other" },
] as const;
export type SourceKey = (typeof SOURCES)[number]["key"];

const JOB_BOARDS = ["indeed", "ziprecruiter", "glassdoor", "monster", "careerbuilder", "craigslist", "simplyhired", "snagajob", "job_board", "jobboard", "facebook"];

/** Map any stored or tracked value (e.g. "indeed", "careers", "?source=LinkedIn") to a category. */
export function sourceKey(raw: string | null | undefined): SourceKey {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return "own_site";
  if (SOURCES.some((x) => x.key === s)) return s as SourceKey;
  if (s.includes("refer")) return "referral";
  if (s.includes("linkedin")) return "linkedin";
  if (JOB_BOARDS.some((b) => s.includes(b))) return "job_board";
  if (["careers", "career", "website", "site", "web", "direct", "own_site"].includes(s)) return "own_site";
  if (s.includes("walk")) return "walk_in";
  return "other";
}

export const sourceLabel = (raw: string | null | undefined) =>
  SOURCES.find((x) => x.key === sourceKey(raw))!.label;
