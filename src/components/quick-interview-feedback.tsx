import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/org";
import { feedbackChecks, feedbackProblem, feedbackSummary, type QuickFeedback } from "@/lib/quick-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";

type Card = Database["public"]["Tables"]["interview_scorecards"]["Row"];
const key = (appId: string) => ["scorecards", appId];
function useFeedback(appId: string) {
  return useQuery({ queryKey: key(appId), queryFn: async () => {
    const { data, error } = await supabase.from("interview_scorecards").select("*").eq("application_id", appId).order("created_at");
    if (error) throw error;
    return data ?? [];
  } });
}
export function QuickFeedbackSummary({ appId, interviewId }: { appId: string; interviewId: string }) {
  const { data } = useFeedback(appId);
  return <>{data?.filter((c) => c.interview_id === interviewId && c.feedback_updated_at).map((c) => <p key={c.id} className="break-words text-xs text-muted-foreground">{feedbackSummary(c.feedback_rating, c.feedback_recommendation, c.author_name)}</p>)}</>;
}
export function QuickFeedbackButton({ appId, interviewId, orgId }: { appId: string; interviewId: string; orgId: string }) {
  const [open, setOpen] = useState(false);
  const { data: me } = useQuery(meQuery);
  const { data: cards = [], isPending, isError } = useFeedback(appId);
  const { data: allowed } = useQuery({ queryKey: ["can-feedback", orgId, interviewId, me?.user.id], enabled: !!me,
    queryFn: async () => { if (!me) return false; const { data, error } = await supabase.rpc("can_interview_feedback", { _org: orgId, _interview: interviewId, _uid: me.user.id }); if (error) throw error; return data; } });
  if (!allowed) return null;
  const mine = cards.find((c) => c.interview_id === interviewId && c.author_id === me?.user.id);
  return <><Button size="sm" variant="outline" className="min-h-11" disabled={isPending || isError} onClick={() => setOpen(true)}>Leave feedback</Button>
    {open && <FeedbackForm orgId={orgId} interviewId={interviewId} appId={appId} existing={mine} onClose={() => setOpen(false)} />}</>;
}
function FeedbackForm({ orgId, interviewId, appId, existing, onClose }: { orgId: string; interviewId: string; appId: string; existing: Card | undefined; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<QuickFeedback>({ rating: existing?.feedback_rating ?? null, onTime: existing?.feedback_on_time ?? null, experience: existing?.feedback_experience ?? null, culture: existing?.feedback_culture ?? null, recommend: existing?.feedback_recommend ?? null, recommendation: existing?.feedback_recommendation ?? null, notes: existing?.feedback_notes ?? "" });
  const latest = useRef(draft);
  const chain = useRef(Promise.resolve());
  const version = useRef(0);
  const [status, setStatus] = useState(existing?.feedback_updated_at ? "Saved" : "");
  const [error, setError] = useState("");
  function save(next: QuickFeedback) {
    const current = ++version.current;
    setStatus("Saving…"); setError("");
    chain.current = chain.current.then(async () => {
      if (current !== version.current) return;
      try {
        const problem = feedbackProblem(next); if (problem) throw new Error(problem);
        const { data, error: failure } = await supabase.rpc("save_quick_interview_feedback", { _org: orgId, _interview: interviewId, _feedback: next });
        if (failure) throw failure;
        if (!data?.id) throw new Error("Feedback was not saved. Please try again.");
        qc.setQueryData<Card[]>(key(appId), (old) => [...(old ?? []).filter((c) => c.id !== data.id), data]);
        await qc.invalidateQueries({ queryKey: ["events", appId] });
        if (current === version.current) setStatus("Saved");
      } catch (e) { if (current === version.current) { setStatus(""); setError(e instanceof Error ? e.message : "Feedback could not be saved. Please try again."); } }
    });
  }
  function change(patch: Partial<QuickFeedback>) { const next = { ...latest.current, ...patch }; latest.current = next; setDraft(next); save(next); }
  return <Dialog open onOpenChange={(open) => { if (!open && status !== "Saving…" && !error) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
    <DialogHeader><DialogTitle>Leave feedback</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="flex min-h-5 items-center justify-between text-sm"><span>Overall rating</span><span role="status" className="text-muted-foreground">{status}</span></div>
      <div role="radiogroup" aria-label="Overall rating" className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((n) => <Button key={n} variant={draft.rating === n ? "default" : "outline"} className="h-12 px-0" role="radio" aria-checked={draft.rating === n} aria-label={`${n} stars`} onClick={() => change({ rating: n })}><Star className={draft.rating !== null && n <= draft.rating ? "fill-current" : ""} /><span>{n}</span></Button>)}</div>
      <div className="divide-y">{feedbackChecks.map(([field, label]) => <div key={field} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2"><span className="min-w-0 text-sm">{label}</span><div role="group" aria-label={label} className="flex gap-1">{[true, false].map((value) => <Button key={String(value)} variant={draft[field] === value ? "default" : "outline"} className="h-11 min-w-12 px-2" aria-pressed={draft[field] === value} onClick={() => change({ [field]: value })}>{value ? "Yes" : "No"}</Button>)}</div></div>)}</div>
      <div role="group" aria-label="Recommendation" className="grid grid-cols-3 gap-2">{["hire", "maybe", "pass"].map((value) => <Button key={value} className="h-11" variant={draft.recommendation === value ? "default" : "outline"} aria-pressed={draft.recommendation === value} onClick={() => change({ recommendation: value })}>{value.charAt(0).toUpperCase() + value.slice(1)}</Button>)}</div>
      <Textarea aria-label="Feedback notes" placeholder="Notes" className="text-base" rows={4} maxLength={2000} value={draft.notes} onChange={(e) => change({ notes: e.target.value })} />
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => save(latest.current)}>Retry</Button></div>}
    </div>
  </DialogContent></Dialog>;
}