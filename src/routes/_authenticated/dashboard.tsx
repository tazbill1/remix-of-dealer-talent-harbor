import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Users, Sparkles, Trophy, Timer } from "lucide-react";
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
import { computeAnalytics, filterScope, storeBrands } from "@/lib/analytics";
import { loadAnalyticsInputs } from "@/lib/analytics-data";
import { GradientText } from "@/components/brand";
import { ManagerTodo } from "@/components/manager-todo";
import { Button } from "@/components/ui/button";
import { isTestName, plural } from "@/lib/display";

const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "all", label: "All time" },
] as const;

const days = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)} days`);
const hrs = (v: number | null) =>
  v === null ? "—" : v < 48 ? `${v.toFixed(1)} hrs` : `${(v / 24).toFixed(1)} days`;
const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";

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
  // Same data as the Analytics page (shared cache), used for time-to-hire and the filters.
  const { data: ad } = useQuery({
    queryKey: ["analytics", org.orgId],
    queryFn: () => loadAnalyticsInputs(org.orgId),
  });
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["value"]>("90");
  const [brand, setBrand] = useState("all");
  const [regionId, setRegionId] = useState("all");
  const [role, setRole] = useState("all");
  const filtered = brand !== "all" || regionId !== "all" || role !== "all";
  const scope = filterScope(ad?.stores ?? [], ad?.jobs ?? [], {
    storeId: "all",
    division: "all",
    brand,
    regionId,
    role,
  });
  const brands = storeBrands(ad?.stores ?? []);
  const regions = ad?.regions ?? [];
  const roles = [...new Set((ad?.jobs ?? []).map((j) => j.title.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
  const speed = useMemo(() => {
    if (!ad) return null;
    const now = Date.now();
    const from = period === "all" ? null : now - Number(period) * 24 * 3600e3;
    return computeAnalytics({
      ...ad,
      range: { from, to: now },
      filters: { storeId: "all", division: "all", brand, regionId, role },
      now,
    }).totals;
  }, [ad, period, brand, regionId, role]);

  const allStores = data?.stores ?? [];
  const allApps = (data?.apps ?? []).filter((a) => !isTestName(a.full_name));
  // Filters narrow the tiles and the store list; the to-do and stalled alerts always show everything.
  const stores = filtered ? allStores.filter((s) => scope.storeMatches(s.id)) : allStores;
  const apps = filtered ? allApps.filter(scope.appMatches) : allApps;
  const openJobs = filtered
    ? (ad?.jobs ?? []).filter((j) => j.status === "open" && scope.jobMatches(j)).length
    : (data?.jobs ?? []).filter((j) => j.status === "open").length;
  const today = new Date().toDateString();
  const newToday = apps.filter((a) => new Date(a.created_at).toDateString() === today).length;
  // Candidates untouched for 3+ business days that the scheduled job will release to the open pool.
  const stalled = findStalled(allApps, data?.touches ?? [], Date.now());
  const appById = new Map(allApps.map((a) => [a.id, a]));
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
    {
      label: "Open jobs",
      value: openJobs,
      icon: Briefcase,
      to: "/jobs" as const,
      search: { status: "open" },
    },
    {
      label: "New today",
      value: newToday,
      icon: Sparkles,
      to: "/applicants" as const,
      search: { applied: "today" },
    },
    {
      label: "Total applicants",
      value: apps.length,
      icon: Users,
      to: "/applicants" as const,
      search: {},
    },
    {
      label: "Hired",
      value: apps.filter((a) => a.status === "hired").length,
      icon: Trophy,
      to: "/applicants" as const,
      search: { status: "hired" },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">
          Good to see you! <GradientText>Here's the group.</GradientText>
        </h1>
        <p className="text-muted-foreground">
          {org.orgName} · {plural(allStores.length, "store")}
        </p>
      </div>
      {allStores.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-background p-6">
          <p className="font-semibold">First step: add your stores.</p>
          <Button className="mt-3" asChild>
            <Link to="/stores">Add stores</Link>
          </Button>
        </div>
      )}
      {allStores.length > 0 && <ManagerTodo orgId={org.orgId} />}
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
                    {allStores.find((st) => st.id === a?.dealership_id)?.name ?? ""}
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
      {allStores.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {brands.length > 0 && (
            <select
              aria-label="Brand"
              className={selectClass}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
          {regions.length > 0 && (
            <select
              aria-label="Region"
              className={selectClass}
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
            >
              <option value="all">All regions</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
              <option value="none">No region</option>
            </select>
          )}
          {roles.length > 0 && (
            <select
              aria-label="Role"
              className={selectClass}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="all">All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          {filtered && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setBrand("all");
                setRegionId("all");
                setRole("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            search={s.search}
            aria-label={`${s.label}: ${s.value}. View list`}
            className="block cursor-pointer rounded-2xl bg-background p-5 shadow-sm transition hover:shadow-md hover:ring-1 hover:ring-sapphire focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sapphire"
          >
            <s.icon className="size-5 text-sapphire" />
            <div className="mt-3 text-3xl font-extrabold">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </Link>
        ))}
      </div>
      {allStores.length > 0 && (
        <section className="rounded-2xl bg-background p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg">
              <Timer className="size-5 text-sapphire" />
              Hiring speed
            </h2>
            <div className="flex items-center gap-2">
              <select
                aria-label="Time period"
                className={selectClass}
                value={period}
                onChange={(e) => setPeriod(e.target.value as typeof period)}
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" asChild>
                <Link to="/analytics">Full analytics</Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              {
                label: "Time to hire",
                value: days(speed?.medianTimeToHireDays ?? null),
                sub: speed?.hired
                  ? `Apply to hired, median of ${plural(speed.hired, "hire")}`
                  : "No hires in this period",
              },
              {
                label: "Time to fill",
                value: days(speed?.avgTimeToFillDays ?? null),
                sub: speed?.filledJobs
                  ? `Job posted to first hire, ${plural(speed.filledJobs, "job")}`
                  : "No jobs filled in this period",
              },
              {
                label: "Time to first contact",
                value: hrs(speed?.medianFirstContactHrs ?? null),
                sub: speed?.firstContactMeasured
                  ? `Median of ${plural(speed.firstContactMeasured, "applicant")}`
                  : "No stage changes yet",
              },
              {
                label: "Hired",
                value: speed ? String(speed.hired) : "—",
                sub: PERIODS.find((p) => p.value === period)!.label,
              },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl border p-4">
                <div className="text-sm text-muted-foreground">{tile.label}</div>
                <div className="mt-2 text-2xl font-extrabold">{tile.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{tile.sub}</div>
              </div>
            ))}
          </div>
        </section>
      )}
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
