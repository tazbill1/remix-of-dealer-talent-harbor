/** Applicant card tags: only the most important flag shows; the rest fold into "+N". */
export const CARD_FLAG_ORDER = ["dnh", "overdue", "attention", "duplicate", "pool", "referral", "source", "knockout", "background"] as const;
export type CardFlag = (typeof CARD_FLAG_ORDER)[number];

export function orderCardFlags(present: Partial<Record<CardFlag, boolean>>): { top: CardFlag | null; rest: CardFlag[] } {
  const list = CARD_FLAG_ORDER.filter((f) => present[f]);
  return { top: list[0] ?? null, rest: list.slice(1) };
}
