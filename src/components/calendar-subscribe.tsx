import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarPlus, Copy } from "lucide-react";
import { myCalendarFeed } from "@/lib/calendar.functions";
import { subscribeLinks } from "@/lib/calendar-feed";
import { Button } from "@/components/ui/button";

/** One private link that puts your hireme interviews into Outlook or Google Calendar. */
export function CalendarSubscribe({ orgId }: { orgId: string }) {
  const feed = useServerFn(myCalendarFeed);
  const { data } = useQuery({
    queryKey: ["calendar-feed", orgId],
    queryFn: () => feed({ data: { orgId } }),
    staleTime: Infinity,
  });
  const url = data?.url;
  const links = url ? subscribeLinks(url) : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Calendar link copied");
    } catch {
      toast.message(url);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <div className="flex items-center gap-2 font-semibold">
        <CalendarPlus className="size-4 text-sapphire" />
        Put interviews in your Outlook or Google calendar
      </div>
      <p className="text-sm text-muted-foreground">
        Add this once and every interview at your stores shows up in your own calendar, including
        new ones, time changes and cancellations. The link is private to you, so don't share it.
      </p>
      {links ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <a href={links.outlook} target="_blank" rel="noreferrer">Add to Outlook (work)</a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={links.google} target="_blank" rel="noreferrer">Add to Google Calendar</a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={links.webcal}>Apple / Outlook desktop</a>
          </Button>
          <Button size="sm" variant="ghost" onClick={copy}>
            <Copy />
            Copy link
          </Button>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Loading your link…</div>
      )}
      <p className="text-xs text-muted-foreground">
        Outlook checks for changes every hour or so; Google can take up to a day. For an interview
        happening soon, use "add to calendar" on the applicant. Using Outlook.com (personal)?{" "}
        {links && (
          <a className="underline" href={links.outlookPersonal} target="_blank" rel="noreferrer">
            Use this link
          </a>
        )}
        .
      </p>
    </div>
  );
}
