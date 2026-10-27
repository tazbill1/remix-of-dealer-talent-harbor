import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import {
  answerLabel,
  describeRule,
  type Answers,
  type Question,
  unmet,
  verdict,
} from "@/lib/questions";
import { cn } from "@/lib/utils";

/** The applicant's answers to the job's screening questions, with requirement checks. */
export function ScreeningAnswers({
  questions,
  answers,
}: {
  questions: Question[];
  answers: Answers;
}) {
  if (!questions.length) return null;
  return (
    <div className="rounded-xl border">
      <div className="border-b px-3 py-2 text-sm font-medium">Screening answers</div>
      <ul className="divide-y">
        {questions.map((q) => {
          const v = verdict(q, answers[q.id]);
          const Icon = v === "met" ? CheckCircle2 : v === "not_met" ? XCircle : CircleHelp;
          return (
            <li key={q.id} className="flex items-start gap-2 px-3 py-2 text-sm">
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  v === "met" && "text-lime",
                  v === "not_met" && "text-destructive",
                  (v === "unanswered" || v === "info") && "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <div className="text-muted-foreground">{q.text}</div>
                <div className={cn("font-medium", v === "not_met" && "text-destructive")}>
                  {answerLabel(q, answers[q.id])}
                  {v === "not_met" && describeRule(q) ? (
                    <span className="ml-2 text-xs font-normal">({describeRule(q)})</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Small red flag on an applicant card: which requirements they didn't meet. */
export function KnockoutBadge({ questions, answers }: { questions: Question[]; answers: Answers }) {
  const missed = unmet(questions, answers);
  return (
    <div
      className="mt-1.5 inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
      title={missed.join(" · ")}
    >
      {missed.length
        ? `Doesn't meet ${missed.length} requirement${missed.length === 1 ? "" : "s"}`
        : "Doesn't meet a requirement"}
    </div>
  );
}
