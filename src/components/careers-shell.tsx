import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AbcLogo } from "@/components/abc-logo";
import { ApplicantMenu, NewsletterSignup } from "@/components/careers-portal";

const nav = [
  { to: "/careers", label: "Home", exact: true },
  { to: "/careers/jobs", label: "Jobs", exact: false },
  { to: "/careers/contact", label: "Contact", exact: false },
] as const;

/** Branded header + footer shared by every page of the group's careers site, including job/apply pages. */
export function CareersShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-abc-gray">
      <div className="h-1.5 bg-abc-yellow" />
      <header className="bg-abc-black text-abc-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link to="/careers" aria-label="ABC Dealer Group careers home"><AbcLogo /></Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }}
                className="rounded-full px-3 py-1.5 text-abc-white/80 transition hover:text-abc-yellow"
                activeProps={{ className: "bg-abc-red text-abc-white" }}>{n.label}</Link>
            ))}
            <ApplicantMenu />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-abc-black text-abc-white">
        <NewsletterSignup />
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-8 sm:flex-row">
          <AbcLogo />
          <p className="text-xs text-abc-white/60">Powered by hireme by WerkandMe</p>
        </div>
      </footer>
    </div>
  );
}
