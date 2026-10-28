/** AI-use disclosure for candidates: the apply-form notice, the first-message line, and HUMAN replies. Pure, tested. */

export const AI_NOTICE_TEXT =
  "How we use AI: This employer uses hireme, which includes an AI assistant that helps screen applications, answer questions, and schedule interviews. A person on the hiring team reviews applicants and makes every hiring decision. You can ask to talk with a person instead at any time.";
export const AI_NOTICE_VERSION = "2026-10-28";
export const WANTS_PERSON = "Wants a person";

/** The line added to Penny's first text and first email to a new applicant. */
export function aiDisclosureLine(assistant: string | null | undefined, store: string | null | undefined) {
  return `I'm ${assistant?.trim() || "Penny"}, an AI assistant for ${store?.trim() || "our store"}. A person on our team makes all hiring decisions. Reply HUMAN anytime to reach a person.`;
}

/** Adds the disclosure line (before "Reply STOP" when present) unless it's already there. */
export function withAiDisclosure(body: string, assistant: string | null | undefined, store: string | null | undefined) {
  if (/Reply HUMAN/i.test(body)) return body;
  const line = aiDisclosureLine(assistant, store);
  const i = body.search(/Reply STOP/i);
  return i >= 0 ? `${body.slice(0, i)}${line} ${body.slice(i)}` : `${body} ${line}`;
}

/** A reply asking for a person: "HUMAN" (or "human please", "a person"). */
export function isHumanRequest(body: string) {
  const t = body.trim().toUpperCase().replace(/[.!?\s]+$/g, "");
  return /^(HUMAN|PERSON|A PERSON|HUMAN PLEASE|REAL PERSON)$/.test(t);
}
