import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { translateApplicantList } from "@/lib/applicant-list.functions";
import type { ListFilterResult } from "@/lib/applicant-list-filters";

export function AskApplicantList({ orgId, onApply }: { orgId: string; onApply: (result: ListFilterResult) => void }) {
  const translate = useServerFn(translateApplicantList);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  return <div className="max-w-xl space-y-1.5">
    <form className="flex items-center gap-2" onSubmit={async (e) => {
      e.preventDefault(); if (!request.trim() || busy) return;
      setBusy(true); setFeedback("");
      try { const result = await translate({ data: { orgId, request } }); onApply(result); setFeedback(result.unmapped.join(" ")); }
      catch (error) { setFeedback(error instanceof Error ? error.message : "Couldn't apply those filters."); }
      finally { setBusy(false); }
    }}>
      <Input aria-label="Ask for a list" placeholder="Ask for a list…" value={request} maxLength={500} disabled={busy} onChange={(e) => setRequest(e.target.value)} className="h-9" />
      <Button type="submit" variant="outline" size="icon" className="size-9 shrink-0" aria-label="Apply list filters" title="Apply list filters" disabled={busy || !request.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}</Button>
    </form>
    {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
  </div>;
}