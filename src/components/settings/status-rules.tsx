import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2, Workflow } from "lucide-react";
import { useOrg } from "@/lib/org";
import { getStatusRules, previewStatusRule, saveStatusRules } from "@/lib/status-rules.functions";
import {
  FROM_STAGES,
  MAX_DAYS,
  MAX_RULES,
  RULE_TRIGGERS,
  TO_STAGES,
  TRIGGER_KEYS,
  describeRule,
  minDays,
  newRule,
  ruleProblem,
  type RuleTrigger,
  type StatusRule,
} from "@/lib/status-rules";
import { STATUS_LABEL } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { StatusRemindersSettings } from "@/components/status-reminders-settings";


const newId = () => Math.random().toString(36).slice(2, 10);

export function StatusRulesSettings() {
  const org = useOrg();
  const qc = useQueryClient();
  const get = useServerFn(getStatusRules);
  const save = useServerFn(saveStatusRules);
  const key = ["status-rules", org.orgId];
  const { data } = useQuery({ queryKey: key, queryFn: () => get({ data: { orgId: org.orgId } }) });
  const [rules, setRules] = useState<StatusRule[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setRules(data.rules);
  }, [data]);
  const canEdit = !!data?.canEdit;
  const dirty = useMemo(
    () => !!data && JSON.stringify(rules) !== JSON.stringify(data.rules),
    [rules, data],
  );
  const problems = rules.map(ruleProblem);

  const patch = (i: number, p: Partial<StatusRule>) =>
    setRules((cur) => cur.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRules((cur) => {
      const next = [...cur];
      [next[i], next[i + d]] = [next[i + d]!, next[i]!];
      return next;
    });

  async function onSave() {
    setBusy(true);
    try {
      await save({ data: { orgId: org.orgId, rules } });
      toast.success("Status rules saved");
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="flex items-center gap-2 text-3xl">
          <Workflow className="size-7 text-sapphire" />
          Status rules
        </h1>
        <p className="text-muted-foreground">
          Move applicants to a new stage on their own, like "no reply in 5 days → Not selected".
          hireme checks every few minutes. Each move shows on the applicant's timeline. Rules start
          off, and a rule's clock starts when you turn it on, so turning one on never moves a
          backlog all at once.{" "}
          {canEdit ? "" : "Only Recruiting/HR and group admins can make changes."}
        </p>
      </div>

      {rules.length === 0 && (
        <div className="rounded-2xl bg-background p-6 text-center text-sm text-muted-foreground shadow-sm">
          No rules yet. {canEdit && "Add one below."}
        </div>
      )}

      {rules.map((r, i) => (
        <RuleCard
          key={r.id}
          rule={r}
          problem={problems[i] ?? null}
          canEdit={canEdit}
          first={i === 0}
          last={i === rules.length - 1}
          onPatch={(p) => patch(i, p)}
          onMove={(d) => move(i, d)}
          onRemove={() => setRules((cur) => cur.filter((_, j) => j !== i))}
        />
      ))}

      {canEdit && rules.length < MAX_RULES && (
        <div className="flex flex-wrap gap-2">
          {TRIGGER_KEYS.map((t) => (
            <Button
              key={t}
              variant="outline"
              onClick={() => setRules((cur) => [...cur, newRule(newId(), t)])}
            >
              <Plus className="size-4" />
              {RULE_TRIGGERS[t].label}
            </Button>
          ))}
        </div>
      )}
      {rules.length > 1 && (
        <p className="text-xs text-muted-foreground">
          If more than one rule fits an applicant, the one higher on the list wins.
        </p>
      )}

      <StatusRemindersSettings orgId={org.orgId} canEdit={canEdit} />

      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:left-64">
          <div className="mx-auto flex max-w-4xl items-center justify-end gap-3">
            {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
            <Button variant="ghost" disabled={!dirty || busy} onClick={() => setRules(data.rules)}>
              Discard
            </Button>
            <Button disabled={!dirty || busy || problems.some(Boolean)} onClick={onSave}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  problem,
  canEdit,
  first,
  last,
  onPatch,
  onMove,
  onRemove,
}: {
  rule: StatusRule;
  problem: string | null;
  canEdit: boolean;
  first: boolean;
  last: boolean;
  onPatch: (p: Partial<StatusRule>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const org = useOrg();
  const preview = useServerFn(previewStatusRule);
  const [checking, setChecking] = useState(false);
  const [fit, setFit] = useState<{ count: number; names: string[] } | null>(null);
  useEffect(() => setFit(null), [rule.trigger, rule.days, rule.from, rule.to]);

  async function onPreview() {
    setChecking(true);
    try {
      setFit(await preview({ data: { orgId: org.orgId, rule } }));
    } catch (e) {
      toast.error((e as Error).message);
    }
    setChecking(false);
  }
  const toggleFrom = (s: (typeof FROM_STAGES)[number]) =>
    onPatch({ from: rule.from.includes(s) ? rule.from.filter((x) => x !== s) : [...rule.from, s] });
  const savedOnSince =
    rule.enabled && rule.enabledAt ? new Date(rule.enabledAt).toLocaleDateString() : null;

  return (
    <div
      className={cn(
        "space-y-4 rounded-2xl bg-background p-4 shadow-sm",
        !rule.enabled && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-semibold">{describeRule(rule)}</div>
          <div className="text-xs text-muted-foreground">
            {RULE_TRIGGERS[rule.trigger].help}
            {savedOnSince && ` On since ${savedOnSince}.`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canEdit && (
            <>
              <Button
                size="icon"
                variant="ghost"
                disabled={first}
                onClick={() => onMove(-1)}
                aria-label="Move rule up"
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={last}
                onClick={() => onMove(1)}
                aria-label="Move rule down"
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Delete rule">
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
          <label className="ml-2 flex items-center gap-2 text-sm">
            {rule.enabled ? "On" : "Off"}
            <Switch
              checked={rule.enabled}
              disabled={!canEdit}
              onCheckedChange={(v) => onPatch({ enabled: v })}
              aria-label="Rule on or off"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">When</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            disabled={!canEdit}
            value={rule.trigger}
            onChange={(e) => {
              const t = e.target.value as RuleTrigger;
              onPatch({ trigger: t, days: Math.max(rule.days, minDays(t)) });
            }}
          >
            {TRIGGER_KEYS.map((t) => (
              <option key={t} value={t}>
                {RULE_TRIGGERS[t].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">
            {rule.trigger === "knockout" ? "Wait (days, 0 = right away)" : "For this many days"}
          </span>
          <Input
            type="number"
            min={minDays(rule.trigger)}
            max={MAX_DAYS}
            disabled={!canEdit}
            className="w-28"
            value={rule.days}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              onPatch({
                days: Number.isFinite(n)
                  ? Math.min(MAX_DAYS, Math.max(minDays(rule.trigger), n))
                  : minDays(rule.trigger),
              });
            }}
          />
        </label>
      </div>

      <div className="space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">Only for applicants in</span>
        <div className="flex flex-wrap gap-2">
          {FROM_STAGES.filter((s) => s !== "offer").map((s) => (
            <button
              key={s}
              type="button"
              disabled={!canEdit}
              onClick={() => toggleFrom(s)}
              aria-pressed={rule.from.includes(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                rule.from.includes(s)
                  ? "border-sapphire bg-sapphire text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">Move them to</span>
        <select
          className="h-9 w-full max-w-xs rounded-md border bg-background px-2 text-sm"
          disabled={!canEdit}
          value={rule.to}
          onChange={(e) => onPatch({ to: e.target.value as StatusRule["to"] })}
        >
          {TO_STAGES.filter((s) => s !== "offer" || rule.to === "offer").map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            disabled={!canEdit}
            checked={!!rule.includeExisting}
            onChange={(e) => onPatch({ includeExisting: e.target.checked })}
          />
          <span>
            Include applicants already waiting
            <span className="block text-xs text-muted-foreground">
              Off: the clock starts when you turn the rule on. On: anyone who already fits moves at
              the next check.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            disabled={!canEdit}
            checked={!!rule.emailApplicant}
            onChange={(e) => onPatch({ emailApplicant: e.target.checked })}
          />
          <span>
            Email the applicant about the change
            <span className="block text-xs text-muted-foreground">
              Uses the same status email as moving them by hand. Email is live, so this reaches real
              people.
            </span>
          </span>
        </label>
      </div>

      {problem && <p className="text-sm text-destructive">{problem}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-accent p-3 text-sm">
        <Button size="sm" variant="outline" disabled={checking || !!problem} onClick={onPreview}>
          {checking ? "Checking…" : "Who fits this right now?"}
        </Button>
        {fit && (
          <span>
            {fit.count === 0
              ? "Nobody fits this rule right now."
              : `${fit.count} applicant${fit.count === 1 ? "" : "s"} already fit${fit.count === 1 ? "s" : ""}: ${fit.names.join(", ")}${fit.count > fit.names.length ? ", …" : ""}.`}
            {fit.count > 0 &&
              !rule.includeExisting &&
              " They'll only move if they still fit once the rule has been on for the full wait."}
            {" Nobody is moved by checking."}
          </span>
        )}
      </div>
    </div>
  );
}
