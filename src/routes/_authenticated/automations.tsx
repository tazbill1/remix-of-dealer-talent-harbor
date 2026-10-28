import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquareText, RotateCcw } from "lucide-react";
import { useOrg } from "@/lib/org";
import { getAutomations, previewWaitingCheckins, saveAutomations } from "@/lib/automations.functions";
import {
  AUTOMATIONS,
  AUTOMATION_KEYS,
  DEFAULT_CHECKIN_DAYS,
  FIELD_HELP,
  isOn,
  segments,
  textFor,
  waitingText,
  type AutomationDef,
  type AutomationKey,
  type Automations,
} from "@/lib/automations";
import { Button } from "@/components/ui/button";
import { AssistantSettings } from "@/components/assistant-settings";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { WeeklySummaryCard } from "@/components/weekly-summary-settings";
import { HumanAlertCard } from "@/components/human-alert-settings";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({ meta: [{ title: "Automatic texts | WerkandMe Hiring" }] }),
  component: AutomationsPage,
});

/** Sample values for the live preview. */
const SAMPLE: Record<string, string | number> = {
  first: "Jordan",
  name: "Jordan Smith",
  store: "ABC Ford",
  job: "Service Technician",
  assistant: "Penny",
  summary: "5 yrs at a Ford store, ASE certified, can start in 2 weeks.",
  rating: 4,
  manager: "Mike",
  hours: 24,
  link: "workwithwerk.com/book/x7k2",
  status: "workwithwerk.com/status/x7k2",
  when: "Thu, Nov 5, 10:00 AM",
  address: "100 Main St, Bentonville, AR",
  change: "booked an interview for",
  documents: "2 documents",
  days: 30,
};

const GROUPS: { title: string; keys: AutomationKey[] }[] = [
  { title: "Applying & screening", keys: ["welcome", "summary", "nudge", "escalation"] },
  { title: "While applicants wait", keys: ["waiting"] },
  { title: "Interviews", keys: ["invite", "decline", "booked", "bookedManager", "reminderDay", "reminderSoon", "reminderManager"] },
  { title: "Offers & new hires", keys: ["offer", "documents", "checkin"] },
];

