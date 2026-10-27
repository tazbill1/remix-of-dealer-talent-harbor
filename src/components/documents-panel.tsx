import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileText, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listSignTemplates, sendDocuments, signedCopy } from "@/lib/documents.functions";
import { OFFER_LABEL, prettyDate, type OfferStatus } from "@/lib/offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const TONE: Partial<Record<OfferStatus, string>> = {
  signed: "bg-lime/30",
  declined: "bg-destructive/15 text-destructive",
  failed: "bg-destructive/15 text-destructive",
  revoked: "bg-secondary text-muted-foreground",
  expired: "bg-secondary text-muted-foreground",
};

/** Send any BoldSign template to the applicant and follow each document. */
export function DocumentsPanel({ orgId, appId, jobTitle, hasPhone }: { orgId: string; appId: string; jobTitle: string; hasPhone: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listSignTemplates);
  const send = useServerFn(sendDocuments);
  const download = useServerFn(signedCopy);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [title, setTitle] = useState(jobTitle);
  const [pay, setPay] = useState("");
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [textLink, setTextLink] = useState(true);

  const { data: tpl, isLoading } = useQuery({
    queryKey: ["sign-templates", orgId],
    queryFn: () => list({ data: { orgId } }),
    enabled: open,
    staleTime: 30_000,
  });
  const key = ["documents", appId];
  const { data: docs = [] } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (
        await supabase
          .from("offers")
          .select("id, status, template_name, is_offer_letter, created_at, error")
          .eq("application_id", appId)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const chosen = Object.entries(picked).map(([id, name]) => ({ id, name }));

  async function submit() {
    setBusy(true);
    try {
      const r = await send({ data: { orgId, applicationId: appId, templates: chosen, jobTitle: title, pay, startDate: start, note, textLink: textLink && hasPhone } });
      const bad = r.results.filter((x) => !x.ok);
      const good = r.results.length - bad.length;
      if (good) toast.success(`${good} document${good === 1 ? "" : "s"} sent for signature`);
      bad.forEach((b) => toast.error(`${b.name}: ${b.error}`));
      if (r.textNote) toast.message(r.textNote);
      setOpen(false);
      setReview(false);
      setPicked({});
    } catch (e) {
      toast.error((e as Error).message);
    }
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["offers", appId] });
    setBusy(false);
  }

  async function save(id: string) {
    try {
      const r = await download({ data: { orgId, offerId: id } });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <FileText className="size-4 text-sapphire" />
          Documents to sign
        </div>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Send />
            Send document
          </Button>
        )}
      </div>

      {open && !review && (
        <div className="space-y-2 text-sm">
          {isLoading && <p className="text-muted-foreground">Loading your BoldSign templates…</p>}
          {tpl && !tpl.connected && <p className="text-muted-foreground">BoldSign isn't connected yet.</p>}
          {tpl?.error && <p className="text-destructive">{tpl.error}</p>}
          {tpl?.connected && !tpl.error && tpl.templates.length === 0 && (
            <p className="text-muted-foreground">No templates yet. Create one in BoldSign and it will show up here.</p>
          )}
          {tpl?.templates.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
              <Checkbox
                checked={!!picked[t.id]}
                onCheckedChange={(v) =>
                  setPicked((p) => {
                    const n = { ...p };
                    if (v) n[t.id] = t.name;
                    else delete n[t.id];
                    return n;
                  })
                }
              />
              <span className="font-medium">{t.name}</span>
            </label>
          ))}
          <div className="flex gap-2">
            <Button size="sm" disabled={!chosen.length} onClick={() => setReview(true)}>
              Next
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {open && review && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Sending: <span className="font-medium text-foreground">{chosen.map((c) => c.name).join(", ")}</span>. These
            details fill in the matching boxes.
          </p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" />
          <Input value={pay} onChange={(e) => setPay(e.target.value)} placeholder="Pay (optional)" />
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start date" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Message to the applicant (optional)" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={textLink && hasPhone} disabled={!hasPhone} onChange={(e) => setTextLink(e.target.checked)} />
            {hasPhone ? "Also text them one link to sign everything" : "No mobile number, so BoldSign will email them only"}
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || title.trim().length < 2} onClick={submit}>
              <Send />
              {busy ? "Sending…" : "Send for signature"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReview(false)}>
              Back
            </Button>
          </div>
        </div>
      )}

      {docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{d.template_name ?? (d.is_offer_letter ? "Offer letter" : "Document")}</div>
                <div className="text-xs text-muted-foreground">sent {prettyDate(d.created_at.slice(0, 10))}</div>
                {d.status === "failed" && d.error && <div className="text-xs text-destructive">{d.error}</div>}
              </div>
              <div className="flex items-center gap-1">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[d.status as OfferStatus] ?? "bg-accent")}>
                  {OFFER_LABEL[d.status as OfferStatus] ?? d.status}
                </span>
                {d.status === "signed" && (
                  <Button size="sm" variant="ghost" aria-label="Download signed copy" onClick={() => save(d.id)}>
                    <Download />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
