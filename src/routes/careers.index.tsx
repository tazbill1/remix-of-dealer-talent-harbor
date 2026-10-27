import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { MapPin, Wrench, Handshake, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/brand";
import { Journey, FaqList, candidateJourney, candidateFaqs } from "@/components/journey-faq";
import { SITE_URL } from "@/lib/site";

const title = "Careers at ABC Motors | Dealership jobs in sales, service and more";
const description = "Join ABC Motors. Browse open dealership jobs in sales, service, parts and the office, and apply in a minute.";

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
      <section className="bg-navy px-5 pb-16 pt-10 text-navy-foreground">
        <div className="mx-auto max-w-5xl">
          <h1 className="max-w-2xl text-4xl md:text-6xl">Build your career at <GradientText>{org.name}.</GradientText></h1>
          <p className="mt-4 max-w-xl text-lg text-sidebar-foreground">{jobs.length} open roles across {stores.length} dealerships. Apply in a minute, hear back fast.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/careers/jobs">See open jobs</Link></Button>
            <Button asChild size="lg" variant="secondary"><Link to="/careers/contact">Ask us a question</Link></Button>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-5 py-12 md:grid-cols-3">
        {perks.map((p) => (
          <div key={p.title} className="rounded-2xl bg-background p-6 shadow-sm">
            <p.icon className="size-6 text-sapphire" /><h2 className="mt-3 text-lg">{p.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
          </div>
        ))}
      </section>
      {stores.length > 0 && (
        <section className="mx-auto max-w-5xl px-5 pb-12">
          <h2 className="text-2xl">Our stores</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {stores.map((s) => (
              <Link key={s.id} to="/careers/jobs" search={{ store: s.id }} className="rounded-2xl bg-background p-4 shadow-sm transition hover:shadow-md">
                <div className="font-semibold">{s.name}</div>
                {s.city && <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-3.5" />{s.city}{s.state ? `, ${s.state}` : ""}</div>}
                <div className="mt-2 text-sm text-sapphire">{((n) => `${n} open job${n === 1 ? "" : "s"}`)(jobs.filter((j) => j.dealership_id === s.id).length)}</div>
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
