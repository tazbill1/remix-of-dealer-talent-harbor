import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  CalendarDays,
  Mail,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { integrationStatus } from "@/lib/email.functions";
import { BoldSignSetup } from "@/components/boldsign-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { IntegrationCard as Card } from "@/components/integration-card";
import { textingStatusLine } from "@/lib/store-texting";
import { canEditIntegrationSettings } from "@/lib/integration-access";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [
    { title: "Integrations | WerkandMe Hiring" },
    { name: "description", content: "Manage email, texting and BoldSign document connections for your dealer group." },
    { property: "og:title", content: "Integrations | WerkandMe Hiring" },
    { property: "og:description", content: "Manage your dealer group's email, texting and signing connections." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Integrations,
});

function Integrations() {
  const org = useOrg();
  const qc = useQueryClient();
  const isAdmin = org.role === "group_admin" || org.isPlatformAdmin;
  const canEdit = canEditIntegrationSettings(org);
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
  const { data: texting } = useQuery({
    queryKey: ["store-texting-status", org.orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("store_texting_status", { _org: org.orgId });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  useEffect(() => {
    setFromName(settings?.email_from_name ?? "");
    setReplyTo(settings?.email_reply_to ?? "");
    setFromAddress(settings?.email_from_address ?? "");
  }, [settings?.email_from_name, settings?.email_reply_to, settings?.email_from_address]);

  async function saveEmail(patch: {
    email_mode?: string;
    email_from_name?: string | null;
    email_reply_to?: string | null;
    email_from_address?: string | null;
  }) {
    if (!canEdit) return;
    const { error } = await supabase
      .from("messaging_settings")
      .upsert(
        { org_id: org.orgId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "org_id" },
      );
    if (error) return toast.error(error.message);
    toast.success("Email settings saved");
    qc.invalidateQueries({ queryKey: settingsKey });
    qc.invalidateQueries({ queryKey: ["messaging-mode", org.orgId] });
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
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Interview recording hidden for now */}
        <Card
          icon={MessageSquare}
          title="Texting (Twilio)"
          state={texting?.some((t) => t.live && t.sms_number) ? "connected" : "demo"}
          what="Two-way texts with candidates and hiring managers: welcome, screening, manager summaries, nudges, reminders and 30/60/90 check-ins."
          note="WerkandMe sets up and manages each store's texting number."
        >
          <ul className="mt-4 max-h-60 space-y-1 overflow-y-auto border-t pt-4 text-sm" aria-label="Store texting">
            {texting === undefined && <li className="text-muted-foreground">Loading stores…</li>}
            {texting?.length === 0 && <li className="text-muted-foreground">No stores yet.</li>}
            {texting?.map((t) => (
              <li key={t.store_id}>
                <span className="font-medium">{t.store_name}</span>
                <span className="block text-muted-foreground">{textingStatusLine(t)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          icon={Mail}
          title="Email"
          state="connected"
          what="One-to-one emails and bulk emails to applicants, from the Applicants page, with corporate templates."
        >
          <fieldset disabled={!canEdit} className="mt-4 min-w-0 space-y-2 border-t pt-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>Sending mode</span>
                <div className="flex gap-1">
                  {(["practice", "live"] as const).map((m) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      key={m}
                      type="button"
                      disabled={!canEdit || (m === "live" && !(env?.email && env?.emailFrom))}
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
                    </Button>
                  ))}
                </div>
              </div>
              <Input
                aria-label="From name"
                placeholder="From name (default: the store's name)"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
              />
              <Input
                aria-label="Sending address"
                placeholder="Sending address (e.g. penny@notify.workwithwerk.com)"
                type="email"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
              />
              <Input
                aria-label="Replies go to"
                placeholder="Replies go to (e.g. recruiting@yourgroup.com)"
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
              />
              {canEdit && <Button
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
              </Button>}
              {!env?.emailFrom && (
                <p className="text-xs text-muted-foreground">
                  Emails stay in practice mode until you set the sending address above.
                </p>
              )}
          </fieldset>
        </Card>

        <Card
          icon={Bot}
          title="AI assistant (Penny)"
          state="connected"
          what="Screens candidates by text, updates profiles and books interviews."
        />

        <Card
          icon={CalendarDays}
          title="Calendar (Outlook / Google)"
          state="connected"
          what="Each person subscribes once (Interviews page) and every interview at their stores appears in their Outlook or Google calendar, with changes and cancellations."
          note="Each person subscribes once on the Interviews page."
        />

        <Card
          icon={ShieldCheck}
          title="Background checks"
          state="coming_soon"
          what="Order checks from the profile and see results there, from a compliance partner rather than built in-house."
          note="Order checks and see results right on the candidate's profile."
        />

        <BoldSignSetup
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
