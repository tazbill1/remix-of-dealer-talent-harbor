// "Ask" assistant for managers: pure helpers (ranking, safe applicant summaries, prompt, links).
// Data access lives in gm-assistant.functions.ts and always runs as the signed-in user.
import { summarizeScorecards } from "@/lib/interview-kits";

export type ScorecardRow = {
  application_id: string;
  answers: unknown;
  recommendation: string | null;
  submitted_at: string | null;
};

export type ApplicantRow = {
  id: string;
  full_name: string;
  status: string;
  rating: number | null;
  created_at: string;
  knockout_failed: boolean;
  ai_summary: string | null;
  jobs: { title: string; department: string } | null;
  dealerships: { name: string } | null;
};

export const applicantPath = (id: string) => `/applicants?applicant=${id}`;

/** What the AI may see about an applicant. No phone, email, address or resume. */
export function safeApplicant(a: ApplicantRow, cards: ScorecardRow[] = []) {
  const s = summarizeScorecards(cards.filter((c) => c.application_id === a.id));
  return {
    id: a.id,
    name: a.full_name,
    role: a.jobs?.title ?? null,
    store: a.dealerships?.name ?? null,
    stage: a.status,
    rating: a.rating,
    applied: a.created_at.slice(0, 10),
    missed_a_requirement: a.knockout_failed,
    scorecards: s.submitted
      ? { submitted: s.submitted, average: s.average, hire: s.hire, maybe: s.maybe, no: s.no }
      : null,
    summary: a.ai_summary ? a.ai_summary.slice(0, 400) : null,
    link: applicantPath(a.id),
  };
}

const STAGE_POINTS: Record<string, number> = { new: 0, screening: 1, interview: 2, offer: 2 };

/** Best open candidates first: interview feedback, then rating, stage and how recent. */
export function rankCandidates(rows: ApplicantRow[], cards: ScorecardRow[], now = Date.now()) {
  const score = (a: ApplicantRow) => {
    const s = summarizeScorecards(cards.filter((c) => c.application_id === a.id));
    const days = Math.max(0, (now - Date.parse(a.created_at)) / 86_400_000);
    return (
      (a.rating ?? 2.5) * 2 +
      (s.average ?? 0) +
      s.hire * 3 +
      s.maybe -
      s.no * 4 +
      (STAGE_POINTS[a.status] ?? 0) -
      (a.knockout_failed ? 5 : 0) -
      Math.min(days, 60) / 20
    );
  };
  return rows
    .filter((a) => a.status !== "hired" && a.status !== "rejected")
    .map((a) => ({ a, s: score(a) }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);
}

export function askSystemPrompt(input: { now: string; timeZone: string; name: string | null }) {
  return `You are the hiring assistant inside hireme, helping ${input.name ?? "a manager"} at a car dealership group.
Answer questions about their applicants, interviews and open roles using the tools. You only see the stores this person has access to; never guess about anything the tools didn't return.
Right now: ${input.now} (their time zone: ${input.timeZone}). Work out date ranges like "last week" (Monday to Sunday) yourself and pass ISO dates to the tools.
"Who did I interview" means interviews at their stores in that range; mention which ones they scored.
When asked for good candidates, use find_top_candidates and give a one-line reason for each pick (feedback, rating, experience from the summary). If it found fewer than asked, say so.
Write short, plain answers. Link every applicant you name as a markdown link to their "link", e.g. [Sam Jones](/applicants?applicant=...). No tables. Never write phone numbers, emails or home addresses.
You can't text, email, move or change anyone; if asked, say how to do it in the app instead.`;
}

export type Segment = { text: string; href?: string };

/** Splits "[label](/path)" links out of a reply. Only in-app paths become links. */
export function parseLinks(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[1] ?? "", href: m[2] ?? "/" });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
