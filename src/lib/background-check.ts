/**
 * Background-check tracking on an application (no vendor yet). HR sets the status by hand;
 * each change is logged to application_events so the timeline shows who moved it and when.
 */
export const BG_STATUSES = ["requested", "in_progress", "clear", "flagged"] as const;
export type BgStatus = (typeof BG_STATUSES)[number];

export const BG_LABEL: Record<BgStatus, string> = {
  requested: "Requested",
  in_progress: "In progress",
  clear: "Clear",
  flagged: "Flagged",
};

/** Tailwind classes for the status pill, using the brand tokens. */
export const BG_TONE: Record<BgStatus, string> = {
  requested: "bg-accent text-foreground",
  in_progress: "bg-sapphire/15 text-sapphire",
  clear: "bg-lime/20 text-foreground",
  flagged: "bg-destructive/15 text-destructive",
};

export const BG_EVENT_KIND = "background_check";

export function isBgStatus(v: unknown): v is BgStatus {
  return typeof v === "string" && (BG_STATUSES as readonly string[]).includes(v);
}

/** Reads the stored value; anything unknown counts as "not started". */
export function bgStatusOf(v: unknown): BgStatus | null {
  return isBgStatus(v) ? v : null;
}

export function bgEventMessage(to: BgStatus | null, note?: string | null) {
  const head = to ? `Background check: ${BG_LABEL[to]}` : "Background check cleared from profile";
  const n = note?.trim();
  return n ? `${head} — ${n}` : head;
}

/**
 * The fields to save when HR changes the status or note. Returns null when nothing changed,
 * so the profile doesn't write or log a no-op.
 */
export function bgPatch(
  current: { status: unknown; note: string | null },
  next: { status: BgStatus | null; note: string | null },
  now = new Date(),
) {
  const note = next.note?.trim() || null;
  const prevStatus = bgStatusOf(current.status);
  if (prevStatus === next.status && (current.note?.trim() || null) === note) return null;
  return {
    background_check_status: next.status,
    background_check_note: next.status ? note : null,
    background_check_updated_at: next.status ? now.toISOString() : null,
  };
}