function AutomationsPage() {
  const org = useOrg();
  const qc = useQueryClient();
  const get = useServerFn(getAutomations);
  const save = useServerFn(saveAutomations);
  const key = ["automations", org.orgId];
  const { data } = useQuery({ queryKey: key, queryFn: () => get({ data: { orgId: org.orgId } }) });
  const [a, setA] = useState<Automations>({ texts: {} });
  const [nudge, setNudge] = useState(4);
  const [escalate, setEscalate] = useState(24);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setA(data.automations);
    setNudge(data.nudgeHours);
    setEscalate(data.escalateHours);
  }, [data]);
  const canEdit = !!data?.canEdit;
  const dirty = useMemo(
    () =>
      !!data &&
      (JSON.stringify(a) !== JSON.stringify(data.automations) || nudge !== data.nudgeHours || escalate !== data.escalateHours),
    [a, nudge, escalate, data],
  );

  const patch = (k: AutomationKey, p: { enabled?: boolean; text?: string; hours?: number }) =>
    setA((cur) => ({ ...cur, texts: { ...cur.texts, [k]: { ...cur.texts[k], ...p } } }));

  async function onSave() {
    setBusy(true);
    try {
      await save({ data: { orgId: org.orgId, automations: a, nudgeHours: nudge, escalateHours: escalate } });
      toast.success("Automatic texts saved");
      qc.invalidateQueries({ queryKey: key });
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
          <MessageSquareText className="size-7 text-sapphire" />
          Automatic texts & assistant
        </h1>
        <p className="text-muted-foreground">
          Choose which texts hireme sends on its own, what they say and when. Texting hours, consent and STOP always
          apply. {canEdit ? "" : "Only group admins can make changes."}
        </p>
      </div>

      <AssistantSettings a={a} canEdit={canEdit} onChange={setA} />

      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-3">
          <h2 className="text-lg">{g.title}</h2>
          {g.keys.map((k) => (
            <AutomationCard
              key={k}
              k={k}
              a={a}
              canEdit={canEdit}
              hours={k === "nudge" ? nudge : k === "escalation" ? escalate : undefined}
              onHours={k === "nudge" ? setNudge : k === "escalation" ? setEscalate : undefined}
              onPatch={(p) => patch(k, p)}
            />
          ))}
          {g.title === "While applicants wait" && <WaitingPreview a={a} canEdit={canEdit} />}
          {g.title === "Offers & new hires" && (
            <div className="space-y-2 rounded-2xl bg-background p-4 shadow-sm">
              <div className="font-semibold">Check-in days</div>
              <p className="text-sm text-muted-foreground">Days after a hire starts that the manager gets the check-in text.</p>
              <Input
                disabled={!canEdit}
                className="max-w-xs"
                value={(a.checkinDays ?? DEFAULT_CHECKIN_DAYS).join(", ")}
                onChange={(e) => {
                  const days = e.target.value
                    .split(/[,\s]+/)
                    .map(Number)
                    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 365)
                    .slice(0, 6);
                  setA({ ...a, checkinDays: days.length ? days : undefined });
                }}
                placeholder="30, 60, 90"
              />
            </div>
          )}
          {g.title === "Interviews" && (
            <div className="space-y-2 rounded-2xl bg-background p-4 shadow-sm">
              <div className="font-semibold">Booking page</div>
              <p className="text-sm text-muted-foreground">What candidates can pick from when they book. Store hours are set on each store's page.</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Soonest (hours from now)</span>
                  <Input
                    type="number"
                    min={1}
                    max={72}
                    disabled={!canEdit}
                    className="w-28"
                    value={a.booking?.leadHours ?? 12}
                    onChange={(e) => setA({ ...a, booking: { ...a.booking, leadHours: clamp(Number(e.target.value), 1, 72) } })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Days ahead to show</span>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    disabled={!canEdit}
                    className="w-28"
                    value={a.booking?.daysAhead ?? 7}
                    onChange={(e) => setA({ ...a, booking: { ...a.booking, daysAhead: clamp(Number(e.target.value), 1, 30) } })}
                  />
                </label>
              </div>
            </div>
          )}
        </section>
      ))}

      <WeeklySummaryCard a={a} canEdit={canEdit} onChange={setA} />
      <HumanAlertCard a={a} canEdit={canEdit} onChange={setA} />

      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:left-64">
          <div className="mx-auto flex max-w-4xl items-center justify-end gap-3">
            {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
            <Button variant="ghost" disabled={!dirty || busy} onClick={() => data && (setA(data.automations), setNudge(data.nudgeHours), setEscalate(data.escalateHours))}>
              Discard
            </Button>
            <Button disabled={!dirty || busy} onClick={onSave}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo);

