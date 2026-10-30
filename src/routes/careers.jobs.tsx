import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ArrowRight, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatPay } from "@/lib/jobs";
import { SITE_URL } from "@/lib/site";

const title = "Open jobs at ABC Dealer Group | Apply today";
const description = "Every open job at ABC Dealer Group dealerships. Search by role, team or location and apply in a minute.";

export const Route = createFileRoute("/careers/jobs")({
  validateSearch: z.object({
    q: z.string().max(80).optional(),
    store: z.string().max(60).optional(),
    dept: z.string().max(60).optional(),
  }),
  head: () => ({
    meta: [
      { title }, { name: "description", content: description },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:type", content: "website" }, { property: "og:url", content: `${SITE_URL}/careers/jobs` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/careers/jobs` }],
  }),
  component: Jobs,
});

const layout = getRouteApi("/careers");
const deptOf = (d: string | null) => (d && d.trim()) || "Other";

function Jobs() {
  const { org, stores, jobs } = layout.useLoaderData();
  const { q = "", store = "all", dept = "all" } = Route.useSearch();
  const navigate = useNavigate({ from: "/careers/jobs" });
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  // Keep typing instant; sync the URL shortly after.
  useEffect(() => {
    const t = setTimeout(() => { if (text !== q) navigate({ search: (p) => ({ ...p, q: text || undefined }), replace: true }); }, 300);
    return () => clearTimeout(t);
  }, [text, q, navigate]);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const depts = useMemo(() => [...new Set(jobs.map((j) => deptOf(j.department)))].sort(), [jobs]);
  const needle = text.trim().toLowerCase();
  const list = jobs.filter((j) => {
    const st = storeById.get(j.dealership_id);
    if (store !== "all" && j.dealership_id !== store) return false;
    if (dept !== "all" && deptOf(j.department) !== dept) return false;
    if (!needle) return true;
    return `${j.title} ${j.department ?? ""} ${st?.name ?? ""} ${st?.city ?? ""} ${st?.state ?? ""} ${st?.brand ?? ""}`.toLowerCase().includes(needle);
  });
  const groups = depts.map((d) => ({ d, items: list.filter((j) => deptOf(j.department) === d) })).filter((g) => g.items.length);
  const set = (k: "store" | "dept", v: string) => navigate({ search: (p) => ({ ...p, [k]: v === "all" ? undefined : v }), replace: true });
  const filtered = store !== "all" || dept !== "all" || !!needle;

  return (
    <>
      <section className="bg-abc-black px-5 py-12 text-abc-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-abc-yellow">Open positions</p>
          <h1 className="mt-2 text-4xl font-black md:text-5xl">Find your next role</h1>
          <p className="mt-2 text-abc-white/70">{jobs.length} open roles across {stores.length} dealerships.</p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-5">
        <div className="-mt-7 grid gap-2 rounded-2xl bg-abc-white p-3 shadow-lg sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search jobs" className="h-11 pl-9" placeholder="Search job title, store or city" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <select aria-label="Team" className="h-11 rounded-md border bg-background px-3 text-sm" value={dept} onChange={(e) => set("dept", e.target.value)}>
            <option value="all">All teams</option>{depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select aria-label="Location" className="h-11 rounded-md border bg-background px-3 text-sm" value={store} onChange={(e) => set("store", e.target.value)}>
            <option value="all">All locations</option>
            {stores.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` · ${x.city}` : ""}</option>)}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={() => set("dept", "all")} className={`rounded-full px-3 py-1.5 text-sm font-medium ${dept === "all" ? "bg-abc-red text-abc-white" : "bg-abc-white text-abc-black hover:bg-abc-yellow"}`}>All</button>
          {depts.map((d) => (
            <button key={d} onClick={() => set("dept", d)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${dept === d ? "bg-abc-red text-abc-white" : "bg-abc-white text-abc-black hover:bg-abc-yellow"}`}>{d}</button>
          ))}
          {filtered && (
            <button onClick={() => { setText(""); navigate({ search: {}, replace: true }); }} className="ml-auto flex items-center gap-1 text-sm text-abc-red underline">
              <X className="size-3.5" />Clear filters
            </button>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Showing {list.length} of {jobs.length} jobs</p>

        <div className="space-y-10 py-6 pb-16">
          {groups.map((g) => (
            <section key={g.d}>
              <h2 className="border-b-2 border-abc-red pb-2 text-xl font-bold">{g.d} <span className="text-sm font-normal text-muted-foreground">({g.items.length})</span></h2>
              <div className="divide-y rounded-b-2xl bg-abc-white shadow-sm">
                {g.items.map((j) => {
                  const st = storeById.get(j.dealership_id);
                  const pay = formatPay(j.pay_min, j.pay_max, j.pay_period);
                  return (
                    <Link key={j.id} to="/c/$orgSlug/jobs/$jobId" params={{ orgSlug: org.slug, jobId: j.id }} search={{ source: "own_site" }}
                      className="group flex flex-col gap-2 p-4 transition hover:bg-abc-gray sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold group-hover:text-abc-red">{j.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          {st && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{st.name}{st.city ? ` · ${st.city}${st.state ? `, ${st.state}` : ""}` : ""}</span>}
                          <span className="capitalize">{j.employment_type.replace(/_/g, " ")}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {pay && <span className="rounded-full bg-abc-yellow/30 px-3 py-1 text-sm font-semibold">{pay}</span>}
                        <span className="flex items-center gap-1 text-sm font-semibold text-abc-red">Apply<ArrowRight className="size-4" /></span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
          {!list.length && (
            <p className="rounded-2xl bg-abc-white p-6 text-center text-muted-foreground">
              No matching jobs right now. <Link to="/careers/contact" className="text-abc-red underline">Tell us what you're looking for</Link>.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
