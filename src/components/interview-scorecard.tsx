import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/org";
import {
  RECOMMENDATIONS,
  SCORE_LABELS,
  answersFor,
  averageScore,
  parseAnswers,
  parseKitQuestions,
  submitProblem,
  summarizeScorecards,
  type KitQuestion,
  type ScoreAnswer,
} from "@/lib/interview-kits";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { InterviewRecording, RecordingSuggestion, useInterviewRecordings } from "@/components/interview-recording";
import { validSuggestions } from "@/lib/interview-recording";

const cardsKey = (appId: string) => ["scorecards", appId];

/** The kit attached to this applicant's job, if any. */
function useKit(appId: string) {
  return useQuery({
    queryKey: ["interview-kit-for-app", appId],
    queryFn: async () => {
      const { data: app } = await supabase
        .from("applications")
        .select("job_id")
        .eq("id", appId)
        .maybeSingle();
      if (!app?.job_id) return null;
      const { data: job } = await supabase
        .from("jobs")
        .select("interview_kit_id")
        .eq("id", app.job_id)
        .maybeSingle();
      if (!job?.interview_kit_id) return null;
      const { data: kit } = await supabase
        .from("interview_kits")
        .select("id, name, questions")
        .eq("id", job.interview_kit_id)
        .maybeSingle();
      return kit
        ? { id: kit.id, name: kit.name, questions: parseKitQuestions(kit.questions) }
        : null;
    },
  });
}

