/**
 * Interview question kits (HR writes them once per role and attaches them to jobs) and the
 * scorecard each interviewer fills in: a 1 to 5 score and a note per question, plus an overall
 * hire / maybe / no. Scores are for people to compare; nothing moves a stage on its own.
 */
import { z } from "zod";

export const kitQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  text: z.string().trim().min(3).max(300),
  /** What a good answer sounds like, shown to the interviewer under the question. */
  lookFor: z.string().trim().max(300).optional(),
});
export type KitQuestion = z.infer<typeof kitQuestionSchema>;
export const kitQuestionsSchema = z.array(kitQuestionSchema).max(20);

export function parseKitQuestions(raw: unknown): KitQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((q) => {
      const r = kitQuestionSchema.safeParse(q);
      return r.success ? [r.data] : [];
    })
    .slice(0, 20);
}

export const newQuestionId = () => `q_${Math.random().toString(36).slice(2, 10)}`;

export const RECOMMENDATIONS = [
  { value: "hire", label: "Hire" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number]["value"];

export const SCORE_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Weak",
  3: "OK",
  4: "Good",
  5: "Great",
};

export const answerSchema = z.object({
  questionId: z.string().min(1).max(40),
  score: z.number().int().min(1).max(5).nullable(),
  note: z.string().max(1000).default(""),
});
export type ScoreAnswer = z.infer<typeof answerSchema>;

export function parseAnswers(raw: unknown): ScoreAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a) => {
    const r = answerSchema.safeParse(a);
    return r.success ? [r.data] : [];
  });
}

/** One answer per kit question, keeping anything already filled in. */
export function answersFor(questions: KitQuestion[], existing: ScoreAnswer[]): ScoreAnswer[] {
  return questions.map(
    (q) =>
      existing.find((a) => a.questionId === q.id) ?? { questionId: q.id, score: null, note: "" },
  );
}

/** Why a scorecard can't be submitted yet, or null when it can. Drafts can be saved any time. */
export function submitProblem(
  questions: KitQuestion[],
  answers: ScoreAnswer[],
  recommendation: string | null,
) {
  const missing = questions.filter(
    (q) => !answers.find((a) => a.questionId === q.id && a.score != null),
  );
  if (missing.length) return `Score every question first (${missing.length} left).`;
  if (!recommendation || !RECOMMENDATIONS.some((r) => r.value === recommendation))
    return "Pick hire, maybe or no.";
  return null;
}

export function averageScore(answers: ScoreAnswer[]): number | null {
  const s = answers.map((a) => a.score).filter((n): n is number => n != null);
  return s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null;
}

type CardLike = { answers: unknown; recommendation: string | null; submitted_at: string | null };

/** Roll-up of the submitted scorecards on one applicant (drafts don't count). */
export function summarizeScorecards(cards: CardLike[]) {
  const done = cards.filter((c) => c.submitted_at);
  const averages = done
    .map((c) => averageScore(parseAnswers(c.answers)))
    .filter((n): n is number => n != null);
  const count = (r: Recommendation) => done.filter((c) => c.recommendation === r).length;
  return {
    submitted: done.length,
    average: averages.length
      ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 10) / 10
      : null,
    hire: count("hire"),
    maybe: count("maybe"),
    no: count("no"),
  };
}

/** Starting points HR can add with one click and then edit. */
export const STARTER_KITS: { name: string; questions: Omit<KitQuestion, "id">[] }[] = [
  {
    name: "Sales consultant",
    questions: [
      {
        text: "Tell me about a time you turned a customer who was 'just looking' into a sale.",
        lookFor: "Builds rapport, asks questions, follows up; doesn't pressure.",
      },
      {
        text: "How do you keep track of follow-ups with customers who didn't buy today?",
        lookFor: "A real system (CRM, notes, reminders) and persistence.",
      },
      {
        text: "A customer is upset about the trade-in number. What do you do?",
        lookFor: "Listens, explains value calmly, brings in a manager when needed.",
      },
      {
        text: "What would your last manager say you need to work on?",
        lookFor: "Honest, self-aware, shows growth.",
      },
      {
        text: "Our hours include evenings and Saturdays. How does that fit your life?",
        lookFor: "Clear yes, or a realistic plan.",
      },
    ],
  },
  {
    name: "Service technician",
    questions: [
      {
        text: "Walk me through how you diagnose an intermittent electrical problem.",
        lookFor: "Logical steps, uses scan tools and wiring diagrams, verifies the fix.",
      },
      {
        text: "Which certifications do you have (ASE, manufacturer) and which are you working on?",
        lookFor: "Current certs and a plan to keep learning.",
      },
      {
        text: "Tell me about a comeback you had. What happened and what did you change?",
        lookFor: "Owns the mistake, explains the fix and the lesson.",
      },
      {
        text: "Do you have your own tools? What are you missing?",
        lookFor: "Honest picture of their toolset.",
      },
      {
        text: "How do you balance flat-rate speed with doing the job right?",
        lookFor: "Quality first, efficient habits.",
      },
    ],
  },
  {
    name: "Service advisor",
    questions: [
      {
        text: "A customer's repair will cost far more than they expected. How do you explain it?",
        lookFor: "Clear, honest, explains what's urgent vs. can wait.",
      },
      {
        text: "How do you keep customers updated while their car is in the shop?",
        lookFor: "Proactive texts/calls, sets expectations.",
      },
      {
        text: "Tell me about a time you had to push back on a technician or manager.",
        lookFor: "Respectful, focused on the customer.",
      },
      {
        text: "How do you handle a busy morning write-up line?",
        lookFor: "Stays organized and friendly under pressure.",
      },
      {
        text: "What does good customer service mean to you?",
        lookFor: "Specific examples, not just phrases.",
      },
    ],
  },
];
