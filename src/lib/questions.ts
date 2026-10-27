/**
 * Knockout questions on a job: what the applicant is asked, and (privately) which
 * answers meet the requirement. Answers that don't meet a requirement flag the
 * application for HR; nobody is rejected automatically.
 */
import { z } from "zod";

export const ruleSchema = z.union([
  z.object({ equals: z.enum(["yes", "no"]) }).strict(),
  z.object({ min: z.number().finite() }).strict(),
  z.object({ anyOf: z.array(z.string().max(80)).min(1).max(20) }).strict(),
]);
export type Rule = z.infer<typeof ruleSchema>;

export const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  text: z.string().trim().min(3).max(200),
  kind: z.enum(["yes_no", "number", "choice", "text"]),
  options: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  required: z.boolean().default(true),
  /** The answer(s) that meet the requirement. Never sent to the public job page. */
  rule: ruleSchema.optional(),
});
export type Question = z.infer<typeof questionSchema>;
export const questionsSchema = z.array(questionSchema).max(15);

/** What the public apply form gets: the questions without their rules. */
export type PublicQuestion = Omit<Question, "rule">;
export const toPublic = (qs: Question[]): PublicQuestion[] => qs.map(({ rule: _rule, ...q }) => q);

export function parseQuestions(raw: unknown): Question[] {
  const r = questionsSchema.safeParse(raw);
  return r.success ? r.data : [];
}

export type Answers = Record<string, string>;

/** Check answers against the job's questions. Throws a readable error if one is missing. */
export function cleanAnswers(qs: Question[], raw: Record<string, unknown> | undefined): Answers {
  const out: Answers = {};
  for (const q of qs) {
    const v = raw?.[q.id];
    const s = v === undefined || v === null ? "" : String(v).trim().slice(0, 500);
    if (!s) {
      if (q.required) throw new Error(`Please answer: ${q.text}`);
      continue;
    }
    if (q.kind === "yes_no" && s !== "yes" && s !== "no")
      throw new Error(`Please answer yes or no: ${q.text}`);
    if (q.kind === "number" && !Number.isFinite(Number(s)))
      throw new Error(`Please enter a number: ${q.text}`);
    if (q.kind === "choice" && q.options && !q.options.includes(s))
      throw new Error(`Please pick an option: ${q.text}`);
    out[q.id] = s;
  }
  return out;
}

export type Verdict = "met" | "not_met" | "unanswered" | "info";

export function verdict(q: Question, answer: string | undefined): Verdict {
  if (!q.rule) return "info";
  if (answer === undefined || answer === "") return "unanswered";
  if ("equals" in q.rule) return answer === q.rule.equals ? "met" : "not_met";
  if ("min" in q.rule) return Number(answer) >= q.rule.min ? "met" : "not_met";
  return q.rule.anyOf.includes(answer) ? "met" : "not_met";
}

/** The requirements this applicant didn't meet (question text), for the card and profile. */
export function unmet(qs: Question[], answers: Answers) {
  return qs.filter((q) => verdict(q, answers[q.id]) === "not_met").map((q) => q.text);
}

export function describeRule(q: Question) {
  if (!q.rule) return null;
  if ("equals" in q.rule) return `Needs "${q.rule.equals}"`;
  if ("min" in q.rule) return `Needs ${q.rule.min} or more`;
  return `Needs: ${q.rule.anyOf.join(" or ")}`;
}

export function answerLabel(q: Question, a: string | undefined) {
  if (a === undefined || a === "") return "No answer";
  if (q.kind === "yes_no") return a === "yes" ? "Yes" : "No";
  return a;
}

/** One line per answer for the AI assistant, so it doesn't ask again. */
export function answersForAi(qs: Question[], answers: Answers) {
  return qs
    .map(
      (q) =>
        `${q.text} -> ${answerLabel(q, answers[q.id])}${verdict(q, answers[q.id]) === "not_met" ? " (does not meet requirement)" : ""}`,
    )
    .join("\n");
}

export const newQuestionId = (text: string, taken: string[]) => {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "q";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return id;
};

/** Common dealership questions HR can add with one click. */
export const QUESTION_BANK: Omit<Question, "id">[] = [
  {
    text: "Do you have a valid driver's license?",
    kind: "yes_no",
    required: true,
    rule: { equals: "yes" },
  },
  {
    text: "Are you at least 18 years old?",
    kind: "yes_no",
    required: true,
    rule: { equals: "yes" },
  },
  {
    text: "How many years of experience do you have in this kind of role?",
    kind: "number",
    required: true,
  },
  { text: "Are you ASE certified?", kind: "yes_no", required: true },
  { text: "Do you have your own tools?", kind: "yes_no", required: true },
  { text: "Can you work Saturdays?", kind: "yes_no", required: true, rule: { equals: "yes" } },
  {
    text: "When could you start?",
    kind: "choice",
    options: ["Right away", "Within 2 weeks", "Within a month", "Later"],
    required: true,
  },
];
