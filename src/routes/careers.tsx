import { createFileRoute, Link, Outlet, notFound } from "@tanstack/react-router";
import { getCareers } from "@/lib/public.functions";
import { CAREERS_ORG_SLUG } from "@/lib/site";
import { Logo } from "@/components/brand";

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
  const { org } = Route.useLoaderData();
  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/careers" className="font-display text-lg font-bold">{org.name} Careers</Link>
          <nav className="flex gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }}
                className="rounded-full px-3 py-1.5 text-sidebar-foreground transition hover:text-navy-foreground"
                activeProps={{ className: "bg-sapphire text-primary-foreground" }}>{n.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">Powered by <Logo className="h-4" /></footer>
    </div>
  );
}
