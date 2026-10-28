/**
 * The manager's "Your to-do" list on the dashboard. Pure functions over rows the signed-in
 * user can already read (store access rules decide which stores), so the list and the
 * manager texts agree: "Decide" is exactly who the summary / nudge texts are about.
 */
import { isOpen } from "@/lib/offers";
import { PURPOSE } from "@/lib/workflows/rules";

const DAY = 24 * 3600e3;
/** Older interviews without a scorecard drop off the list (no backlog of ancient ones). */
export const SCORECARD_LOOKBACK_DAYS = 14;

export type TodoApp = {
  id: string;
  full_name: string;
  status: string;
  created_at: string;
  needs_attention: string | null;
  dealership_id: string;
  job_id: string;
};
export type TodoMsg = { application_id: string; party: string; direction: string; purpose: string | null; created_at: string };
export type TodoInterview = { id: string; application_id: string; starts_at: string; duration_min: number; status: string };
export type TodoCard = { interview_id: string; submitted_at: string | null };
export type TodoOffer = { application_id: string; status: string; is_offer_letter: boolean; created_at: string };

export type TodoKind = "call" | "decide" | "scorecard" | "offer_out" | "offer_ready";
export type TodoItem = {
  kind: TodoKind;
  applicationId: string;
  interviewId?: string;
  /** When the thing started waiting, for "3 days" and oldest-first sorting. */
  since: number;
  /** Short reason shown under the name. */
  detail: string;
};

const OPEN = ["new", "screening", "interview", "offer", "other_location", "hiring_event"];

const ago = (since: number, now: number) => {
  const d = Math.floor((now - since) / DAY);
  return d <= 0 ? "today" : d === 1 ? "1 day" : `${d} days`;
};
const when = (since: number, now: number) => (ago(since, now) === "today" ? "today" : `${ago(since, now)} ago`);

export function managerTodo(
  rows: { apps: TodoApp[]; messages: TodoMsg[]; interviews: TodoInterview[]; cards: TodoCard[]; offers: TodoOffer[] },
  now: number,
): TodoItem[] {
  const out: TodoItem[] = [];
  const open = rows.apps.filter((a) => OPEN.includes(a.status));
  const byId = new Map(open.map((a) => [a.id, a]));

  for (const a of open) {
    // Flagged for a person (e.g. replied HUMAN, or the assistant got stuck): someone should call.
    if (a.needs_attention) {
      out.push({ kind: "call", applicationId: a.id, since: Date.parse(a.created_at), detail: a.needs_attention });
      continue;
    }
    // Same group the summary / nudge / escalation texts cover: Screening, waiting on "1 or 2".
    if (a.status === "screening") {
      const mine = rows.messages.filter((m) => m.application_id === a.id && m.party === "manager");
      const summary = mine.find((m) => m.direction === "out" && m.purpose === PURPOSE.summary);
      const since = summary ? Date.parse(summary.created_at) : Date.parse(a.created_at);
      const reminded = mine.some((m) => m.purpose === PURPOSE.nudge || m.purpose === PURPOSE.escalation);
      out.push({
        kind: "decide",
        applicationId: a.id,
        since,
        detail: `Interview or pass? Waiting ${ago(since, now)}${reminded ? " · reminder texted" : ""}`,
      });
    }
  }

  const scored = new Set(rows.cards.filter((c) => c.submitted_at).map((c) => c.interview_id));
  for (const i of rows.interviews) {
    const ends = Date.parse(i.starts_at) + (i.duration_min || 0) * 60e3;
    if (i.status === "cancelled" || ends > now || now - ends > SCORECARD_LOOKBACK_DAYS * DAY) continue;
    if (scored.has(i.id) || !byId.has(i.application_id)) continue;
    out.push({
      kind: "scorecard",
      applicationId: i.application_id,
      interviewId: i.id,
      since: ends,
      detail: `Interviewed ${when(ends, now)}, no scorecard yet`,
    });
  }

  const letters = rows.offers.filter((o) => o.is_offer_letter);
  for (const a of open.filter((x) => !x.needs_attention && (x.status === "offer" || letters.some((o) => o.application_id === x.id)))) {
    const mine = letters.filter((o) => o.application_id === a.id);
    const sent = mine.filter((o) => isOpen(o.status)).sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at))[0];
    if (sent) {
      const since = Date.parse(sent.created_at);
      out.push({ kind: "offer_out", applicationId: a.id, since, detail: `Offer letter sent ${when(since, now)}, not signed yet` });
    } else if (!mine.some((o) => o.status === "signed")) {
      out.push({ kind: "offer_ready", applicationId: a.id, since: Date.parse(a.created_at), detail: "In Offer stage, no offer letter sent" });
    }
  }

  return out.sort((x, y) => x.since - y.since);
}

export const TODO_GROUPS: { kinds: TodoKind[]; title: string }[] = [
  { kinds: ["call"], title: "Call back" },
  { kinds: ["decide"], title: "Decide: interview or pass" },
  { kinds: ["scorecard"], title: "Fill in a scorecard" },
  { kinds: ["offer_out", "offer_ready"], title: "Offers waiting" },
];

/** Applicant panel tab that answers each item. */
export const todoTab = (k: TodoKind) =>
  k === "scorecard" ? ("interview" as const) : k === "offer_out" || k === "offer_ready" ? ("offer" as const) : ("overview" as const);
