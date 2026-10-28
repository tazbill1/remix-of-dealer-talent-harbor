import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Building2, Bot, Rss, Video, ShieldCheck, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo, GradientText } from "@/components/brand";
import { Journey, FaqList, groupJourney, groupFaqs } from "@/components/journey-faq";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WerkandMe Hiring | Applicant tracking for dealer groups" },
      { name: "description", content: "Post jobs across every store, push them to Indeed, and keep every applicant engaged with a friendly AI HR assistant." },
      { property: "og:title", content: "WerkandMe Hiring | Applicant tracking for dealer groups" },
      { property: "og:description", content: "One hub for every store's hiring, with a friendly AI HR assistant for each dealership." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Building2, title: "Every store, one place", text: "5 stores or 50. Post jobs per store, see the whole group at a glance." },
  { icon: Rss, title: "Out to Indeed and more", text: "A live job feed that Indeed, ZipRecruiter and Google Jobs pick up automatically." },
  { icon: Bot, title: "An HR assistant for each store", text: "Kind, upbeat and organized. Keeps applicants in the loop and managers on track." },
  { icon: Video, title: "Welcome videos", text: "Say thanks with a video from the store, and invite applicants to record their own intro." },
  { icon: Mic, title: "Smarter interviews", text: "Structured interview kits and scorecards, with questions tailored to each role." },
  { icon: ShieldCheck, title: "Your data stays yours", text: "Each dealer group is fully private. Nothing ever crosses between groups." },
];

function Index() {
  const navigate = useNavigate();
  // Signed-in users go straight to the dashboard; everyone else sees the marketing page.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex gap-2">
          <Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button>
          <Button asChild><Link to="/auth" search={{ mode: "signup" }}>Get started</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 md:pt-20">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-sapphire">Hiring for dealer groups</p>
        <h1 className="max-w-3xl text-4xl leading-tight md:text-6xl">
          Hire great people at every store. <GradientText>Together.</GradientText>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          WerkandMe gives your whole dealer group one simple place to post jobs, reach top job sites,
          and keep every applicant excited, informed and moving forward.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" variant="outline" asChild><Link to="/auth">I already have an account</Link></Button>
        </div>
      </section>

      <section className="bg-navy py-16 text-navy-foreground">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl bg-sidebar-accent p-6">
              <f.icon className="mb-4 size-7 text-ultramarine" />
              <h3 className="text-lg">{f.title}</h3>
              <p className="mt-2 text-sm text-sidebar-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <Journey title="The employee journey," accent="start to 90 days." steps={groupJourney} />
      <FaqList faqs={groupFaqs} />

      <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-muted-foreground">
        We change werk for the better. © {new Date().getFullYear()} WerkandMe
      </footer>
    </div>
  );
}
