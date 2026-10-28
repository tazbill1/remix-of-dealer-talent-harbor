import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Download, Loader2, Send } from "lucide-react";
import { useOrg } from "@/lib/org";
import { askHiringAssistant } from "@/lib/gm-assistant.functions";
import { parseLinks, reportNote, type Report } from "@/lib/gm-assistant";
import { downloadReport, prepareReportPdf } from "@/lib/report-download";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type AskMsg = { role: "user" | "assistant"; content: string; reports?: Report[] };

const EXAMPLES = [
  "Who did I interview last week?",
  "Find four good service candidates",
  "Tech pipeline at each store",
  "Which applicants need a decision?",
];

// Stage colors for the chart, lightest (new) to darkest (offer); closed stages muted.
const BAR = ["bg-primary/30", "bg-primary/50", "bg-primary/70", "bg-primary", "bg-status-connected-foreground", "bg-muted-foreground/40"];

/** "/applicants?store=x" → router props, so the query string becomes real search params. */
function linkProps(href: string) {
  const [to, query = ""] = href.split("?");
  return { to: (to || "/") as any, search: Object.fromEntries(new URLSearchParams(query)) as any };
}

function Reply({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap">
      {parseLinks(text).map((s, i) =>
        s.href ? (
          <Link key={i} {...linkProps(s.href)} className="font-medium text-primary underline underline-offset-2">
            {s.text}
          </Link>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

function ReportCard({ report }: { report: Report }) {
  const org = useOrg();
  const paper = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const max = Math.max(1, ...report.rows.map((r) => r.total));
  async function pdf() {
    if (!paper.current) return;
    setBusy(true);
    try {
      const blob = await prepareReportPdf(paper.current);
      downloadReport(blob, `${report.title.replace(/[^\w -]/g, "").trim() || "report"}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-2">
      <div ref={paper} className="rounded-lg border bg-background p-3 text-foreground">
        <header data-pdf-block className="mb-2">
          <p className="text-xs text-muted-foreground">{org.orgName}</p>
          <h3 className="text-base font-semibold">{report.title}</h3>
          <p className="text-xs text-muted-foreground">{report.subtitle} · {format(new Date(), "MMM d, yyyy")}</p>
        </header>
        {report.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No applicants match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead data-pdf-block>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">{report.groupLabel}</th>
                  {report.columns.map((c) => <th key={c} className="px-1 py-1 text-right font-medium">{c}</th>)}
                  <th className="py-1 pl-1 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.label} data-pdf-block className="border-b last:border-0">
                    <td className="py-1 pr-2">
                      {r.href ? <Link {...linkProps(r.href)} className="text-primary underline-offset-2 hover:underline">{r.label}</Link> : r.label}
                    </td>
                    {r.cells.map((n, i) => <td key={i} className="px-1 py-1 text-right">{n}</td>)}
                    <td className="py-1 pl-1 text-right font-semibold">{r.total}</td>
                  </tr>
                ))}
                <tr data-pdf-block className="border-t font-semibold">
                  <td className="py-1 pr-2">Total</td>
                  {report.totals.map((n, i) => <td key={i} className="px-1 py-1 text-right">{n}</td>)}
                  <td className="py-1 pl-1 text-right">{report.total}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {report.chart && report.rows.length > 0 && (
          <div data-pdf-block className="mt-3 space-y-1.5">
            {report.rows.map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 truncate" title={r.label}>{r.label}</span>
                <div className="flex h-3 flex-1 overflow-hidden rounded-sm bg-muted" style={{ maxWidth: `${(r.total / max) * 100}%` }}>
                  {r.cells.map((n, i) => n > 0 && <div key={i} className={BAR[i]} style={{ width: `${(n / r.total) * 100}%` }} title={`${report.columns[i]}: ${n}`} />)}
                </div>
                <span className="w-6 shrink-0 text-right tabular-nums">{r.total}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
              {report.columns.map((c, i) => <span key={c} className="flex items-center gap-1"><span className={cn("inline-block size-2 rounded-sm", BAR[i])} />{c}</span>)}
            </div>
          </div>
        )}
        <footer data-pdf-block className="mt-2 text-[11px] text-muted-foreground">Prepared by Ask · hireme by WerkandMe</footer>
      </div>
      <Button variant="outline" size="sm" onClick={pdf} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Download />}Download PDF
      </Button>
    </div>
  );
}

/** The Ask conversation. Used on the Ask page and in the chat panel. */
export function AskChat({ msgs, setMsgs, compact = false }: { msgs: AskMsg[]; setMsgs: (m: AskMsg[]) => void; compact?: boolean }) {
  const org = useOrg();
  const ask = useServerFn(askHiringAssistant);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs.length, busy]);

  async function send(q: string) {
    const body = q.trim();
    if (!body || busy) return;
    const next: AskMsg[] = [...msgs, { role: "user", content: body }];
    setMsgs(next);
    setText("");
    setError(null);
    setBusy(true);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Detroit";
      // Reports travel as a short note so follow-ups ("only last 30 days") can adjust them.
      const history = next.slice(-20).map((m) => ({
        role: m.role,
        content: [m.content, ...(m.reports ?? []).map(reportNote)].filter(Boolean).join("\n").slice(0, 6000) || "(report)",
      }));
      const r = await ask({ data: { orgId: org.orgId, timeZone, messages: history } });
      setMsgs([...next, { role: "assistant", content: r.reply, reports: r.reports }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <Button key={e} variant="outline" size="sm" onClick={() => send(e)} disabled={busy}>{e}</Button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={m.role === "user"
              ? "ml-auto w-fit max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground"
              : cn("rounded-2xl border bg-card px-4 py-3 text-sm", compact ? "max-w-full" : "max-w-[95%]")}
          >
            {m.role === "user" ? m.content : (
              <>
                {m.content && <Reply text={m.content} />}
                {m.reports?.map((r, j) => <ReportCard key={j} report={r} />)}
              </>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Looking that up...</div>}
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div ref={end} />
      </div>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <Textarea
          aria-label="Your question"
          rows={2}
          value={text}
          placeholder="e.g. Tech pipeline at each store"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
        />
        <Button type="submit" disabled={busy || !text.trim()} aria-label="Send"><Send /></Button>
      </form>
    </div>
  );
}
