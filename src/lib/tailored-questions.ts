/**
 * AI-written interview questions for one applicant, drawn from their resume, application answers
 * and text conversation. Shown next to the role's interview kit; they're prompts for the
 * interviewer, not scored. Anything touching a protected characteristic is dropped twice: the AI
 * is told not to ask, and `protectedTopic` filters what comes back.
 */
import { z } from "zod";

export const tailoredQuestionSchema = z.object({
  text: z.string().trim().min(8).max(300),
  /** What in their background prompted it, so the interviewer knows where it came from. */
  why: z.string().trim().max(240),
});
export type TailoredQuestion = z.infer<typeof tailoredQuestionSchema>;
export const tailoredOutputSchema = z.object({ questions: z.array(tailoredQuestionSchema) });

export const MAX_TAILORED = 6;

// Michigan (pilot stores) also protects height, weight, marital status and arrests without a
// conviction, on top of the federal list.
const PROTECTED: RegExp[] = [
  /\b(how old|your age|age\b|born|birth ?(date|day|year)|year you graduated|(what year|when) did you graduate|graduation (year|date)|retire)/i,
  /\b(married|marital|spouse|husband|wife|partner'?s|divorc|single parent)/i,
  /\b(kids?|child(ren)?|childcare|daycare|babysit|pregnan|maternity|paternity|family plans?|start a family|expecting)\b/i,
  /\b(health|medical|disab\w*|illness|sick|injur\w*|surgery|medication|medical condition|mental|therapy|rehab|workers'? comp|doctor)/i,
  /\b(relig\w*|church|mosque|synagogue|temple|pray\w*|sabbath|faith|holy days?)\b/i,
  /\b(race|racial|ethnic\w*|national origin|where (are you|were you) (from|born)|native language|accent|citizen\w*|immigra\w*|visa|green card)\b/i,
  /\b(gender|sex\b|sexual|orientation|pronouns?|transgender)\b/i,
  /\b(height|how tall|weight|how much do you weigh)\b/i,
  /\b(arrest\w*|criminal record|convict\w*|jail|prison|felon\w*|background check)\b/i,
  /\b(genetic|military discharge|discharge type|union member\w*|political|vote|voting)\b/i,
];

/** True when a question touches a topic interviewers must not ask about. */
export function protectedTopic(text: string): boolean {
  return PROTECTED.some((re) => re.test(text));
}

/** Clean what the AI returned: valid, no protected topics, no duplicates, at most 6. */
export function keepSafeQuestions(raw: unknown): TailoredQuestion[] {
  const list = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list
    .flatMap((q) => {
      const r = tailoredQuestionSchema.safeParse(q);
      return r.success ? [r.data] : [];
    })
    .filter((q) => !protectedTopic(q.text) && !protectedTopic(q.why))
    .filter((q) => {
      const key = q.text.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TAILORED);
}

export type TextLine = { direction: string; body: string; created_at: string };

/** The applicant's own text conversation, oldest first, trimmed to fit. */
export function conversationForAi(lines: TextLine[], firstName: string, maxChars = 6000) {
  const out: string[] = [];
  let used = 0;
  for (const m of [...lines].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const line = `${m.direction === "inbound" ? firstName : "Us"}: ${m.body.replace(/\s+/g, " ").trim()}`;
    if (used + line.length > maxChars) break;
    out.unshift(line);
    used += line.length + 1;
  }
  return out.join("\n");
}

export function tailoredSystemPrompt() {
  return `You help car dealership managers prepare for a job interview. Write ${MAX_TAILORED - 2} to ${MAX_TAILORED} interview questions tailored to THIS applicant, based only on what's in their resume, application answers and text messages.
Good questions dig into specifics: short stays or gaps in work history ("You left your last shop after 8 months. What happened?"), job changes, claims worth backing up (certifications, sales numbers, tools), things they said by text, or how their experience fits this role.
Rules:
- Each question must point to something real in their background. Never invent facts. If there's little to go on, ask about their experience for this role.
- Don't repeat the role's standard interview kit questions (listed below if there is one).
- Never ask about or mention age, birth or graduation year, marital or family status, children or childcare, pregnancy, health, disability, injuries, religion, race, national origin or citizenship, gender, sexual orientation, height, weight, arrests or criminal history, military discharge, union or political activity. If a gap or short stay could be for one of those reasons, ask neutrally about the work ("What were you doing between jobs?") and nothing more.
- Plain, friendly wording a manager can read out loud, one question per item, under 30 words.
- "why": a few words on what prompted it, e.g. "8 months at Smith Ford (2024)". Keep it factual and neutral.`;
}

export function tailoredUserPrompt(p: {
  role: string;
  kitQuestions: string[];
  screening: string;
  profile: unknown;
  summary: string | null;
  conversation: string;
  resumeNote: string;
}) {
  const profile =
    p.profile && typeof p.profile === "object" && Object.keys(p.profile).length
      ? JSON.stringify(p.profile).slice(0, 3000)
      : "";
  return [
    `Role: ${p.role}`,
    p.kitQuestions.length && `Standard kit questions (don't repeat):\n${p.kitQuestions.map((q) => `- ${q}`).join("\n")}`,
    p.screening && `Application answers:\n${p.screening}`,
    profile && `What we've learned so far: ${profile}`,
    p.summary && `Hiring team summary: ${p.summary.slice(0, 1200)}`,
    p.conversation && `Text conversation with the applicant:\n${p.conversation}`,
    p.resumeNote,
  ]
    .filter(Boolean)
    .join("\n\n");
}
