import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { removeMemberCalendar, setMemberCalendar } from "@/lib/member-calendars.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CalStatus =
  | { linked: false }
  | { linked: true; host: string; lastCheckedAt: string | null; lastError: string | null };

/** Status line for a linked calendar (never the link itself). */
export function CalendarStatus({ s }: { s: CalStatus }) {
  if (!s.linked) return <span className="text-muted-foreground">No calendar linked</span>;
  return (
    <span className={s.lastError ? "text-destructive" : "text-muted-foreground"}>
      {s.lastError ?? `Busy times from ${s.host}${s.lastCheckedAt ? `, checked ${new Date(s.lastCheckedAt).toLocaleString()}` : ""}`}
    </span>
  );
}

/** Where to find the private link in Outlook and Google. */
export function CalendarLinkHelp() {
  const [help, setHelp] = useState<"outlook" | "google" | null>(null);
  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-3">
        <button type="button" className="text-sapphire underline" onClick={() => setHelp(help === "outlook" ? null : "outlook")}>
          Where's the link in Outlook?
        </button>
        <button type="button" className="text-sapphire underline" onClick={() => setHelp(help === "google" ? null : "google")}>
          In Google Calendar?
        </button>
      </div>
      {help === "outlook" && (
        <ol className="list-decimal space-y-1 rounded-xl bg-accent p-3 pl-8">
          <li>Open Outlook on the web (outlook.office.com) and click the gear (Settings).</li>
          <li>Go to <b>Calendar → Shared calendars</b>.</li>
          <li>Under <b>Publish a calendar</b>, pick your calendar and <b>"Can view when I'm busy"</b>, then <b>Publish</b>.</li>
          <li>Copy the <b>ICS</b> link and paste it here.</li>
          <li className="text-muted-foreground">No Publish option? Your company turned it off; ask whoever runs your email.</li>
        </ol>
      )}
      {help === "google" && (
        <div className="space-y-2 rounded-xl bg-accent p-3">
          <div className="font-medium">Option A: free/busy only (works on most company accounts)</div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open Google Calendar on a computer, click the gear, then <b>Settings</b>.</li>
            <li>Under <b>Settings for my calendars</b>, click your calendar.</li>
            <li>In <b>Access permissions for events</b>, tick <b>Make available to public</b> and choose <b>See only free/busy (hide details)</b>.</li>
            <li>Scroll to <b>Integrate calendar</b>, copy <b>Public address in iCal format</b>, and paste it here.</li>
          </ol>
          <p className="text-muted-foreground">People with the link only see "Busy" blocks, never what or where.</p>
          <div className="font-medium">Option B: secret address</div>
          <p>
            Same page, under <b>Integrate calendar</b>: copy <b>Secret address in iCal format</b>. If it's missing, your company
            has turned it off, so use Option A.
          </p>
        </div>
      )}
    </div>
  );
}

/** Paste / replace / remove a person's calendar link. memberId omitted = yourself. */
export function CalendarLinkForm({
  orgId,
  memberId,
  status,
  onChanged,
  compact,
}: {
  orgId: string;
  memberId?: string;
  status: CalStatus;
  onChanged: () => void;
  compact?: boolean;
}) {
  const set = useServerFn(setMemberCalendar);
  const remove = useServerFn(removeMemberCalendar);
  const [editing, setEditing] = useState(!status.linked && !compact);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs">
          <CalendarStatus s={status} />
        </span>
        {!editing && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
            {status.linked ? "Replace" : "Add calendar"}
          </Button>
        )}
        {status.linked && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={async () => {
              await remove({ data: { orgId, memberId: memberId ?? null } });
              toast.success("Calendar unlinked");
              onChanged();
            }}
          >
            Unlink
          </Button>
        )}
      </div>
      {editing && (
        <>
          <form
            className={cn("flex gap-2", compact && "max-w-xl")}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await set({ data: { orgId, memberId: memberId ?? null, url } });
                toast.success(`Calendar linked. ${r.busyThisWeek} busy time${r.busyThisWeek === 1 ? "" : "s"} found this week.`);
                setUrl("");
                setEditing(false);
                onChanged();
              } catch (err) {
                toast.error((err as Error).message);
              }
              setBusy(false);
            }}
          >
            <Input required placeholder="Paste the calendar link (https:// or webcal://)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Checking…" : "Link"}
            </Button>
            {(status.linked || compact) && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </form>
          <CalendarLinkHelp />
        </>
      )}
    </div>
  );
}
