import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardList, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { integrationStatus } from "@/lib/email.functions";
import { cancelOffer, sendOnboarding } from "@/lib/offers.functions";
import { isOpen, OFFER_LABEL, type OfferStatus } from "@/lib/offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const LABEL: Record<OfferStatus, string> = { ...OFFER_LABEL, signed: "Completed" };

/** Send new-hire paperwork (W-4, I-9, direct deposit...) through BoldSign as one packet. */
export function OnboardingPanel({
  orgId,
  appId,
  hasPhone,
  defaultStart,
  onChanged,
}: {
  orgId: string;
  appId: string;
  hasPhone: boolean;
  defaultStart: string | null;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const send = useServerFn(sendOnboarding);
  const cancel = useServerFn(cancelOffer);
  const getStatus = useServerFn(integrationStatus);
  const { data: env } = useQuery({
    queryKey: ["integration-status", orgId],
    queryFn: () => getStatus({ data: { orgId } }),
    staleTime: 60_000,
  });
  const key = ["onboarding-docs", appId];
  const { data: packets = [] } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (
        await supabase
          .from("offers")
          .select("id, status, documents, created_at, error")
          .eq("application_id", appId)
          .eq("kind", "onboarding")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const templates = env?.onboardingTemplates ?? [];
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [start, setStart] = useState(defaultStart ?? "");
  const [note, setNote] = useState("");
  const [textLink, setTextLink] = useState(true);
  const [busy, setBusy] = useState(false);
  const ready = !!env?.boldsign && templates.length > 0;
  const pending = packets.some((p) => isOpen(p.status));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    onChanged();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await send({ data: { orgId, applicationId: appId, templateIds: picked, startDate: start, note, textLink } });
      toast.success("Paperwork sent");
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
          <ClipboardList className="size-4 text-sapphire" />
          New-hire paperwork
        </div>
        {ready && !pending && !open && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPicked(templates.map((t) => t.id));
              setOpen(true);
            }}
          >
            <Send />
            Send paperwork
          </Button>
        )}
      </div>

      {!ready && (
        <p className="text-sm text-muted-foreground">
          Send W-4, I-9, direct deposit and other forms to sign on their phone.{" "}
          {env && !env.boldsign ? "Connect BoldSign and add your forms" : "Add your forms"} on{" "}
          <Link to="/integrations" className="underline">
            Integrations
          </Link>
          .
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            {templates.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(t.id)}
                  onChange={(e) =>
                    setPicked(e.target.checked ? [...picked, t.id] : picked.filter((x) => x !== t.id))
                  }
                />
                {t.name}
              </label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              Start date
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs">
              Message (optional)
              <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Bring two forms of ID on day one." />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={textLink && hasPhone} disabled={!hasPhone} onChange={(e) => setTextLink(e.target.checked)} />
            {hasPhone ? "Also text them the link" : "No mobile number, so BoldSign will email it only"}
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || picked.length === 0}>
              {busy ? "Sending…" : `Send ${picked.length} form${picked.length === 1 ? "" : "s"}`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            All forms go out together: one link, signed in one sitting. I-9 Section 2 still needs someone to see their
            ID documents in person within 3 business days of their start date.
          </p>
        </form>
      )}

      {packets.length > 0 && (
        <ul className="space-y-2">
          {packets.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{(p.documents ?? []).join(", ") || "Paperwork"}</div>
                <div className="text-xs text-muted-foreground">sent {new Date(p.created_at).toLocaleDateString()}</div>
                {p.status === "failed" && p.error && <div className="text-xs text-destructive">{p.error}</div>}
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    p.status === "signed" ? "bg-lime/30" : isOpen(p.status) ? "bg-accent" : "bg-secondary text-muted-foreground",
                    (p.status === "failed" || p.status === "declined") && "bg-destructive/15 text-destructive",
                  )}
                >
                  {LABEL[p.status as OfferStatus] ?? p.status}
                </span>
                {isOpen(p.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Cancel paperwork"
                    onClick={async () => {
                      try {
                        await cancel({ data: { orgId, offerId: p.id } });
                        toast.success("Paperwork request cancelled");
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
