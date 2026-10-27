import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  CalendarDays,
  FileSignature,
  Mail,
  MessageSquare,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { integrationStatus } from "@/lib/email.functions";
import { saveOfferTemplate } from "@/lib/offers.functions";
import { OFFER_FIELDS } from "@/lib/offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrations | WerkandMe Hiring" }] }),
  component: Integrations,
});

type State = "connected" | "practice" | "not_connected" | "partner";
const STATE_LABEL: Record<State, string> = {
  connected: "Connected",
  practice: "Practice mode",
  not_connected: "Not connected",
  partner: "Partner to be chosen",
};
const STATE_STYLE: Record<State, string> = {
  connected: "bg-lime/20 text-foreground",
  practice: "bg-accent text-foreground",
  not_connected: "bg-secondary text-muted-foreground",
  partner: "bg-secondary text-muted-foreground",
};

function Card({
  icon: Icon,
  title,
  state,
  what,
  needs,
  children,
}: {
  icon: LucideIcon;
  title: string;
  state: State;
  what: string;
  needs: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Icon className="size-5 text-sapphire" />
          {title}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
            STATE_STYLE[state],
          )}
        >
          {STATE_LABEL[state]}
        </span>
      </div>
      <p className="mt-2 text-sm">{what}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        <b>To connect:</b> {needs}
      </p>
      {children}
    </div>
  );
}

