import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ClipboardList, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import {
  STARTER_KITS,
  kitQuestionSchema,
  newQuestionId,
  parseKitQuestions,
  type KitQuestion,
} from "@/lib/interview-kits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/interview-kits")({
  head: () => ({
    meta: [
      { title: "Interview kits | WerkandMe Hiring" },
      {
        name: "description",
        content: "Interview questions per role and the scorecard interviewers fill in.",
      },
    ],
  }),
  component: InterviewKitsPage,
});

type Kit = { id: string; name: string; questions: KitQuestion[] };

function InterviewKitsPage() {
  const org = useOrg();
  const qc = useQueryClient();
  const key = ["interview-kits", org.orgId];
  const canEdit = org.isPlatformAdmin || canPostJobs(org.role);
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [kits, jobs] = await Promise.all([
        supabase
          .from("interview_kits")
          .select("id, name, questions")
          .eq("org_id", org.orgId)
          .order("name"),
        supabase
          .from("jobs")
          .select("interview_kit_id")
          .eq("org_id", org.orgId)
          .not("interview_kit_id", "is", null),
      ]);
      return {
        kits: (kits.data ?? []).map((k) => ({
          id: k.id,
          name: k.name,
          questions: parseKitQuestions(k.questions),
        })),
        jobs: jobs.data ?? [],
      };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function add(name: string, questions: Omit<KitQuestion, "id">[]) {
    const { error } = await supabase.from("interview_kits").insert({
      org_id: org.orgId,
      name,
      questions: questions.map((q) => ({ ...q, id: newQuestionId() })),
    });
    if (error) return toast.error(error.message);
    toast.success(`Added "${name}". Attach it to jobs on the Jobs page.`);
    refresh();
  }

  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  const have = new Set(data.kits.map((k) => k.name));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl">
          <ClipboardList className="size-7 text-sapphire" />
          Interview kits
        </h1>
        <p className="text-muted-foreground">
          The questions every interviewer asks for a role. Attach a kit to a job, and the scorecard
          on each interview shows these questions with a 1 to 5 score and notes. Scores help compare
          candidates; people still make the decision.{" "}
          {canEdit ? "" : "Only Recruiting/HR and group admins can make changes."}
        </p>
      </div>

      {data.kits.length === 0 && (
        <div className="rounded-2xl bg-background p-6 text-center text-sm text-muted-foreground shadow-sm">
          No kits yet. {canEdit && "Start from one below."}
        </div>
      )}
      {data.kits.map((k) => (
        <KitCard
          key={k.id}
          kit={k}
          canEdit={canEdit}
          jobCount={data.jobs.filter((j) => j.interview_kit_id === k.id).length}
          onChanged={refresh}
        />
      ))}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {STARTER_KITS.filter((s) => !have.has(s.name)).map((s) => (
            <Button key={s.name} variant="outline" onClick={() => add(s.name, s.questions)}>
              <Plus className="size-4" />
              {s.name}
            </Button>
          ))}
          <Button variant="outline" onClick={() => add("New kit", [])}>
            <Plus className="size-4" />
            Blank kit
          </Button>
        </div>
      )}
    </div>
  );
}

function KitCard({
  kit,
  canEdit,
  jobCount,
  onChanged,
}: {
  kit: Kit;
  canEdit: boolean;
  jobCount: number;
  onChanged: () => void;
}) {
  const [name, setName] = useState(kit.name);
  const [questions, setQuestions] = useState(kit.questions);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(kit.name);
    setQuestions(kit.questions);
  }, [kit]);
  const dirty = name !== kit.name || JSON.stringify(questions) !== JSON.stringify(kit.questions);
  const patch = (i: number, p: Partial<KitQuestion>) =>
    setQuestions((cur) => cur.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((cur) => {
      const next = [...cur];
      [next[i], next[i + d]] = [next[i + d]!, next[i]!];
      return next;
    });

  async function save() {
    if (!name.trim()) return toast.error("Give the kit a name.");
    // Drop blank or half-finished questions rather than failing the save.
    const clean = questions
      .map((q) => ({ ...q, lookFor: q.lookFor?.trim() || undefined }))
      .filter((q) => kitQuestionSchema.safeParse(q).success);
    setBusy(true);
    const { error } = await supabase
      .from("interview_kits")
      .update({ name: name.trim(), questions: clean, updated_at: new Date().toISOString() })
      .eq("id", kit.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Kit saved");
    onChanged();
  }
  async function remove() {
    if (
      !confirm(
        `Delete "${kit.name}"?${jobCount ? ` ${jobCount} job${jobCount > 1 ? "s" : ""} will have no interview questions.` : ""} Scorecards already filled in are kept.`,
      )
    )
      return;
    const { error } = await supabase.from("interview_kits").delete().eq("id", kit.id);
    if (error) return toast.error(error.message);
    onChanged();
  }

  return (
    <div className="space-y-3 rounded-2xl bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Kit name"
          className="max-w-xs font-semibold"
          value={name}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value.slice(0, 80))}
        />
        <span className="text-xs text-muted-foreground">
          {jobCount ? `Used on ${jobCount} job${jobCount > 1 ? "s" : ""}` : "Not on any job yet"}
        </span>
        {canEdit && (
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={remove}>
            <Trash2 />
            Delete
          </Button>
        )}
      </div>
      <ol className="space-y-2">
        {questions.map((q, i) => (
          <li key={q.id} className="space-y-1.5 rounded-xl border p-3">
            <div className="flex gap-2">
              <span className="pt-2 text-sm font-semibold">{i + 1}.</span>
              <Textarea
                aria-label={`Question ${i + 1}`}
                rows={2}
                value={q.text}
                disabled={!canEdit}
                placeholder="Question to ask"
                onChange={(e) => patch(i, { text: e.target.value.slice(0, 300) })}
              />
              {canEdit && (
                <div className="flex flex-col">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={i === questions.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove question"
                    onClick={() => setQuestions((cur) => cur.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
            <Input
              aria-label={`What to look for, question ${i + 1}`}
              value={q.lookFor ?? ""}
              disabled={!canEdit}
              placeholder="What a good answer sounds like (optional)"
              onChange={(e) => patch(i, { lookFor: e.target.value.slice(0, 300) })}
            />
          </li>
        ))}
      </ol>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {questions.length < 20 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuestions((cur) => [...cur, { id: newQuestionId(), text: "" }])}
            >
              <Plus />
              Add question
            </Button>
          )}
          <span className="ml-auto" />
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setName(kit.name);
                setQuestions(kit.questions);
              }}
            >
              Discard
            </Button>
          )}
          <Button size="sm" disabled={!dirty || busy} onClick={save}>
            {busy ? "Saving…" : "Save kit"}
          </Button>
        </div>
      )}
    </div>
  );
}