function useScorecards(appId: string) {
  return useQuery({
    queryKey: cardsKey(appId),
    queryFn: async () => {
      const { data, error } = await supabase.from("interview_scorecards").select("*").eq("application_id", appId).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Submitted scorecards on the profile: overall average, hire/maybe/no, and each interviewer's notes. */
export function ScorecardSummary({ appId, interviewId }: { appId: string; interviewId: string }) {
  const { data, isPending, isError } = useScorecards(appId);
  if (isPending) return <p className="py-2 text-xs text-muted-foreground">Loading scorecards…</p>;
  if (isError) return <p className="py-2 text-xs text-muted-foreground">Scorecards couldn’t be loaded.</p>;
  const cards = (data ?? []).filter((c) => c.interview_id === interviewId);
  const s = summarizeScorecards(cards);
  if (!s.submitted) return <p className="py-2 text-xs text-muted-foreground">No submitted scorecards yet.</p>;
  const rec = (r: string | null) => RECOMMENDATIONS.find((x) => x.value === r)?.label ?? "No pick";
  return (
    <div className="mt-2 border-t py-2 text-sm">
      <ul className="space-y-1">
        {cards.filter((c) => c.submitted_at).map((c) => (
          <li key={c.id} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{c.author_name || "Interviewer"}</span>: {averageScore(parseAnswers(c.answers))?.toFixed(1) ?? "—"} / 5 · {rec(c.recommendation)}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs font-medium">Overall average {s.average?.toFixed(1) ?? "—"} / 5</p>
    </div>
  );
}

/** "Scorecard" button on an interview: the interviewer's own card, saved as a draft or submitted. */
export function ScorecardButton({
  interviewId,
  appId,
  orgId,
}: {
  interviewId: string;
  appId: string;
  orgId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: me } = useQuery(meQuery);
  const { data: cards = [] } = useScorecards(appId);
  const mine = cards.find((c) => c.interview_id === interviewId && c.author_id === me?.user.id);
  return (
    <>
      <Button
        size="sm"
        variant={mine?.submitted_at ? "ghost" : "outline"}
        onClick={() => setOpen(true)}
      >
        <ClipboardCheck />
        {mine?.submitted_at ? "Scored" : mine ? "Finish scorecard" : "Scorecard"}
      </Button>
      {open && (
        <ScorecardDialog
          interviewId={interviewId}
          appId={appId}
          orgId={orgId}
          existing={mine ?? null}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type Existing = {
  id: string;
  answers: unknown;
  recommendation: string | null;
  notes: string | null;
  submitted_at: string | null;
} | null;

function ScorecardDialog({
  interviewId,
  appId,
  orgId,
  existing,
  onClose,
}: {
  interviewId: string;
  appId: string;
  orgId: string;
  existing: Existing;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: kit, isLoading } = useKit(appId);
  const questions: KitQuestion[] = kit?.questions ?? [];
  const { data: recordings = [] } = useInterviewRecordings(interviewId);
  const recording = recordings.find(r => r.transcript && (r.status === "ready" || r.status === "audio_deleted"));
  const suggestions = recording ? validSuggestions({ suggestions: recording.ai_suggestions }, recording.transcript ?? "", questions.map(q => q.id)) : [];
  const [answers, setAnswers] = useState<ScoreAnswer[]>([]);
  const [recommendation, setRecommendation] = useState<string | null>(
    existing?.recommendation ?? null,
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setAnswers(answersFor(questions, parseAnswers(existing?.answers)));
  }, [kit]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (id: string, p: Partial<ScoreAnswer>) =>
    setAnswers((cur) => cur.map((a) => (a.questionId === id ? { ...a, ...p } : a)));
  const scored = answers.filter((a) => a.score != null).length;
  const average = averageScore(answers)?.toFixed(1) ?? "—";
  const problem = submitProblem(questions, answers, recommendation);

  async function save(submit: boolean) {
    if (!me) return;
    if (submit && problem) return toast.error(problem);
    setBusy(true);
    const { error } = await supabase.from("interview_scorecards").upsert(
      {
        org_id: orgId,
        interview_id: interviewId,
        application_id: appId,
        kit_id: kit?.id ?? null,
        author_id: me.user.id,
        author_name: me.user.email,
        answers,
        recommendation,
        notes: notes.trim() || null,
        submitted_at: submit ? new Date().toISOString() : (existing?.submitted_at ?? null),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "interview_id,author_id" },
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(submit ? "Scorecard submitted" : "Draft saved");
    await qc.invalidateQueries({ queryKey: cardsKey(appId) });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Interview scorecard</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="sticky -top-6 z-10 space-y-2 border-b bg-background py-3" aria-live="polite">
              <p className="text-sm font-medium">{scored} of {questions.length} scored · Average {average} / 5</p>
              <Progress value={questions.length ? scored / questions.length * 100 : 0} aria-label="Scoring progress" />
            </div>
            <p className="text-xs text-muted-foreground">
              {kit
                ? `Questions from "${kit.name}".`
                : "This job has no interview kit yet, so just add your overall notes. Recruiting/HR can attach one on the job."}{" "}
              Score what you heard about the job only. Your scorecard is shared with others who can
              see this applicant.
            </p>
            <InterviewRecording orgId={orgId} interviewId={interviewId} />
            {questions.map((q, i) => {
              const a = answers.find((x) => x.questionId === q.id);
              return (
                <div key={q.id} className="space-y-2 rounded-xl border p-3">
                  <p className="text-sm font-medium">
                    {i + 1}. {q.text}
                  </p>
                  {q.lookFor && (
                    <p className="text-xs text-muted-foreground">What a 5 looks like: {q.lookFor}</p>
                  )}
                  <RecordingSuggestion suggestion={suggestions.find(s => s.questionId === q.id)} onAccept={score => patch(q.id, { score })} />
                  <div
                    className="flex flex-wrap gap-1"
                    role="radiogroup"
                    aria-label={`Score for question ${i + 1}`}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={a?.score === n}
                        onClick={() => patch(q.id, { score: n })}
                        className={cn(
                          "min-w-14 rounded-lg border px-2 py-1.5 text-xs",
                          a?.score === n
                            ? "border-sapphire bg-sapphire text-white"
                            : "hover:border-sapphire",
                        )}
                      >
                        <span className="block text-sm font-semibold">{n}</span>
                        {SCORE_LABELS[n]}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="What they said (optional)"
                    value={a?.note ?? ""}
                    onChange={(e) => patch(q.id, { note: e.target.value.slice(0, 1000) })}
                  />
                </div>
              );
            })}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Overall</p>
              <div className="flex flex-wrap items-center gap-2">
                {RECOMMENDATIONS.map((r) => (
                  <Button
                    key={r.value}
                    type="button"
                    size="sm"
                    variant={recommendation === r.value ? "default" : "outline"}
                    onClick={() => setRecommendation(r.value)}
                  >
                    {r.label}
                  </Button>
                ))}
                <span className="text-sm text-muted-foreground">Average {average} / 5</span>
              </div>
              <Textarea
                rows={3}
                placeholder="Overall notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy || !!problem} onClick={() => save(true)}>
                {existing?.submitted_at ? "Update scorecard" : "Submit"}
              </Button>
              {!existing?.submitted_at && (
                <Button variant="outline" disabled={busy} onClick={() => save(false)}>
                  Save draft
                </Button>
              )}
            </div>
            {problem && <p className="text-xs text-muted-foreground">{problem}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
