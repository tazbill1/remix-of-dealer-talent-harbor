import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileSignature, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { integrationStatus } from "@/lib/email.functions";
import { cancelOffer, sendOffer } from "@/lib/offers.functions";
import { isOpen, OFFER_LABEL, prettyDate, type OfferStatus } from "@/lib/offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TONE: Record<OfferStatus, string> = {
  sent: "bg-accent",
  viewed: "bg-accent",
  signed: "bg-lime/30",
  declined: "bg-destructive/15 text-destructive",
  revoked: "bg-secondary text-muted-foreground",
  expired: "bg-secondary text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};

/** Send an offer letter through BoldSign and follow its status. */
export function OfferPanel({
  orgId,
  appId,
  jobTitle,
  defaultPay,
  hasPhone,
  onChanged,
}: {
  orgId: string;
  appId: string;
  jobTitle: string;
  defaultPay: string | null;
  hasPhone: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const send = useServerFn(sendOffer);
  const cancel = useServerFn(cancelOffer);
  const getStatus = useServerFn(integrationStatus);
  const { data: env } = useQuery({
    queryKey: ["integration-status", orgId],
    queryFn: () => getStatus({ data: { orgId } }),
    staleTime: 60_000,
  });
  const key = ["offers", appId];
  const { data: offers = [] } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (
        await supabase
          .from("offers")
          .select("id, status, job_title, pay, start_date, created_at, error")
          .eq("application_id", appId)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(jobTitle);
  const [pay, setPay] = useState(defaultPay ?? "");
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");
  const [textLink, setTextLink] = useState(true);
  const [busy, setBusy] = useState(false);

  const ready = !!env?.boldsign && !!env?.offerTemplateId;
  const pending = offers.some((o) => isOpen(o.status));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    onChanged();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await send({ data: { orgId, applicationId: appId, jobTitle: title, pay, startDate: start, note, textLink } });
      toast.success("Offer sent for signature");
      if (r.textNote) toast.message(r.textNote);
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
      refresh();
    }
    setBusy(false);
  }

  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <FileSignature className="size-4 text-sapphire" />
          Offer letter
        </div>
        {ready && !pending && !open && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Send />
            Send offer
          </Button>
        )}
      </div>

      {!ready && (
        <p className="text-sm text-muted-foreground">
          Offers are signed through BoldSign.{" "}
          {env && !env.boldsign ? "Add the BoldSign API key, then pick your offer template" : "Pick your offer letter template"} on{" "}
          <Link to="/integrations" className="underline">
            Integrations
          </Link>
          .
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              Job title
              <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs">
              Pay
              <Input placeholder="e.g. $28/hr + flat rate bonus" value={pay} onChange={(e) => setPay(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs">
              Start date
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1 text-xs">
            Message to the candidate (optional)
            <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="We're excited to have you on the team!" />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={textLink && hasPhone} disabled={!hasPhone} onChange={(e) => setTextLink(e.target.checked)} />
            {hasPhone ? "Also text them the signing link" : "No mobile number, so BoldSign will email it only"}
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send for signature"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            BoldSign emails the letter too, and reminds them every 2 days until they sign.
          </p>
        </form>
      )}

      {offers.length > 0 && (
        <ul className="space-y-2">
          {offers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{o.job_title}</div>
                <div className="text-xs text-muted-foreground">
                  {[o.pay, o.start_date && `starts ${prettyDate(o.start_date)}`, `sent ${new Date(o.created_at).toLocaleDateString()}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {o.status === "failed" && o.error && <div className="text-xs text-destructive">{o.error}</div>}
              </div>
              <div className="flex items-center gap-1">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[o.status as OfferStatus] ?? "bg-secondary")}>
                  {OFFER_LABEL[o.status as OfferStatus] ?? o.status}
                </span>
                {isOpen(o.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Cancel offer"
                    onClick={async () => {
                      try {
                        await cancel({ data: { orgId, offerId: o.id } });
                        toast.success("Offer cancelled");
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                      refresh();
                    }}
                  >
                    <X />
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
