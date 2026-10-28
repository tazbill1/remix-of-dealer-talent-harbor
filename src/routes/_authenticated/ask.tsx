import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useOrg } from "@/lib/org";
import { askHiringAssistant } from "@/lib/gm-assistant.functions";
import { parseLinks } from "@/lib/gm-assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/ask")({
  head: () => ({
    meta: [
      { title: "Ask | WerkandMe Hiring" },
      { name: "description", content: "Ask the hiring assistant about your applicants and interviews." },
    ],
  }),
  component: AskPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const EXAMPLES = [
  "Who did I interview last week?",
  "Find four good service candidates",
  "Who applied for sales this week?",
  "Which applicants need a decision?",
];

function Reply({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap">
      {parseLinks(text).map((s, i) =>
        s.href ? (
          <Link key={i} to={s.href as any} className="font-medium text-primary underline underline-offset-2">
            {s.text}
          </Link>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

function AskPage() {
  const org = useOrg();
  const ask = useServerFn(askHiringAssistant);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(q: string) {
    const body = q.trim();
    if (!body || busy) return;
    const next = [...msgs, { role: "user" as const, content: body }];
    setMsgs(next);
    setText("");
    setError(null);
    setBusy(true);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Detroit";
      const r = await ask({ data: { orgId: org.orgId, timeZone, messages: next.slice(-20) } });
      setMsgs([...next, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="size-5" /> Ask</h1>
        <p className="text-sm text-muted-foreground">
          Ask about applicants and interviews at your stores. It only looks things up; it never texts or changes anyone.
        </p>
      </div>

      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <Button key={e} variant="outline" size="sm" onClick={() => send(e)} disabled={busy}>{e}</Button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={m.role === "user"
              ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground"
              : "max-w-[95%] rounded-2xl border bg-card px-4 py-3 text-sm"}
          >
            {m.role === "user" ? m.content : <Reply text={m.content} />}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Looking that up...</div>}
        {error && <div className="text-sm text-destructive">{error}</div>}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); void send(text); }}
      >
        <Textarea
          aria-label="Your question"
          rows={2}
          value={text}
          placeholder="e.g. Who did I interview last week?"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
        />
        <Button type="submit" disabled={busy || !text.trim()} aria-label="Send"><Send /></Button>
      </form>
    </div>
  );
}
