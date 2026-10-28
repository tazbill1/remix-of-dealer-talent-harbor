import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RescheduleButton, isUpcoming } from "@/components/applicant-tools";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { CalendarSubscribe } from "@/components/calendar-subscribe";
import { MyCalendarCard } from "@/components/my-calendar";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Interviews | WerkandMe Hiring" }, { name: "description", content: "Upcoming interviews across your stores." }, { property: "og:title", content: "Interviews | WerkandMe Hiring" }, { property: "og:description", content: "Upcoming interviews across your stores." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CalendarPage,
});

function CalendarPage() {
  const org = useOrg();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["interviews-all", org.orgId],
    queryFn: async () => {
      const [iv, apps, stores] = await Promise.all([
        supabase.from("interviews").select("*").eq("org_id", org.orgId).gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at"),
        supabase.from("applications").select("id, full_name, dealership_id").eq("org_id", org.orgId),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId),
      ]);
      return { iv: iv.data ?? [], apps: apps.data ?? [], stores: stores.data ?? [] };
    },
  });
  const app = (id: string) => data?.apps.find((a) => a.id === id);
  const store = (id?: string) => data?.stores.find((s) => s.id === id)?.name ?? "";
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl">Interviews</h1><p className="text-muted-foreground">Every interview across your stores, whether booked by the assistant or added by a manager.</p></div>
      <CalendarSubscribe orgId={org.orgId} />
      <MyCalendarCard orgId={org.orgId} />
      <ul className="space-y-2">
        {data?.iv.length === 0 && <li className="rounded-2xl bg-secondary p-6 text-center text-muted-foreground">No upcoming interviews yet.</li>}
        {data?.iv.map((i) => (
          <li key={i.id} className="flex items-center gap-2">
            <Button asChild variant="ghost" className="h-auto w-full cursor-pointer justify-start gap-3 whitespace-normal rounded-2xl border p-4 text-left hover:bg-secondary">
              <Link to="/applicants" search={{ applicant: i.application_id, tab: "interview", interview: i.id }}>
            <CalendarDays className="size-5 text-sapphire" />
            <div className="flex-1"><div className="font-semibold">{app(i.application_id)?.full_name ?? "Applicant"}</div>
              <div className="text-sm text-muted-foreground">{store(app(i.application_id)?.dealership_id)} · {i.duration_min} min</div></div>
            <div className="text-right text-sm font-medium">{new Date(i.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
              </Link>
            </Button>
            {i.status !== "cancelled" && isUpcoming(i.starts_at) && (
              <RescheduleButton interviewId={i.id} startsAt={i.starts_at} onDone={() => qc.invalidateQueries({ queryKey: ["interviews-all", org.orgId] })} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
