import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { DIVISIONS, STATUS_LABEL } from "@/lib/jobs";
import { STATUS_EVENT_KIND } from "@/lib/status-log";
import {
  computeAnalytics,
  toCsv,
  type AApp,
  type AEvent,
  type AJob,
  type AMessage,
  type GroupBy,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics | WerkandMe Hiring" }] }),
  component: AnalyticsPage,
});

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "all", label: "All time" },
] as const;

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "location", label: "Location" },
  { value: "role", label: "Role" },
  { value: "manager", label: "Hiring manager" },
  { value: "source", label: "Source" },
];

/** Supabase returns at most 1,000 rows per request, so large groups are read in pages. */
async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

const hrs = (v: number | null) =>
  v === null
    ? "—"
    : v < 1
      ? `${Math.round(v * 60)} min`
      : v < 48
        ? `${v.toFixed(1)} hrs`
        : `${(v / 24).toFixed(1)} days`;
const days = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)} days`);

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function AnalyticsPage() {
  const org = useOrg();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["value"]>("30");
  const [storeId, setStoreId] = useState("all");
  const [division, setDivision] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("location");

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", org.orgId],
    queryFn: async () => {
      const [apps, jobs, stores, events, messages] = await Promise.all([
        fetchAll<AApp>((f, t) =>
          supabase
            .from("applications")
            .select("id, job_id, dealership_id, status, source, created_at, updated_at")
            .eq("org_id", org.orgId)
            .order("created_at")
            .range(f, t),
        ),
        fetchAll<AJob>((f, t) =>
          supabase
            .from("jobs")
            .select(
              "id, title, dealership_id, status, division, department, hiring_manager, created_at",
            )
            .eq("org_id", org.orgId)
            .order("created_at")
            .range(f, t),
        ),
        fetchAll<{ id: string; name: string }>((f, t) =>
          supabase
            .from("dealerships")
            .select("id, name")
            .eq("org_id", org.orgId)
            .order("name")
            .range(f, t),
        ),
        fetchAll<AEvent>((f, t) =>
          supabase
            .from("application_events")
            .select("application_id, kind, message, created_at")
            .eq("org_id", org.orgId)
            .eq("kind", STATUS_EVENT_KIND)
            .order("created_at")
            .range(f, t),
        ),
        fetchAll<AMessage>((f, t) =>
          supabase
            .from("messages")
            .select("application_id, party, direction, created_at")
            .eq("org_id", org.orgId)
            .eq("party", "manager")
            .order("created_at")
            .range(f, t),
        ),
      ]);
      return { apps, jobs, stores, events, messages };
    },
  });

  const a = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    const from = period === "all" ? null : now - Number(period) * 24 * 3600e3;
    return computeAnalytics({
      ...data,
      range: { from, to: now },
      filters: { storeId, division },
      now,
    });
  }, [data, period, storeId, division]);

  const rows = a?.breakdown(groupBy) ?? [];
  const groupLabel = GROUPS.find((g) => g.value === groupBy)!.label;
  const periodLabel = PERIODS.find((p) => p.value === period)!.label;

  function exportBreakdown() {
    const csv = toCsv(
      [
        groupLabel,
        "Applicants",
        "Contacted",
        "Hired",
        "Avg time to first contact (hrs)",
        "Avg manager response (hrs)",
        "Open roles",
      ],
      rows.map((r) => [
        r.label,
        r.applicants,
        r.contacted,
        r.hired,
        r.avgFirstContactHrs?.toFixed(1) ?? "",
        r.avgManagerResponseHrs?.toFixed(1) ?? "",
        r.openRoles ?? "",
      ]),
    );
    download(`hiring-by-${groupBy}-${period}.csv`, csv);
  }
  function exportApplicants() {
    if (!data) return;
    const jobs = new Map(data.jobs.map((j) => [j.id, j]));
    const stores = new Map(data.stores.map((s) => [s.id, s.name]));
    const csv = toCsv(
      ["Applied", "Store", "Role", "Division", "Hiring manager", "Source", "Stage"],
      data.apps
        .filter(
          (x) =>
            (storeId === "all" || x.dealership_id === storeId) &&
            (division === "all" || (jobs.get(x.job_id)?.division ?? "general") === division),
        )
        .map((x) => {
          const j = jobs.get(x.job_id);
          return [
            x.created_at.slice(0, 10),
            stores.get(x.dealership_id) ?? "",
            j?.title ?? "",
            DIVISIONS.find((d) => d.value === j?.division)?.label ?? "General & Admin",
            j?.hiring_manager ?? "",
            x.source,
            STATUS_LABEL[x.status],
          ];
        }),
    );
    download(`applicants-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading analytics...</div>;
  if (error || !a || !data)
    return (
      <div className="p-6 text-destructive">
        Couldn't load analytics. {(error as Error)?.message}
      </div>
    );

  const t = a.totals;
  const tiles = [
    { label: "Applicants", value: String(t.applicants), sub: periodLabel },
    { label: "Contacted", value: String(t.contacted), sub: "Moved past New" },
    {
      label: "Time to first contact",
      value: hrs(t.medianFirstContactHrs),
      sub: t.firstContactMeasured ? `Median of ${t.firstContactMeasured}` : "No stage changes yet",
    },
    {
      label: "Manager response",
      value: hrs(t.avgManagerResponseHrs),
      sub: t.managerResponsesMeasured
        ? `Avg of ${t.managerResponsesMeasured} replies`
        : "No manager texts yet",
    },
    {
      label: "Time to fill",
      value: days(t.avgTimeToFillDays),
      sub: t.filledJobs
        ? `${t.filledJobs} job${t.filledJobs > 1 ? "s" : ""} filled`
        : "No fills yet",
    },
    { label: "Hired", value: String(t.hired), sub: periodLabel },
    {
      label: "Open roles",
      value: String(t.openRoles),
      sub: `${a.openByDivision.fixed_ops} fixed ops · ${a.openByDivision.variable} variable`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Analytics</h1>
          <p className="text-muted-foreground">
            Hiring speed and pipeline health across{" "}
            {storeId === "all" ? "every store" : "this store"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Time period"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Store"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="all">All stores</option>
            {data.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Division"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          >
            <option value="all">All divisions</option>
            {DIVISIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={exportApplicants}>
            <Download />
            Export applicants
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {tiles.map((s) => (
          <div key={s.label} className="rounded-2xl bg-background p-4 shadow-sm">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className="mt-2 text-2xl font-extrabold">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-background p-5 shadow-sm">
          <h2 className="mb-1 text-lg">Candidate aging by stage</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Everyone still in the pipeline, and how long they've sat in their current stage.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Stage</th>
                <th className="py-2 text-right font-medium">Candidates</th>
                <th className="py-2 text-right font-medium">Avg days</th>
                <th className="py-2 text-right font-medium">Over 3 days</th>
                <th className="py-2 text-right font-medium">Over 7 days</th>
              </tr>
            </thead>
            <tbody>
              {a.aging.map((r) => (
                <tr key={r.stage} className="border-b last:border-0">
                  <td className="py-2">{STATUS_LABEL[r.stage]}</td>
                  <td className="py-2 text-right tabular-nums">{r.count}</td>
                  <td className="py-2 text-right tabular-nums">
                    {r.avgDays === null ? "—" : r.avgDays.toFixed(1)}
                  </td>
                  <td
                    className={cn("py-2 text-right tabular-nums", r.over3 > 0 && "font-semibold")}
                  >
                    {r.over3}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-right tabular-nums",
                      r.over7 > 0 && "font-semibold text-destructive",
                    )}
                  >
                    {r.over7}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl bg-background p-5 shadow-sm">
          <h2 className="mb-1 text-lg">Open roles</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Live postings by division and by store.
          </p>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            {[
              ["Fixed Ops", a.openByDivision.fixed_ops],
              ["Variable Ops", a.openByDivision.variable],
              ["General & Admin", a.openByDivision.general],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-secondary p-3">
                <div className="text-2xl font-extrabold">{v}</div>
                <div className="text-xs text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
          <div className="max-h-56 divide-y overflow-y-auto text-sm">
            {a.openByStore.map((s) => (
              <div key={s.label} className="flex justify-between py-2">
                <span>{s.label}</span>
                <span className="tabular-nums font-semibold">{s.count}</span>
              </div>
            ))}
            {a.openByStore.length === 0 && (
              <p className="py-2 text-muted-foreground">No stores yet.</p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl bg-background p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg">Breakdown by {groupLabel.toLowerCase()}</h2>
            <p className="text-sm text-muted-foreground">
              {periodLabel}. Applicants, contacted and hired count activity in the period.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div
              className="flex overflow-hidden rounded-md border text-sm"
              role="group"
              aria-label="Group by"
            >
              {GROUPS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGroupBy(g.value)}
                  aria-pressed={groupBy === g.value}
                  className={cn(
                    "px-3 py-1.5",
                    groupBy === g.value
                      ? "bg-sapphire text-primary-foreground"
                      : "hover:bg-secondary",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={exportBreakdown}>
              <Download />
              Export CSV
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">{groupLabel}</th>
                <th className="py-2 text-right font-medium">Applicants</th>
                <th className="py-2 text-right font-medium">Contacted</th>
                <th className="py-2 text-right font-medium">Hired</th>
                <th className="py-2 text-right font-medium">First contact</th>
                <th className="py-2 text-right font-medium">Manager response</th>
                {groupBy !== "source" && (
                  <th className="py-2 text-right font-medium">Open roles</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b last:border-0">
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 text-right tabular-nums">{r.applicants}</td>
                  <td className="py-2 text-right tabular-nums">{r.contacted}</td>
                  <td className="py-2 text-right tabular-nums">{r.hired}</td>
                  <td className="py-2 text-right tabular-nums">{hrs(r.avgFirstContactHrs)}</td>
                  <td className="py-2 text-right tabular-nums">{hrs(r.avgManagerResponseHrs)}</td>
                  {groupBy !== "source" && (
                    <td className="py-2 text-right tabular-nums">{r.openRoles ?? "—"}</td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted-foreground">
                    No activity in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            ["Time to fill by role", a.timeToFillByRole],
            ["Time to fill by rooftop", a.timeToFillByStore],
          ] as const
        ).map(([title, list]) => (
          <section key={title} className="rounded-2xl bg-background p-5 shadow-sm">
            <h2 className="mb-1 text-lg">{title}</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              From the job req being created to its first hire.
            </p>
            <div className="max-h-64 divide-y overflow-y-auto text-sm">
              {list.map((r) => (
                <div key={r.label} className="flex justify-between py-2">
                  <span>{r.label}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{days(r.avgDays)}</span>{" "}
                    <span className="text-muted-foreground">· {r.filled} filled</span>
                  </span>
                </div>
              ))}
              {list.length === 0 && (
                <p className="py-2 text-muted-foreground">No jobs filled in this period.</p>
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="flex gap-3 rounded-2xl border border-dashed bg-background p-5">
        <Info className="mt-0.5 size-5 shrink-0 text-sapphire" />
        <div className="text-sm">
          <p className="font-semibold">
            30/60/90-day retention is coming with the next data update.
          </p>
          <p className="text-muted-foreground">
            It needs a start date and departure date for each hire, captured from 30/60/90-day
            check-ins or a termination import. First contact and stage aging are measured from stage
            changes, which are now logged automatically. Older applicants show their apply date
            until they move.
          </p>
        </div>
      </section>
    </div>
  );
}
