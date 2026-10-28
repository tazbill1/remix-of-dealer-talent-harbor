// How the texting assistant sounds, what history it sees, and what it may never text.
// Pure helpers so the rules are tested without the AI.

export type ChatMsg = { role: "user" | "assistant"; content: string };
type HistoryRow = { party: string; direction: string; body: string; status?: string | null };

/** Recent turns of ONE conversation (candidate or manager), oldest first. Back-to-back texts
 * from the same side are joined so the AI sees a normal back-and-forth. */
export function threadHistory(rows: HistoryRow[], party: string, limit = 30): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const m of rows) {
    if (m.party !== party || m.status === "blocked" || !m.body?.trim()) continue;
    const role: ChatMsg["role"] = m.direction === "in" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last?.role === role) last.content += `\n${m.body}`;
    else out.push({ role, content: m.body });
  }
  return out.slice(-limit);
}

/** Adds the new inbound text, joining it onto a trailing inbound turn if there is one. */
export function withInbound(history: ChatMsg[], body: string): ChatMsg[] {
  const out = history.map((m) => ({ ...m }));
  const last = out[out.length - 1];
  if (last?.role === "user") last.content += `\n${body}`;
  else out.push({ role: "user", content: body });
  return out;
}

export const CANDIDATE_STYLE = `How to text like a real person:
- Answer what they asked first, then ask your next question (one at a time).
- React briefly and specifically to what they just said, so they know you read it.
- After the first message, don't greet them again, re-introduce yourself, or sign off.
- Use their first name now and then, not in every text.
- Match their length and energy. Short texts get short replies; usually one or two sentences.
- Plain, warm words with contractions. No corporate phrases ("Thank you for your interest", "Great question", "I hope this finds you well"), no lists or formatting, at most one exclamation point, emojis only if they use them first.
- Never re-ask something they already told you, and don't reuse your earlier wording.
- If you don't know something, say you'll check with the team.`;

export function managerPrivacy(firstName: string, profileUrl: string) {
  return `Privacy (strict, texts are not secure): never text this applicant's phone number, email, home address, date of birth, Social Security number, current or past pay, background-check details, or interview scorecard notes. Call them "${firstName}" plus their role. When the manager asks for details like these, or for anything you can't text, send the profile link instead: ${profileUrl}
Keep manager texts short and to the point, like a sharp coworker.`;
}

/** Link that opens one applicant's profile in the app (login and store access required). */
export function profileUrl(base: string, applicationId: string) {
  return `${base.replace(/\/$/, "")}/applicants?applicant=${applicationId}`;
}

export function firstName(fullName: string | null | undefined) {
  return fullName?.trim().split(/\s+/)[0] || "the applicant";
}

const URL_RE = /https?:\/\/\S+/g;
const PII_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, // email
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, // phone
  /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Za-z0-9]+\s+){0,3}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Cir|Circle|Pkwy|Parkway|Hwy|Highway|Ter|Terrace)\b\.?(?:\s+(?:Apt|Unit|#)\s*\w+)?/gi, // street address
];

/** Last line of defense for texts to managers: swaps any email, phone number, SSN or
 * street address for "(in their profile)". Links are left alone. */
export function scrubPii(text: string): { text: string; removed: boolean } {
  const urls: string[] = [];
  let out = text.replace(URL_RE, (u) => `\u0000${urls.push(u) - 1}\u0000`);
  const before = out;
  for (const re of PII_PATTERNS) out = out.replace(re, "(in their profile)");
  const removed = out !== before;
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => urls[Number(i)] ?? "");
  return { text: out, removed };
}
