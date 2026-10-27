import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatPay } from "@/lib/jobs";
import { SITE_URL } from "@/lib/site";

const title = "Open jobs at ABC Motors | Apply today";
const description = "Every open job at ABC Motors dealerships. Search by role or city and apply in a minute.";

export const Route = createFileRoute("/careers/jobs")({
  validateSearch: z.object({ q: z.string().max(80).optional(), store: z.string().max(60).optional() }),
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

function Jobs() {
  const { org, stores, jobs } = layout.useLoaderData();
  const { q = "", store = "all" } = Route.useSearch();
  const navigate = useNavigate({ from: "/careers/jobs" });
  const s = (id: string) => stores.find((x) => x.id === id);
  const list = jobs.filter((j) => (store === "all" || j.dealership_id === store)
    && `${j.title} ${j.department ?? ""} ${s(j.dealership_id)?.city ?? ""} ${s(j.dealership_id)?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-4xl">Open jobs</h1>
      <p className="mt-2 text-muted-foreground">{jobs.length} roles across {stores.length} stores.</p>
      <div className="mt-6 flex flex-col gap-2 rounded-2xl bg-background p-3 shadow-sm sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Search jobs" className="pl-9" placeholder="Job title or city" value={q}
            onChange={(e) => navigate({ search: (p) => ({ ...p, q: e.target.value || undefined }), replace: true })} /></div>
        <select aria-label="Store" className="h-9 rounded-md border bg-background px-2 text-sm" value={store}
          onChange={(e) => navigate({ search: (p) => ({ ...p, store: e.target.value === "all" ? undefined : e.target.value }) })}>
          <option value="all">All stores</option>{stores.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <div className="mt-6 space-y-3">
        {list.map((j) => {
          const st = s(j.dealership_id);
          const pay = formatPay(j.pay_min, j.pay_max, j.pay_period);
          return (
            <Link key={j.id} to="/c/$orgSlug/jobs/$jobId" params={{ orgSlug: org.slug, jobId: j.id }} search={{ source: "own_site" }}
              className="block rounded-2xl bg-background p-5 shadow-sm transition hover:shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h2 className="text-lg">{j.title}</h2><p className="text-sm text-muted-foreground">{st?.name}</p></div>
                {pay && <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-sapphire">{pay}</span>}
              </div>
              {st?.city && <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-3.5" />{st.city}{st.state ? `, ${st.state}` : ""}</p>}
            </Link>
          );
        })}
        {!list.length && (
          <p className="rounded-2xl bg-background p-6 text-center text-muted-foreground">
            No matching jobs right now. <Link to="/careers/contact" className="text-sapphire underline">Tell us what you're looking for</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
