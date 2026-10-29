import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { rememberReferral } from "@/lib/referral-capture";
import { rememberScan } from "@/lib/scan";
import { MapPin, Search } from "lucide-react";
import { getCareers } from "@/lib/public.functions";
import { formatPay } from "@/lib/jobs";
import { Input } from "@/components/ui/input";
import { Logo, GradientText } from "@/components/brand";
import { Journey, FaqList, candidateJourney, candidateFaqs } from "@/components/journey-faq";

export const Route = createFileRoute("/c/$orgSlug/")({
  validateSearch: z.object({ store: z.string().max(60).optional(), scan: z.string().max(16).optional(), ref: z.string().max(20).optional(), via: z.string().max(10).optional() }),
  loaderDeps: ({ search }) => ({ scan: search.scan }),
  loader: async ({ params, deps }) => {
    const d = await getCareers({ data: { slug: params.orgSlug, ...(deps.scan ? { scan: deps.scan } : {}) } });
    if (!d) throw notFound();
    return d;
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `Careers at ${loaderData.org.name}` : "Careers";
    const desc = loaderData ? `${loaderData.jobs.length} open jobs across ${loaderData.stores.length} dealerships at ${loaderData.org.name}.` : "Open jobs";
    return { meta: [{ title: t }, { name: "description", content: desc }, { property: "og:title", content: t }, { property: "og:description", content: desc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: Careers,
  errorComponent: () => <p className="p-6 text-muted-foreground">Open jobs couldn't be loaded. Please try again.</p>,
  notFoundComponent: () => <p className="p-6 text-muted-foreground">This careers page is unavailable.</p>,
});

function Careers() {
  const { org, stores, jobs } = Route.useLoaderData();
  const { ref, via, scan, store: storeParam } = Route.useSearch();
  useEffect(() => { rememberReferral(org.slug, ref, via); }, [org.slug, ref, via]);
  useEffect(() => { rememberScan(org.slug, scan); }, [org.slug, scan]);
  const [q, setQ] = useState("");
  const [store, setStore] = useState(storeParam && stores.some((x) => x.id === storeParam) ? storeParam : "all");
  useEffect(() => { setStore(storeParam && stores.some((x) => x.id === storeParam) ? storeParam : "all"); }, [storeParam, stores]);
  const s = (id: string) => stores.find((x) => x.id === id);
  const list = jobs.filter((j) => (store === "all" || j.dealership_id === store)
    && `${j.title} ${j.department ?? ""} ${s(j.dealership_id)?.city ?? ""} ${s(j.dealership_id)?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="min-h-screen bg-muted">
      <section className="bg-navy px-5 pb-14 pt-8 text-navy-foreground">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-sidebar-foreground">{org.name}</p>
          <h1 className="mt-6 text-4xl md:text-5xl">Find your next <GradientText>great job.</GradientText></h1>
          <p className="mt-3 text-sidebar-foreground">{jobs.length} open roles across {stores.length} stores.</p>
        </div>
      </section>
      <div className="mx-auto -mt-7 max-w-4xl px-5">
        <div className="flex flex-col gap-2 rounded-2xl bg-background p-3 shadow-md sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Job title or city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={store} onChange={(e) => setStore(e.target.value)}>
            <option value="all">All stores</option>{stores.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div className="mt-6 space-y-3 pb-16">
          {list.map((j) => {
            const st = s(j.dealership_id);
            return (
              <Link key={j.id} to="/c/$orgSlug/jobs/$jobId" params={{ orgSlug: org.slug, jobId: j.id }} search={{ ...(scan ? { scan } : {}), ...(ref ? { ref } : {}), ...(via ? { via } : {}) }}
                className="block rounded-2xl bg-background p-5 shadow-sm transition hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg">{j.title}</h2>
                    <p className="text-sm text-muted-foreground">{st?.name}</p>
                  </div>
                  {formatPay(j.pay_min, j.pay_max, j.pay_period) && (
                    <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-sapphire">{formatPay(j.pay_min, j.pay_max, j.pay_period)}</span>
                  )}
                </div>
                {st?.city && <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-3.5" />{st.city}{st.state ? `, ${st.state}` : ""}</p>}
              </Link>
            );
          })}
          {!list.length && <p className="rounded-2xl bg-background p-6 text-center text-muted-foreground">No matching jobs right now. Check back soon!</p>}
        </div>
      </div>
      <div className="bg-background">
        <Journey title="Your path from applicant" accent="to team member." steps={candidateJourney} />
        <FaqList faqs={candidateFaqs} />
      </div>
      <footer className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">Powered by <Logo className="h-4" /></footer>
    </div>
  );
}
