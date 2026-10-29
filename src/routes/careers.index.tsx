import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { MapPin, Wrench, Handshake, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Journey, FaqList, candidateJourney, candidateFaqs } from "@/components/journey-faq";
import { SITE_URL } from "@/lib/site";
import { CareersVideo } from "@/components/careers-portal";

const title = "Careers at ABC Dealer Group | Dealership jobs in sales, service and more";
const description = "Join ABC Dealer Group. Browse open dealership jobs in sales, service, parts and the office, and apply in a minute.";

export const Route = createFileRoute("/careers/")({
  head: () => ({
    meta: [
      { title }, { name: "description", content: description },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:type", content: "website" }, { property: "og:url", content: `${SITE_URL}/careers` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/careers` }],
  }),
  component: CareersHome,
});

const layout = getRouteApi("/careers");
const perks = [
  { icon: TrendingUp, title: "Room to grow", text: "Clear paths from entry level to management, across every store." },
  { icon: Wrench, title: "Training that pays", text: "Paid OEM and ASE certifications for technicians and service staff." },
  { icon: Handshake, title: "A team that has your back", text: "Friendly people, fast answers, and a hiring process that respects your time." },
];

function CareersHome() {
  const { org, stores, jobs } = layout.useLoaderData();
  return (
    <>
      <section className="relative overflow-hidden bg-abc-black px-5 pb-20 pt-12 text-abc-white">
        <div className="absolute -right-24 top-0 h-full w-1/2 -skew-x-12 bg-abc-red" aria-hidden />
        <div className="absolute -right-24 top-0 h-full w-1/2 -translate-x-10 -skew-x-12 border-l-8 border-abc-yellow" aria-hidden />
        <div className="relative mx-auto max-w-5xl">
          <p className="inline-block rounded-full bg-abc-yellow px-3 py-1 text-xs font-bold uppercase tracking-widest text-abc-black">Now hiring</p>
          <h1 className="mt-5 max-w-2xl text-4xl font-black md:text-6xl">Build your career at <span className="text-abc-red">{org.name}.</span></h1>
          <p className="mt-4 max-w-xl text-lg text-abc-white/80">{jobs.length} open roles across {stores.length} dealerships. Apply in a minute, hear back fast.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-abc-red text-abc-white hover:bg-abc-red-dark"><Link to="/careers/jobs">See open jobs</Link></Button>
            <Button asChild size="lg" className="bg-abc-white text-abc-black hover:bg-abc-yellow"><Link to="/careers/contact">Ask us a question</Link></Button>
          </div>
        </div>
      </section>
      <CareersVideo />
      <section className="mx-auto grid max-w-5xl gap-4 px-5 py-12 md:grid-cols-3">
        {perks.map((p) => (
          <div key={p.title} className="rounded-2xl border-t-4 border-abc-red bg-abc-white p-6 shadow-sm">
            <p.icon className="size-6 text-abc-red" /><h2 className="mt-3 text-lg">{p.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
          </div>
        ))}
      </section>
      {stores.length > 0 && (
        <section className="mx-auto max-w-5xl px-5 pb-12">
          <h2 className="text-2xl">Our stores</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {stores.map((s) => (
              <Link key={s.id} to="/careers/jobs" search={{ store: s.id }} className="rounded-2xl border-l-4 border-abc-yellow bg-abc-white p-4 shadow-sm transition hover:border-abc-red hover:shadow-md">
                <div className="font-semibold">{s.name}</div>
                {s.city && <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-3.5" />{s.city}{s.state ? `, ${s.state}` : ""}</div>}
                <div className="mt-2 text-sm font-semibold text-abc-red">{((n) => `${n} open job${n === 1 ? "" : "s"}`)(jobs.filter((j) => j.dealership_id === s.id).length)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="bg-background">
        <Journey title="Your path from applicant" accent="to team member." steps={candidateJourney} />
        <FaqList faqs={candidateFaqs} />
      </div>
    </>
  );
}
