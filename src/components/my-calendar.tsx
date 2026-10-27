import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarX2 } from "lucide-react";
import { myCalendar } from "@/lib/member-calendars.functions";
import { CalendarLinkForm } from "@/components/calendar-link";

/** Share your busy times so candidates aren't offered them. */
export function MyCalendarCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(myCalendar);
  const key = ["my-calendar", orgId];
  const { data } = useQuery({ queryKey: key, queryFn: () => get({ data: { orgId } }) });
  if (!data?.member) return null;
  return (
    <div className="space-y-2 rounded-2xl border p-4">
      <div className="flex items-center gap-2 font-semibold">
        <CalendarX2 className="size-4 text-sapphire" />
        My calendar: share when you're busy
      </div>
      <p className="text-sm text-muted-foreground">
        {data.interviewer
          ? "Link your Outlook or Google calendar and candidates won't be offered interview times when you're busy. Only busy times are read, never event details."
          : "Hiring managers and GMs link their calendars so candidates aren't offered times they're busy. You can link yours too."}
      </p>
      <CalendarLinkForm
        orgId={orgId}
        status={data.linked ? data : { linked: false }}
        onChanged={() => qc.invalidateQueries({ queryKey: key })}
      />
    </div>
  );
}
