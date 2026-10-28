import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { useOrg } from "@/lib/org";
import { previewHumanAlert } from "@/lib/notifications.functions";
import { humanAlertEmailOn } from "@/lib/notifications";
import type { Automations } from "@/lib/automations";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/** On/off for the "wants a person" email to managers (in-app alerts always happen). */
export function HumanAlertCard({ a, canEdit, onChange }: { a: Automations; canEdit: boolean; onChange: (a: Automations) => void }) {
  const org = useOrg();
  const preview = useServerFn(previewHumanAlert);
  const [sending, setSending] = useState(false);
  async function onPreview() {
    setSending(true);
    try {
      const r = await preview({ data: { orgId: org.orgId } });
      if (r.status === "sent") toast.success(`Preview sent to ${r.to}`);
      else if (r.status === "simulated") toast.info(`Email is in practice mode, so the preview to ${r.to} was only simulated.`);
      else toast.error(r.error ?? "The preview couldn't be sent.");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSending(false);
  }
  const on = humanAlertEmailOn(a);
  return (
    <section className="space-y-3">
      <h2 className="text-lg">Manager alerts</h2>
      <div className="space-y-3 rounded-2xl bg-background p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-semibold"><Bell className="size-4 text-sapphire" />Email me when someone wants a person</div>
            <p className="text-sm text-muted-foreground">
              When a candidate replies HUMAN, the store's hiring managers and GM always get an alert in the app. Turn this on to also email them. No texts are sent.
            </p>
          </div>
          <Switch aria-label="Email alert when a candidate wants a person" checked={on} disabled={!canEdit}
            onCheckedChange={(v) => onChange({ ...a, humanAlert: { ...a.humanAlert, email: v } })} />
        </div>
        <Button size="sm" variant="outline" disabled={!canEdit || sending} onClick={onPreview}>{sending ? "Sending..." : "Send me a preview"}</Button>
      </div>
    </section>
  );
}
