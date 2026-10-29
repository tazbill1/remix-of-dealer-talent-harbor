import { createFileRoute, Link, Outlet, notFound } from "@tanstack/react-router";
import { getCareers } from "@/lib/public.functions";
import { CAREERS_ORG_SLUG } from "@/lib/site";
import { AbcLogo } from "@/components/abc-logo";

export const Route = createFileRoute("/careers")({
  loader: async () => {
    const d = await getCareers({ data: { slug: CAREERS_ORG_SLUG } });
    if (!d) throw notFound();
    return d;
  },
  component: CareersLayout,
  errorComponent: ({ error }) => <div role="alert" className="p-10 text-center">{error instanceof Error ? error.message : "Something went wrong."}</div>,
  notFoundComponent: () => <div className="p-10 text-center">This careers site isn't available yet.</div>,
});

const nav = [
  { to: "/careers", label: "Home", exact: true },
  { to: "/careers/jobs", label: "Jobs", exact: false },
  { to: "/careers/contact", label: "Contact", exact: false },
] as const;

function CareersLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-abc-gray">
      <div className="h-1.5 bg-abc-yellow" />
      <header className="bg-abc-black text-abc-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link to="/careers" aria-label="ABC Dealer Group careers home"><AbcLogo /></Link>
          <nav className="flex gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }}
                className="rounded-full px-3 py-1.5 text-abc-white/80 transition hover:text-abc-yellow"
                activeProps={{ className: "bg-abc-red text-abc-white" }}>{n.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="bg-abc-black text-abc-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-8 sm:flex-row">
          <AbcLogo />
          <p className="text-xs text-abc-white/60">Powered by hireme by WerkandMe</p>
        </div>
      </footer>
    </div>
  );
}
