import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RescheduleButton, isUpcoming } from "@/components/applicant-tools";
import { calendarLinks } from "@/lib/calendar-links";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CalendarDays, CalendarPlus, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { CalendarSubscribe } from "@/components/calendar-subscribe";
import { MyCalendarCard } from "@/components/my-calendar";

import { Button } from "@/components/ui/button";
import { QuickFeedbackButton, QuickFeedbackSummary } from "@/components/quick-interview-feedback";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Interviews | WerkandMe Hiring" }, { name: "description", content: "Upcoming interviews across your stores." }, { property: "og:title", content: "Interviews | WerkandMe Hiring" }, { property: "og:description", content: "Upcoming interviews across your stores." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CalendarPage,
});

function CalendarPage() {
  const org = useOrg();
  const qc = useQueryClient();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { data } = useQuery({
    queryKey: ["interviews-all", org.orgId],
    queryFn: async () => {
      const [iv, apps, stores, jobs, members, scopes] = await Promise.all([
        supabase.from("interviews").select("*").eq("org_id", org.orgId).gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at"),
        supabase.from("applications").select("id, full_name, dealership_id,job_id").eq("org_id", org.orgId),
        supabase.from("dealerships").select("id, name,region_id").eq("org_id", org.orgId),
        supabase.from("jobs").select("id,title,hiring_manager").eq("org_id", org.orgId),
        supabase.from("org_members").select("id,email,role").eq("org_id", org.orgId).in("role", ["dealer_manager", "hiring_manager"]),
        supabase.from("org_member_scopes").select("member_id,dealership_id,region_id").eq("org_id", org.orgId),
      ]);
      return { iv: iv.data ?? [], apps: apps.data ?? [], stores: stores.data ?? [], jobs: jobs.data ?? [], members: members.data ?? [], scopes: scopes.data ?? [] };
    },
  });
  const app = (id: string) => data?.apps.find((a) => a.id === id);
  const store = (id?: string) => data?.stores.find((s) => s.id === id)?.name ?? "";
  const interviewer = (storeId?: string) => {
    const region = data?.stores.find((s) => s.id === storeId)?.region_id;
    const memberIds = new Set(data?.scopes.filter((s) => s.dealership_id === storeId || (region && s.region_id === region)).map((s) => s.member_id));
    const people = data?.members.filter((m) => memberIds.has(m.id)) ?? [];
    return people.length === 1 ? people[0]?.email ?? "Not assigned" : people.length > 1 ? "Multiple interviewers" : "Not assigned";
  };
  const today = new Date().toDateString();
  const visible = (data?.iv ?? []).filter((i) => (storeFilter === "all" || app(i.application_id)?.dealership_id === storeFilter) && (statusFilter === "all" || i.status === statusFilter));
  const groups = ["Today", "Upcoming", "Past"].map((label) => ({ label, interviews: visible.filter((i) => {
    const date = new Date(i.starts_at);
    const group = date.toDateString() === today ? "Today" : date.getTime() > Date.now() ? "Upcoming" : "Past";
    return group === label;
  }) }));
  return (
    <div className="min-w-0 space-y-5">
      <div><h1 className="text-3xl">Interviews</h1><p className="text-muted-foreground">Every interview across your stores, whether booked by the assistant or added by a manager.</p></div>
      <div className="space-y-3">
        <Button variant="outline" className="h-11 sm:h-9" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}><SlidersHorizontal />Filters{(storeFilter !== "all" || statusFilter !== "all") && ` (${Number(storeFilter !== "all") + Number(statusFilter !== "all")})`}</Button>
        {filtersOpen && <div className="grid min-w-0 gap-2 sm:grid-cols-2 sm:max-w-lg">
          <select aria-label="Store" className="h-11 min-w-0 rounded-md border bg-background px-3 text-sm sm:h-9" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}><option value="all">All stores</option>{data?.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select aria-label="Status" className="h-11 min-w-0 rounded-md border bg-background px-3 text-sm sm:h-9" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{[...new Set(data?.iv.map((i) => i.status))].map((status) => <option key={status} value={status}>{status}</option>)}</select>
        </div>}
      </div>
      <div className="space-y-5">
        {data && visible.length === 0 && <p className="rounded-md bg-secondary p-6 text-center text-muted-foreground">No upcoming interviews yet.</p>}
        {groups.filter((group) => group.interviews.length).map((group) => <section key={group.label} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{group.label}</h2>
          <ul className="space-y-2">
        {group.interviews.map((i) => {
          const candidate = app(i.application_id);
          const job = data?.jobs.find((j) => j.id === candidate?.job_id);
          return (
          <li key={i.id} className="grid min-w-0 gap-3 rounded-md border bg-background p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4">
            <Button asChild variant="ghost" className="h-auto min-w-0 w-full cursor-pointer justify-start whitespace-normal p-0 text-left hover:bg-secondary">
              <Link to="/applicants" search={{ applicant: i.application_id, tab: "interview", interview: i.id }}>
                <div className="grid min-w-0 w-full gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-4">
                  <div className="min-w-0"><div className="break-words font-semibold">{candidate?.full_name ?? "Applicant"}</div>
                    <div className="mt-0.5 break-words text-sm font-normal text-muted-foreground">{job?.title}</div>
                    <div className="break-words text-xs font-normal text-muted-foreground">{store(candidate?.dealership_id)}</div>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-start gap-2 text-sm font-medium"><CalendarDays className="mt-0.5 size-4 shrink-0 text-sapphire" /><span className="min-w-0">{new Date(i.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {i.duration_min} min</span></div>
                    <div className="break-words text-xs font-normal text-muted-foreground">Interviewer: {interviewer(candidate?.dealership_id)}</div>
                    <Badge variant="secondary" className="font-normal">{i.status}</Badge>
                  </div>
                </div>
              </Link>
            </Button>
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-t pt-2 [&_button]:min-h-11 lg:border-t-0 lg:pt-0 lg:[&_button]:min-h-9 lg:max-w-80">
            <QuickFeedbackButton orgId={org.orgId} appId={i.application_id} interviewId={i.id} />
            {i.status !== "cancelled" && isUpcoming(i.starts_at) && (
              <RescheduleButton interviewId={i.id} startsAt={i.starts_at} onDone={() => qc.invalidateQueries({ queryKey: ["interviews-all", org.orgId] })} />
            )}
            {i.status !== "cancelled" && (() => {
              const name = app(i.application_id)?.full_name ?? "Applicant";
              const storeName = store(app(i.application_id)?.dealership_id);
              const links = calendarLinks({ title: `Interview: ${name}${storeName ? ` (${storeName})` : ""}`, startsAt: i.starts_at, minutes: i.duration_min, location: i.location ?? storeName });
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="shrink-0" aria-label="Add to calendar"><CalendarPlus />Add to calendar</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild><a href={links.google} target="_blank" rel="noreferrer">Google Calendar</a></DropdownMenuItem>
                    <DropdownMenuItem asChild><a href={links.outlook} target="_blank" rel="noreferrer">Outlook</a></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })()}
            </div>
            <div className="lg:col-span-2"><QuickFeedbackSummary appId={i.application_id} interviewId={i.id} /></div>
          </li>
        ); })}
          </ul>
        </section>)}
      </div>
      <MyCalendarCard orgId={org.orgId} />
      <CalendarSubscribe orgId={org.orgId} />
    </div>
  );
}
