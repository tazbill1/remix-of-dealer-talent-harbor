import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarX2, Trash2 } from "lucide-react";
import { addStoreCalendar, listStoreCalendars, removeStoreCalendar } from "@/lib/store-calendars.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Managers' own calendars: the booking page skips times they're busy. */
export function StoreCalendarsCard({ orgId, storeId }: { orgId: string; storeId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listStoreCalendars);
  const add = useServerFn(addStoreCalendar);
  const remove = useServerFn(removeStoreCalendar);
  const key = ["store-calendars", storeId];
  const { data: cals = [] } = useQuery({ queryKey: key, queryFn: () => list({ data: { orgId, storeId } }) });
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<"outlook" | "google" | null>(null);

  return (
    <div className="space-y-3 rounded-2xl bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarX2 className="size-5 text-sapphire" />
        <h2 className="text-lg">Managers' calendars</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Paste a manager's calendar link and candidates won't be offered times they're already busy. Only "busy" is
        read; event details are never shown to candidates. No IT or admin setup needed.
      </p>

      {cals.length > 0 && (
        <ul className="space-y-2">
          {cals.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{c.label}</div>
                <div className={cn("text-xs", c.lastError ? "text-destructive" : "text-muted-foreground")}>
                  {c.lastError ?? `${c.host} · ${c.lastCheckedAt ? `checked ${new Date(c.lastCheckedAt).toLocaleString()}` : "linked"}`}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${c.label}`}
                onClick={async () => {
                  await remove({ data: { orgId, storeId, id: c.id } });
                  qc.invalidateQueries({ queryKey: key });
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-2 sm:grid-cols-[160px_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await add({ data: { orgId, storeId, label, url } });
            toast.success(`Calendar linked. ${r.busyThisWeek} busy time${r.busyThisWeek === 1 ? "" : "s"} found this week.`);
            setLabel("");
            setUrl("");
            qc.invalidateQueries({ queryKey: key });
          } catch (err) {
            toast.error((err as Error).message);
          }
          setBusy(false);
        }}
      >
        <Input required placeholder="Whose? e.g. Mike (Service)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input required placeholder="Paste the calendar link (https:// or webcal://)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Link"}
        </Button>
      </form>

      <div className="flex gap-3 text-xs">
        <button type="button" className="text-sapphire underline" onClick={() => setHelp(help === "outlook" ? null : "outlook")}>
          Where do I find it in Outlook?
        </button>
        <button type="button" className="text-sapphire underline" onClick={() => setHelp(help === "google" ? null : "google")}>
          In Google Calendar?
        </button>
      </div>
      {help === "outlook" && (
        <ol className="list-decimal space-y-1 rounded-xl bg-accent p-3 pl-8 text-xs">
          <li>Open Outlook on the web (outlook.office.com) and click the gear (Settings).</li>
          <li>Go to <b>Calendar → Shared calendars</b>.</li>
          <li>Under <b>Publish a calendar</b>, pick your calendar and <b>"Can view when I'm busy"</b>, then <b>Publish</b>.</li>
          <li>Copy the <b>ICS</b> link and paste it here.</li>
          <li className="text-muted-foreground">If there's no Publish option, your company has turned it off; ask whoever runs your email.</li>
        </ol>
      )}
      {help === "google" && (
        <ol className="list-decimal space-y-1 rounded-xl bg-accent p-3 pl-8 text-xs">
          <li>Open Google Calendar on a computer, click the gear, then <b>Settings</b>.</li>
          <li>On the left, under <b>Settings for my calendars</b>, click your calendar.</li>
          <li>Scroll to <b>Integrate calendar</b> and copy <b>Secret address in iCal format</b>.</li>
          <li>Paste it here. (Treat it like a password; anyone with it can see the calendar.)</li>
        </ol>
      )}
    </div>
  );
}
