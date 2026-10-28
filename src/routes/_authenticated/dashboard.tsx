import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase, Users, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { fetchAll } from "@/lib/fetch-all";
import {
  ESCALATION_BUSINESS_DAYS,
  escalationEventRow,
  findStalled,
  type EscApp,
  type Touch,
} from "@/lib/escalation";
import { GradientText } from "@/components/brand";
import { ManagerTodo } from "@/components/manager-todo";
import { Button } from "@/components/ui/button";
import { isTestName, plural } from "@/lib/display";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | WerkandMe Hiring" }] }),
  component: Dashboard,
});

function Dashboard() {
  const org = useOrg();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["dashboard", org.orgId],
    queryFn: async () => {
      const [stores, jobs, apps, events, messages] = await Promise.all([
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId),
        supabase.from("jobs").select("id, title, status, dealership_id").eq("org_id", org.orgId),
        fetchAll<EscApp & { dealership_id: string; job_id: string; full_name: string }>((f, t) =>
          supabase
            .from("applications")
            .select(
              "id, status, dealership_id, job_id, full_name, created_at, open_to_other_stores",
            )
            .eq("org_id", org.orgId)
            .order("created_at")
            .range(f, t),
        ),
        fetchAll<Touch>((f, t) =>
          supabase
            .from("application_events")
            .select("application_id, created_at, kind")
            .eq("org_id", org.orgId)
            .order("created_at")
            .range(f, t),
        ),
        fetchAll<Touch>((f, t) =>
          supabase
            .from("messages")
            .select("application_id, created_at")
            .eq("org_id", org.orgId)
            .order("created_at")
            .range(f, t),
        ),
      ]);
      return {
        stores: stores.data ?? [],
        jobs: jobs.data ?? [],
        apps,
        touches: [...events, ...messages],
      };
    },
  });
  const stores = data?.stores ?? [];
  const apps = (data?.apps ?? []).filter((a) => !isTestName(a.full_name));
  const openJobs = (data?.jobs ?? []).filter((j) => j.status === "open").length;
  const today = new Date().toDateString();
  const newToday = apps.filter((a) => new Date(a.created_at).toDateString() === today).length;
  // Candidates untouched for 3+ business days that the scheduled job will release to the open pool.
  const stalled = findStalled(apps, data?.touches ?? [], Date.now());
  const appById = new Map(apps.map((a) => [a.id, a]));
  const canRelease = canPostJobs(org.role, org.isPlatformAdmin);
  async function releaseAll() {
    for (const s of stalled) {
      const a = appById.get(s.id);
      if (!a) continue;
      const { error } = await supabase
        .from("applications")
        .update({ open_to_other_stores: true })
        .eq("id", s.id);
      if (error) return toast.error(error.message);
      await supabase
        .from("application_events")
        .insert(escalationEventRow(org.orgId, s.id, s.idleBusinessDays));
    }
    toast.success(`Released ${stalled.length} to the open pool.`);
    qc.invalidateQueries({ queryKey: ["dashboard", org.orgId] });
  }
  const ranking = stores
    .map((s) => ({
      ...s,
      total: apps.filter((a) => a.dealership_id === s.id).length,
      hired: apps.filter((a) => a.dealership_id === s.id && a.status === "hired").length,
    }))
    .sort((a, b) => b.total - a.total);

  const stats = [
    { label: "Open jobs", value: openJobs, icon: Briefcase, to: "/jobs" as const, search: { status: "open" } },
    { label: "New today", value: newToday, icon: Sparkles, to: "/applicants" as const, search: { applied: "today" } },
    { label: "Total applicants", value: apps.length, icon: Users, to: "/applicants" as const, search: {} },
    { label: "Hired", value: apps.filter((a) => a.status === "hired").length, icon: Trophy, to: "/applicants" as const, search: { status: "hired" } },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">
          Good to see you! <GradientText>Here's the group.</GradientText>
        </h1>
        <p className="text-muted-foreground">
          {org.orgName} · {plural(stores.length, "store")}
        </p>
      </div>
      {stores.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-background p-6">
          <p className="font-semibold">First step: add your stores.</p>
          <Button className="mt-3" asChild>
            <Link to="/stores">Add stores</Link>
          </Button>
        </div>
      )}
      {stores.length > 0 && <ManagerTodo orgId={org.orgId} />}
      {stalled.length > 0 && (
        <div className="rounded-2xl bg-accent p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              <b>
                {stalled.length} applicant{stalled.length > 1 ? "s have" : " has"}
              </b>{" "}
              gone {ESCALATION_BUSINESS_DAYS}+ business days without anyone touching them. They'll
              move to the open pool automatically.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to="/applicants">Review now</Link>
              </Button>
              {canRelease && (
                <Button size="sm" onClick={releaseAll}>
                  Release to open pool
                </Button>
              )}
            </div>
          </div>
          <ul className="mt-3 divide-y divide-background/60">
            {stalled.slice(0, 5).map((s) => {
              const a = appById.get(s.id);
              const job = data?.jobs.find((j) => j.id === a?.job_id);
              return (
                <li key={s.id} className="flex justify-between py-1.5">
                  <span>
                    {a?.full_name} · {job?.title ?? ""} ·{" "}
                    {stores.find((st) => st.id === a?.dealership_id)?.name ?? ""}
                  </span>
                  <span className="text-muted-foreground">{s.idleBusinessDays} business days</span>
                </li>
              );
            })}
            {stalled.length > 5 && (
              <li className="py-1.5 text-muted-foreground">and {stalled.length - 5} more</li>
            )}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} search={s.search} aria-label={`${s.label}: ${s.value}. View list`}
            className="block cursor-pointer rounded-2xl bg-background p-5 shadow-sm transition hover:shadow-md hover:ring-1 hover:ring-sapphire focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sapphire">
            <s.icon className="size-5 text-sapphire" />
            <div className="mt-3 text-3xl font-extrabold">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </Link>
        ))}
      </div>
      <div className="rounded-2xl bg-background p-5 shadow-sm">
        <h2 className="mb-4 text-lg">Stores by applicants</h2>
        <div className="divide-y">
          {ranking.map((s, i) => (
            <Link
              key={s.id}
              to="/stores/$storeId"
              params={{ storeId: s.id }}
              className="flex items-center justify-between py-3 text-sm hover:text-sapphire"
            >
              <span>
                <span className="mr-3 text-muted-foreground">{i + 1}</span>
                {s.name}
              </span>
              <span className="text-muted-foreground">
                {plural(s.total, "applicant")} ·{" "}
                <span className="font-semibold text-foreground">{s.hired} hired</span>
              </span>
            </Link>
          ))}
          {ranking.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">No stores yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
