import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { newQuestionId, QUESTION_BANK, type Question } from "@/lib/questions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KINDS: { v: Question["kind"]; l: string }[] = [
  { v: "yes_no", l: "Yes / No" },
  { v: "number", l: "Number" },
  { v: "choice", l: "Pick one" },
  { v: "text", l: "Short answer" },
];

/**
 * Screening questions on a job. A question can carry a requirement ("must answer
 * Yes", "at least 2"); applicants who don't meet it are flagged for HR, not rejected.
 */
export function JobQuestions({
  value,
  onChange,
}: {
  value: Question[];
  onChange: (q: Question[]) => void;
}) {
  const [custom, setCustom] = useState("");
  const ids = value.map((q) => q.id);
  const add = (q: Omit<Question, "id">) => {
    if (value.length >= 15) return;
    onChange([...value, { ...q, id: newQuestionId(q.text, ids) }]);
  };
  const update = (i: number, patch: Partial<Question>) =>
    onChange(value.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const unused = QUESTION_BANK.filter((b) => !value.some((q) => q.text === b.text));

  return (
    <fieldset className="space-y-3 border-t pt-3">
      <legend className="text-sm font-semibold">Screening questions</legend>
      <p className="text-xs text-muted-foreground">
        Asked on the application. Set a requirement and anyone who doesn't meet it is flagged on
        their card. Nobody is rejected automatically. The assistant won't ask these again by text.
      </p>
      {value.map((q, i) => (
        <div key={q.id} className="space-y-2 rounded-xl border p-3">
          <div className="flex gap-2">
            <Input
              aria-label="Question"
              value={q.text}
              onChange={(e) => update(i, { text: e.target.value })}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Remove question"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              aria-label="Answer type"
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={q.kind}
              onChange={(e) => {
                const kind = e.target.value as Question["kind"];
                update(i, {
                  kind,
                  rule: undefined,
                  ...(kind === "choice"
                    ? { options: q.options?.length ? q.options : ["Option 1", "Option 2"] }
                    : { options: undefined }),
                });
              }}
            >
              {KINDS.map((k) => (
                <option key={k.v} value={k.v}>
                  {k.l}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              Required
            </label>
            {q.kind === "yes_no" && (
              <select
                aria-label="Requirement"
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={q.rule && "equals" in q.rule ? q.rule.equals : ""}
                onChange={(e) =>
                  update(i, {
                    rule: e.target.value ? { equals: e.target.value as "yes" | "no" } : undefined,
                  })
                }
              >
                <option value="">No requirement</option>
                <option value="yes">Must answer Yes</option>
                <option value="no">Must answer No</option>
              </select>
            )}
            {q.kind === "number" && (
              <label className="flex items-center gap-1 text-xs">
                At least
                <Input
                  aria-label="Minimum"
                  type="number"
                  className="h-8 w-20"
                  value={q.rule && "min" in q.rule ? String(q.rule.min) : ""}
                  onChange={(e) =>
                    update(i, {
                      rule: e.target.value === "" ? undefined : { min: Number(e.target.value) },
                    })
                  }
                />
                <span className="text-muted-foreground">(blank = no requirement)</span>
              </label>
            )}
          </div>
          {q.kind === "choice" && (
            <div className="space-y-1 text-xs">
              <Input
                aria-label="Options"
                value={(q.options ?? []).join(", ")}
                onChange={(e) => {
                  const options = e.target.value
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean)
                    .slice(0, 20);
                  const ok =
                    q.rule && "anyOf" in q.rule
                      ? q.rule.anyOf.filter((o) => options.includes(o))
                      : [];
                  update(i, { options, rule: ok.length ? { anyOf: ok } : undefined });
                }}
                placeholder="Options, separated by commas"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Meets the requirement:</span>
                {(q.options ?? []).map((o) => {
                  const ok = q.rule && "anyOf" in q.rule ? q.rule.anyOf : [];
                  return (
                    <label key={o} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={ok.includes(o)}
                        onChange={(e) => {
                          const next = e.target.checked ? [...ok, o] : ok.filter((x) => x !== o);
                          update(i, { rule: next.length ? { anyOf: next } : undefined });
                        }}
                      />
                      {o}
                    </label>
                  );
                })}
                <span className="text-muted-foreground">(none ticked = no requirement)</span>
              </div>
            </div>
          )}
        </div>
      ))}
      {value.length < 15 && (
        <div className="space-y-2">
          {unused.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {unused.map((b) => (
                <button
                  key={b.text}
                  type="button"
                  onClick={() => add(b)}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs hover:bg-secondary/70"
                >
                  + {b.text}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Or write your own question"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={custom.trim().length < 3}
              onClick={() => {
                add({ text: custom.trim(), kind: "yes_no", required: true });
                setCustom("");
              }}
            >
              <Plus />
              Add
            </Button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
