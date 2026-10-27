import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, ExternalLink, FileSignature, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listSignTemplates, saveHireOnSign } from "@/lib/documents.functions";
import { saveOfferTemplate } from "@/lib/offers.functions";
import { DOC_FIELDS } from "@/lib/offers";
import { SITE_URL } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BoldSignSetup({ orgId, isAdmin, apiKey, webhook, templateId, onSaved }: {
  orgId: string;
  isAdmin: boolean;
  apiKey: boolean;
  webhook: boolean;
  templateId: string | null;
  onSaved: () => void;
}) {
  const list = useServerFn(listSignTemplates);
  const saveTemplate = useServerFn(saveOfferTemplate);
  const saveHire = useServerFn(saveHireOnSign);
  const [value, setValue] = useState(templateId ?? "");
  const [saving, setSaving] = useState(false);
  const [savingHire, setSavingHire] = useState(false);
  useEffect(() => setValue(templateId ?? ""), [templateId]);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["sign-templates", orgId],
    queryFn: () => list({ data: { orgId } }),
  });
  const { data: hire, refetch: refetchHire } = useQuery({
    queryKey: ["hire-on-sign", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("messaging_settings")
        .select("hire_on_offer_signed").eq("org_id", orgId).maybeSingle();
      if (error) throw error;
      return !!data?.hire_on_offer_signed;
    },
  });
  const templates = data?.templates ?? [];
  const connectionError = data?.error || error?.message;
  const checked = !!data?.connected && !connectionError;
  const hookUrl = `${SITE_URL}/api/public/boldsign/webhook`;

  return (
    <section aria-labelledby="boldsign-title" className="min-w-0 border-t pt-6 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="boldsign-title" className="flex items-center gap-2 text-xl font-semibold">
          <FileSignature className="size-5 text-sapphire" /> BoldSign
        </h2>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => { refetch(); onSaved(); }}>
          <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {isFetching ? "Checking…" : "Check connection"}
        </Button>
      </div>

      <div className="mt-4 divide-y">
        <div className="flex items-start gap-3 py-4">
          <StepMarker done={checked} number={1} />
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="font-medium">Connection</h3>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Checking BoldSign…" : connectionError ? "Connection needs attention" : checked ? "Connected · template access checked" : apiKey ? "Connection added; access not confirmed" : "Not connected"}
            </p>
            {connectionError && <p role="alert" className="break-words text-sm text-destructive">{connectionError}</p>}
            {!apiKey && <p className="text-sm text-muted-foreground">Ask the account owner to connect BoldSign through Lovable’s secure connection form.</p>}
          </div>
        </div>

        <div className="flex items-start gap-3 py-4">
          <StepMarker done={!!templateId} number={2} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="boldsign-offer-template" className="font-medium">Offer letter template</label>
              <Button asChild variant="link" size="sm" className="h-auto px-0">
                <a href="https://app.boldsign.com" target="_blank" rel="noopener noreferrer">Open BoldSign <ExternalLink className="size-3.5" /></a>
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={value || "none"} onValueChange={(next) => setValue(next === "none" ? "" : next)} disabled={!isAdmin || !checked || saving}>
                <SelectTrigger id="boldsign-offer-template" className="min-w-0 flex-1" aria-label="Offer letter template">
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No offer template selected</SelectItem>
                  {value && !templates.some((t) => t.id === value) && <SelectItem value={value}>Saved template (not in current list)</SelectItem>}
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {isAdmin && <Button size="sm" disabled={saving || !checked || value === (templateId ?? "")} onClick={async () => {
                setSaving(true);
                try {
                  await saveTemplate({ data: { orgId, templateId: value } });
                  toast.success("Offer template saved");
                  onSaved();
                } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save template"); }
                finally { setSaving(false); }
              }}>{saving && <Loader2 className="size-4 animate-spin" />} {saving ? "Saving…" : "Save template"}</Button>}
            </div>
            {checked && templates.length === 0 && <p className="text-sm text-muted-foreground">No templates found. Create your first template in BoldSign, then check the connection again.</p>}
            {templates.length > 0 && <p className="text-xs text-muted-foreground">{templates.length} {templates.length === 1 ? "template" : "templates"} available</p>}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Template field reference</summary>
              <p className="mt-2 text-muted-foreground">Applicant: role 1, signer.</p>
              <div className="mt-2 flex flex-wrap gap-1">{DOC_FIELDS.map((f) => <code key={f.id} className="rounded bg-secondary px-2 py-1 text-xs">{f.id}</code>)}</div>
            </details>
          </div>
        </div>

        <div className="flex items-start gap-3 py-4">
          <StepMarker done={webhook} number={3} />
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="font-medium">Signing updates</h3>
            <p className="text-sm text-muted-foreground">{webhook ? "Signing secret saved · updates enabled" : "Not set up · documents can send, but signing status won’t update automatically"}</p>
            <details key={String(webhook)} open={webhook ? undefined : true} className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{webhook ? "View signing update settings" : "Complete signing update setup"}</summary>
              <ol className="mt-3 list-decimal space-y-3 pl-5 text-muted-foreground">
                <li>In BoldSign, open API → Webhooks → Add webhook.</li>
                <li>
                  <span>Use this address:</span>
                  <div className="mt-2 flex items-start gap-2">
                    <code className="min-w-0 flex-1 break-all rounded bg-secondary p-2 text-xs">{hookUrl}</code>
                    <Button variant="outline" size="icon" title="Copy signing update address" aria-label="Copy signing update address" onClick={async () => {
                      try { await navigator.clipboard.writeText(hookUrl); toast.success("Address copied"); }
                      catch { toast.error("Could not copy; select the address and copy it manually"); }
                    }}><Copy className="size-4" /></Button>
                  </div>
                </li>
                <li>Select Sent, Viewed, Completed, Declined, Revoked, Expired, Send Failed and Delivery Failed.</li>
                <li>Save, then add the signing secret through Lovable’s secure secret form as <code className="break-all">BOLDSIGN_WEBHOOK_SECRET</code>. Never paste it into chat.</li>
              </ol>
            </details>
          </div>
        </div>
      </div>
      <label className="flex items-center justify-between gap-4 border-t py-4 text-sm">
        <span>Move applicants to Hired when they sign the offer letter</span>
        <Switch checked={!!hire} disabled={!isAdmin || savingHire || hire === undefined} onCheckedChange={async (on) => {
          setSavingHire(true);
          try { await saveHire({ data: { orgId, on } }); await refetchHire(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Could not save setting"); }
          finally { setSavingHire(false); }
        }} />
      </label>
    </section>
  );
}

function StepMarker({ done, number }: { done: boolean; number: number }) {
  return done ? <CheckCircle2 aria-label="Complete" className="mt-0.5 size-6 shrink-0 text-sapphire" /> :
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground">{number}</span>;
}