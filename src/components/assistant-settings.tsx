import { Bot } from "lucide-react";
import { DEFAULT_HANDOFF, DEFAULT_SCREENING, TONES, assistantSettings, type Automations, type Tone } from "@/lib/automations";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** How the AI assistant talks, what it can share, what it asks, and when a person takes over. */
export function AssistantSettings({
  a,
  canEdit,
  onChange,
}: {
  a: Automations;
  canEdit: boolean;
  onChange: (a: Automations) => void;
}) {
  const s = assistantSettings(a);
  const raw = a.assistant ?? {};
  const set = (p: Partial<NonNullable<Automations["assistant"]>>) => onChange({ ...a, assistant: { ...raw, ...p } });

  return (
    <section className="space-y-4 rounded-2xl bg-background p-5 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-lg">
          <Bot className="size-5 text-sapphire" />
          AI assistant
        </h2>
        <p className="text-sm text-muted-foreground">
          Each store's assistant answers candidates by text, asks screening questions and books interviews into open
          times only. These rules apply to every store in the group.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="text-sm font-medium">Tone</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TONES) as Tone[]).map((t) => (
            <button
              key={t}
              type="button"
              disabled={!canEdit}
              onClick={() => set({ tone: t })}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm",
                s.tone === t ? "border-sapphire bg-sapphire/10" : "bg-background",
              )}
            >
              <div className="font-medium">{TONES[t].label}</div>
              <div className="text-xs text-muted-foreground">{TONES[t].prompt}</div>
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Facts it can share</span>
        <span className="block text-xs text-muted-foreground">
          Pay ranges, benefits, schedules, perks, dress code, what to bring. The assistant never guesses beyond this
          and the job description. Leave blank and it will say the team will share details.
        </span>
        <Textarea
          rows={5}
          maxLength={4000}
          disabled={!canEdit}
          value={raw.facts ?? ""}
          onChange={(e) => set({ facts: e.target.value })}
          placeholder={"Techs: $25-$40/hr flat rate, based on experience.\nMedical, dental and vision after 60 days. 401(k) with match.\nShop hours Mon-Fri 7:30-6, Sat 8-1 (rotating).\nBring your driver's license and two forms of ID to the interview."}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">What to screen for</span>
        <span className="block text-xs text-muted-foreground">One per line. Asked one at a time, skipping anything already answered on the application.</span>
        <Textarea
          rows={5}
          maxLength={1500}
          disabled={!canEdit}
          value={raw.screening ?? DEFAULT_SCREENING}
          onChange={(e) => set({ screening: e.target.value })}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Hand off to a person when the candidate brings up…</span>
        <span className="block text-xs text-muted-foreground">
          One per line. The assistant replies that someone will follow up, flags the profile "Needs you" and texts the
          hiring manager.
        </span>
        <Textarea
          rows={5}
          maxLength={1500}
          disabled={!canEdit}
          value={raw.handoff ?? DEFAULT_HANDOFF}
          onChange={(e) => set({ handoff: e.target.value })}
        />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 p-3 text-sm">
        <span>
          <span className="font-medium">Pause the assistant after a hand-off</span>
          <span className="block text-xs text-muted-foreground">
            It stops replying to that candidate until someone hands it back from their profile.
          </span>
        </span>
        <Switch checked={s.pauseOnHandoff} disabled={!canEdit} onCheckedChange={(v) => set({ pauseOnHandoff: v })} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Anything else it should know (optional)</span>
        <Textarea
          rows={3}
          maxLength={1500}
          disabled={!canEdit}
          value={raw.instructions ?? ""}
          onChange={(e) => set({ instructions: e.target.value })}
          placeholder="Mention the $1,000 sign-on bonus for techs. Always offer a shop tour at the interview."
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Always on: it never asks about age, race, religion, disability, pregnancy, family or other protected traits, and
        never promises a job.
      </p>
    </section>
  );
}