function AutomationCard({
  k,
  a,
  canEdit,
  hours,
  onHours,
  onPatch,
}: {
  k: AutomationKey;
  a: Automations;
  canEdit: boolean;
  hours?: number | undefined;
  onHours?: ((n: number) => void) | undefined;
  onPatch: (p: { enabled?: boolean; text?: string; hours?: number }) => void;
}) {
  const def: AutomationDef = AUTOMATIONS[k];
  const setting = a.texts[k] ?? {};
  const on = isOn(a, k);
  const value = setting.text ?? def.text;
  const changed = value.trim() !== def.text;
  const preview = textFor({ ...a, texts: { ...a.texts, [k]: { ...setting, enabled: true } } }, k, SAMPLE) ?? "";
  const unknown = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((f) => !def.fields.includes(f));
  const timingValue = hours ?? setting.hours ?? def.timing?.default;

  return (
    <div className={cn("space-y-3 rounded-2xl bg-background p-4 shadow-sm", !on && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            {def.label}
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-normal text-muted-foreground">
              To {def.who === "candidate" ? "candidate" : "manager"}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">{def.when}</div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          {on ? "On" : "Off"}
          <Switch checked={on} disabled={!canEdit || !def.canTurnOff} onCheckedChange={(v) => onPatch({ enabled: v })} aria-label={`${def.label} on or off`} />
        </label>
      </div>

      {on && (
        <>
          {def.timing && timingValue !== undefined && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              {def.timing.label}
              <Input
                type="number"
                className="h-8 w-20"
                min={def.timing.min}
                max={def.timing.max}
                disabled={!canEdit}
                value={timingValue}
                onChange={(e) => {
                  const n = clamp(Number(e.target.value), def.timing!.min, def.timing!.max);
                  if (onHours) onHours(n);
                  else onPatch({ hours: n });
                }}
              />
              {def.timing.unit}
            </label>
          )}
          <Textarea
            rows={3}
            disabled={!canEdit}
            value={value}
            maxLength={600}
            onChange={(e) => onPatch({ text: e.target.value })}
            aria-label={`${def.label} wording`}
          />
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Fill-ins:</span>
            {def.fields.map((f) => (
              <button
                key={f}
                type="button"
                disabled={!canEdit}
                title={FIELD_HELP[f]}
                onClick={() => onPatch({ text: `${value}${value.endsWith(" ") ? "" : " "}{${f}}` })}
                className="rounded-full bg-secondary px-2 py-0.5 font-mono hover:bg-secondary/70"
              >
                {`{${f}}`}
              </button>
            ))}
            {changed && canEdit && (
              <button type="button" className="ml-auto flex items-center gap-1 text-sapphire" onClick={() => onPatch({ text: def.text })}>
                <RotateCcw className="size-3" />
                Reset to default
              </button>
            )}
          </div>
          {unknown.length > 0 && (
            <p className="text-xs text-destructive">
              {unknown.map((u) => `{${u}}`).join(", ")} isn't a fill-in for this text and will be left blank.
            </p>
          )}
          <div className="rounded-xl bg-accent p-3 text-sm">
            <div className="mb-1 text-xs text-muted-foreground">
              Preview · {preview.length} characters · {segments(preview)} text{segments(preview) === 1 ? "" : "s"}
            </div>
            {preview}
          </div>
        </>
      )}
    </div>
  );
}

/** Later check-in wording, and who the next run would text with the settings on screen. */
function WaitingPreview({ a, canEdit }: { a: Automations; canEdit: boolean }) {
  const org = useOrg();
  const preview = useServerFn(previewWaitingCheckins);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof previewWaitingCheckins>> | null>(null);
  const forced: Automations = { ...a, texts: { ...a.texts, waiting: { ...a.texts["waiting"], enabled: true } } };
  const later = a.texts["waiting"]?.text ? [] : [2, 3, 4].map((n) => waitingText(forced, n, SAMPLE)!);

  async function run() {
    setBusy(true);
    try {
      setResult(await preview({ data: { orgId: org.orgId, automations: a } }));
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3 rounded-2xl bg-background p-4 shadow-sm">
      <div className="font-semibold">How the check-ins work</div>
      <p className="text-sm text-muted-foreground">
        An applicant gets one only after they've already had a text from us, nobody has taken over their conversation,
        and they haven't texted in the meantime. It stops after 4 check-ins, when they move to Interview, Offer, Hired
        or Not selected, if they reply STOP, or 45 days after they applied.
      </p>
      {later.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">Later check-ins switch up the wording so it doesn't repeat:</div>
          {later.map((t, i) => (
            <div key={i} className="rounded-xl bg-accent p-3 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">Check-in {i + 2}</div>
              {t}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="space-y-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={run}>
            {busy ? "Checking…" : "Preview who would get one now"}
          </Button>
          {result && (
            <div className="space-y-2 text-sm">
              <p>
                {result.total === 0
                  ? "Nobody would get a check-in right now."
                  : `With these settings, ${result.total} applicant${result.total === 1 ? "" : "s"} would get a check-in on the next run.`}{" "}
                <span className="text-muted-foreground">Nothing was sent.</span>
              </p>
              {result.people.map((p, i) => (
                <div key={i} className="rounded-xl bg-accent p-3">
                  <div className="mb-1 text-xs text-muted-foreground">
                    {p.first} · {p.job} · {p.store} · check-in {p.n}
                  </div>
                  {p.body}
                </div>
              ))}
              {result.total > result.people.length && (
                <p className="text-xs text-muted-foreground">…and {result.total - result.people.length} more.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
