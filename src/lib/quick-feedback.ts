export const feedbackChecks = [
  ["onTime", "Showed up on time"],
  ["experience", "Relevant experience"],
  ["culture", "Good culture fit"],
  ["recommend", "Would recommend"],
] as const;
export type QuickFeedback = { rating: number | null; onTime: boolean | null; experience: boolean | null; culture: boolean | null; recommend: boolean | null; recommendation: string | null; notes: string };
export function feedbackProblem(f: QuickFeedback) {
  if (f.rating !== null && (!Number.isInteger(f.rating) || f.rating < 1 || f.rating > 5)) return "Choose a rating from 1 to 5.";
  if (f.recommendation !== null && !["hire", "maybe", "pass"].includes(f.recommendation)) return "Choose Hire, Maybe or Pass.";
  if (f.notes.length > 2000) return "Notes must be 2000 characters or fewer.";
  return null;
}
export function feedbackSummary(rating: number | null, recommendation: string | null, author: string | null) {
  const choice = recommendation ? recommendation.charAt(0).toUpperCase() + recommendation.slice(1) : "No pick";
  return `${rating ?? "—"}/5 · ${choice} · by ${author || "Interviewer"}`;
}