function Integrations() {
  const org = useOrg();
  const qc = useQueryClient();
  const isAdmin = org.role === "group_admin" || org.isPlatformAdmin;
  const getStatus = useServerFn(integrationStatus);
  const { data: env } = useQuery({
    queryKey: ["integration-status", org.orgId],
    queryFn: () => getStatus({ data: { orgId: org.orgId } }),
  });
  const settingsKey = ["messaging-settings-integrations", org.orgId];
  const { data: settings } = useQuery({
    queryKey: settingsKey,
    queryFn: async () =>
      (
        await supabase
          .from("messaging_settings")
          .select("mode, ai_provider, email_mode, email_from_name, email_reply_to, email_from_address")
          .eq("org_id", org.orgId)
          .maybeSingle()
      ).data,
  });
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  useEffect(() => {
    setFromName(settings?.email_from_name ?? "");
    setReplyTo(settings?.email_reply_to ?? "");
    setFromAddress(settings?.email_from_address ?? "");
  }, [settings?.email_from_name, settings?.email_reply_to, settings?.email_from_address]);

  const smsLive = settings?.mode === "live";
  const emailLive = settings?.email_mode === "live";
  const smsState: State = smsLive && env?.twilio ? "connected" : "practice";
  const emailState: State = emailLive && env?.email ? "connected" : "practice";
  const aiClaude = settings?.ai_provider === "anthropic" && env?.anthropic;

  async function saveEmail(patch: {
    email_mode?: string;
    email_from_name?: string | null;
    email_reply_to?: string | null;
    email_from_address?: string | null;
  }) {
    const { error } = await supabase
      .from("messaging_settings")
      .upsert(
        { org_id: org.orgId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "org_id" },
      );
    if (error) return toast.error(error.message);
    toast.success("Email settings saved");
    qc.invalidateQueries({ queryKey: settingsKey });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Integrations</h1>
        <p className="text-muted-foreground">
          Everything hireme connects to, and what each one needs. Until a service is connected, its
          features run in practice mode: you can use them end to end, and nothing is sent.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card
          icon={MessageSquare}
          title="Texting (Twilio)"
          state={smsState}
          what="Two-way texts with candidates and hiring managers: welcome, screening, manager summaries, nudges, reminders and 30/60/90 check-ins."
          needs="the aKillion Twilio account, carrier registration (10DLC), and a texting number per store. Texting settings are on the Team page."
        >
          {smsLive && !env?.twilio && (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              This group is set to Live but Twilio isn't connected, so texts will fail. Switch back
              to Practice on the Team page.
            </p>
          )}
        </Card>

        <Card
          icon={Mail}
          title="Email"
          state={emailState}
          what="One-to-one emails and bulk emails to applicants, from the Applicants page, with corporate templates. Every email includes the store's name and address and an unsubscribe link."
          needs="your sender domain set up (More → Emails), then the address you want emails to come from, like penny@notify.workwithwerk.com."
        >
          {isAdmin && (
            <div className="mt-4 space-y-2 border-t pt-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>Sending mode</span>
                <div className="flex gap-1">
                  {(["practice", "live"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={m === "live" && !(env?.email && env?.emailFrom)}
                      title={
                        m === "live" && !(env?.email && env?.emailFrom)
                          ? "Set a sending address first"
                          : undefined
                      }
                      onClick={() => saveEmail({ email_mode: m })}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs disabled:opacity-40",
                        (settings?.email_mode ?? "practice") === m
                          ? "bg-sapphire text-primary-foreground"
                          : "bg-secondary",
                      )}
                    >
                      {m === "practice" ? "Practice" : "Live"}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                placeholder="From name (default: the store's name)"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
              />
              <Input
                placeholder="Sending address (e.g. penny@notify.workwithwerk.com)"
                type="email"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
              />
              <Input
                placeholder="Replies go to (e.g. recruiting@yourgroup.com)"
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  saveEmail({
                    email_from_name: fromName.trim() || null,
                    email_reply_to: replyTo.trim() || null,
                    email_from_address: fromAddress.trim().toLowerCase() || null,
                  })
                }
              >
                Save email settings
              </Button>
              {!env?.emailFrom && (
                <p className="text-xs text-muted-foreground">
                  Emails stay in practice mode until you set the sending address above.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card
          icon={Bot}
          title="AI assistant"
          state="connected"
          what={`Screens candidates by text, updates profiles and books interviews. Running on ${aiClaude ? "Claude (Anthropic)" : "Lovable AI"}.`}
          needs="nothing today. To switch to Claude, add an ANTHROPIC_API_KEY secret and choose Anthropic in texting settings on the Team page."
        />

        <Card
          icon={CalendarDays}
          title="Calendar (Outlook / Google)"
          state="connected"
          what="Each person subscribes once (Interviews page) and every interview at their stores appears in their Outlook or Google calendar, with changes and cancellations."
          needs="nothing for the subscribe link. Two-way sync (booking into open times) later needs a Microsoft and/or Google sign-in app registered for hireme."
        />

        <Card
          icon={ShieldCheck}
          title="Background checks"
          state="partner"
          what="Order checks from the profile and see results there, from a compliance partner rather than built in-house."
          needs="choosing the partner and their API keys."
        />

        <OfferLettersCard
          orgId={org.orgId}
          isAdmin={isAdmin}
          apiKey={!!env?.boldsign}
          webhook={!!env?.boldsignWebhook}
          templateId={env?.offerTemplateId ?? null}
          onSaved={() => qc.invalidateQueries({ queryKey: ["integration-status", org.orgId] })}
        />
      </div>
    </div>
  );
}

function OfferLettersCard({
  orgId,
  isAdmin,
  apiKey,
  webhook,
  templateId,
  onSaved,
}: {
  orgId: string;
  isAdmin: boolean;
  apiKey: boolean;
  webhook: boolean;
  templateId: string | null;
  onSaved: () => void;
}) {
  const save = useServerFn(saveOfferTemplate);
  const [value, setValue] = useState(templateId ?? "");
  useEffect(() => setValue(templateId ?? ""), [templateId]);
  const hookUrl = `${typeof window === "undefined" ? "" : window.location.origin}/api/public/boldsign/webhook`;
  const state: State = apiKey && templateId ? "connected" : "not_connected";
  return (
    <Card
      icon={FileSignature}
      title="Offer letters (BoldSign)"
      state={state}
      what="Send your offer letter from the applicant's profile. They sign on their phone from a texted link, and the status (opened, signed, declined) shows on the profile."
      needs={
        apiKey
          ? webhook
            ? "pick your offer letter template below."
            : "add the BOLDSIGN_WEBHOOK_SECRET secret so signing updates come back to hireme (steps below)."
          : "add your BoldSign API key as the BOLDSIGN_API_KEY secret in Lovable (BoldSign: Settings > API > API Key)."
      }
    >
      <div className="mt-3 space-y-3 text-xs">
        <div className="space-y-1">
          <div className="font-medium">Offer letter template ID</div>
          <div className="flex gap-2">
            <Input
              value={value}
              disabled={!isAdmin}
              placeholder="Paste from BoldSign: Templates > your template > ID"
              onChange={(e) => setValue(e.target.value)}
            />
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                disabled={value.trim() === (templateId ?? "")}
                onClick={async () => {
                  try {
                    await save({ data: { orgId, templateId: value.trim() } });
                    toast.success("Offer template saved");
                    onSaved();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Save
              </Button>
            )}
          </div>
          <p className="text-muted-foreground">
            In the template, make role 1 the candidate (signer). Give text fields these IDs and hireme fills them in:{" "}
            {OFFER_FIELDS.map((f) => (
              <code key={f.id} className="mr-1 rounded bg-secondary px-1">
                {f.id}
              </code>
            ))}
          </p>
        </div>
        <div className="space-y-1">
          <div className="font-medium">Webhook (signing updates)</div>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-secondary px-2 py-1.5">{hookUrl}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(hookUrl).then(() => toast.success("Webhook URL copied"))}
            >
              Copy
            </Button>
          </div>
          <p className="text-muted-foreground">
            In BoldSign: API &gt; Webhooks &gt; Add webhook. Paste this URL, select the document events (Sent, Viewed,
            Completed, Declined, Revoked, Expired, Send/Delivery failed), save, then reveal the signing secret and add it
            in Lovable as BOLDSIGN_WEBHOOK_SECRET. {webhook ? "Secret is set." : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}
