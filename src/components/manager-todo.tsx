import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { chunk, fetchAll } from "@/lib/fetch-all";
import { isTestName, plural } from "@/lib/display";
import {
  managerTodo,
  SCORECARD_LOOKBACK_DAYS,
  TODO_GROUPS,
  todoTab,
  type TodoApp,
  type TodoCard,
  type TodoInterview,
  type TodoMsg,
  type TodoOffer,
} from "@/lib/manager-todo";

type App = TodoApp & { jobs: { title: string } | null; dealerships: { name: string } | null };

/** Every read runs as the signed-in user, so store access rules limit it to their stores. */
async function loadTodo(orgId: string) {
  const apps = (
    await fetchAll<App>((f, t) =>
      supabase
        .from("applications")
        .select("id, full_name, status, created_at, needs_attention, dealership_id, job_id, jobs(title), dealerships!applications_dealership_id_fkey(name)")
        .eq("org_id", orgId)
        .in("status", ["new", "screening", "interview", "offer", "other_location", "hiring_event"])
        .order("created_at")
        .range(f, t) as never,
    )
  ).filter((a) => !isTestName(a.full_name));
  const ids = (s: string) => apps.filter((a) => a.status === s).map((a) => a.id);
  const messages: TodoMsg[] = [];
  for (const part of chunk(ids("screening"))) {
    const { data } = await supabase
      .from("messages")
      .select("application_id, party, direction, purpose, created_at")
      .eq("party", "manager")
      .in("application_id", part);
    messages.push(...(data ?? []));
  }
  const since = new Date(Date.now() - (SCORECARD_LOOKBACK_DAYS + 1) * 864e5).toISOString();
  const { data: interviews } = await supabase
    .from("interviews")
    .select("id, application_id, starts_at, duration_min, status")
    .eq("org_id", orgId)
    .gte("starts_at", since)
    .lte("starts_at", new Date().toISOString());
  const cards: TodoCard[] = [];
  for (const part of chunk((interviews ?? []).map((i) => i.id))) {
    const { data } = await supabase.from("interview_scorecards").select("interview_id, submitted_at").in("interview_id", part);
    cards.push(...(data ?? []));
  }
  const offers: TodoOffer[] = [];
  for (const part of chunk([...ids("interview"), ...ids("offer")])) {
    const { data } = await supabase
      .from("offers")
      .select("application_id, status, is_offer_letter, created_at")
      .in("application_id", part);
    offers.push(...(data ?? []));
  }
  return { apps, messages, interviews: (interviews ?? []) as TodoInterview[], cards, offers };
}

export function ManagerTodo({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["manager-todo", orgId], queryFn: () => loadTodo(orgId) });
  if (isLoading || !data) return null;
  const items = managerTodo(data, Date.now());
  const app = new Map(data.apps.map((a) => [a.id, a]));

  return (
    <div className="rounded-2xl bg-background p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg">Your to-do</h2>
        {items.length > 0 && <span className="text-sm text-muted-foreground">{plural(items.length, "thing")} waiting on you</span>}
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-sapphire" /> All caught up. Nothing is waiting on you right now.
        </p>
      ) : (
        <div className="space-y-4">
          {TODO_GROUPS.map((g) => {
            const list = items.filter((i) => g.kinds.includes(i.kind));
            if (!list.length) return null;
            return (
              <div key={g.title}>
                <h3 className="mb-1 text-sm font-semibold">
                  {g.title} <span className="font-normal text-muted-foreground">({list.length})</span>
                </h3>
                <ul className="divide-y">
                  {list.map((i) => {
                    const a = app.get(i.applicationId);
                    return (
                      <li key={`${i.kind}-${i.interviewId ?? i.applicationId}`}>
                        <Link
                          to="/applicants"
                          search={{ applicant: i.applicationId, tab: todoTab(i.kind), interview: i.interviewId }}
                          className="flex items-center justify-between gap-3 py-2 text-sm hover:text-sapphire"
                        >
                          <span className="min-w-0">
                            <span className="font-medium">{a?.full_name}</span>
                            <span className="text-muted-foreground">
                              {" "}· {a?.jobs?.title ?? ""} · {a?.dealerships?.name ?? ""}
                            </span>
                            <span className="block text-xs text-muted-foreground">{i.detail}</span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
