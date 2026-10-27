import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarX2 } from "lucide-react";
import { storeInterviewerCalendars } from "@/lib/member-calendars.functions";
import { roleLabel } from "@/lib/invites";
import { CalendarStatus } from "@/components/calendar-link";

/** Who interviews at this store, and whether their busy times are being used. */
export function StoreInterviewersCard({ orgId, storeId }: { orgId: string; storeId: string }) {
  const get = useServerFn(storeInterviewerCalendars);
  const { data: people = [] } = useQuery({
    queryKey: ["store-interviewers", storeId],
    queryFn: () => get({ data: { orgId, storeId } }),
  });
  return (
    <div className="space-y-3 rounded-2xl bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarX2 className="size-5 text-sapphire" />
        <h2 className="text-lg">Interviewers' calendars</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Candidates aren't offered times when any hiring manager or GM covering this store is busy on their linked
        calendar. People link their own calendar under Interviews, or a group admin can add it on the{" "}
        <Link to="/team" className="underline">
          Team
        </Link>{" "}
        page.
      </p>
      {people.length === 0 ? (
        <p className="rounded-xl bg-secondary p-3 text-sm">No hiring managers or GMs are assigned to this store yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{p.email ?? "Team member"}</span>{" "}
                <span className="text-xs text-muted-foreground">· {roleLabel(p.role)}</span>
              </span>
              <span className="text-xs">
                <CalendarStatus s={p} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
