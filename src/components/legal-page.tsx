import { Logo } from "@/components/brand";

export const COMPANY = {
  legal: "Go Blue Technology LLC d/b/a WerkandMe",
  program: "hireme by WerkandMe",
  address: "13301 Jaudon Ranch Road, Dover, FL 33527",
  email: "support@werkandme.com",
  updated: "October 27, 2026",
};

/** Simple, readable layout for the public Privacy Policy and Terms pages. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted px-5 py-10">
      <article className="mx-auto max-w-3xl space-y-4 rounded-2xl bg-background p-6 text-sm leading-relaxed shadow-sm md:p-10 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        <Logo className="h-6" />
        <h1 className="text-3xl">{title}</h1>
        <p className="text-muted-foreground">
          {COMPANY.program} · {COMPANY.legal} · Last updated {COMPANY.updated}
        </p>
        {children}
        <h2>Contact us</h2>
        <p>
          {COMPANY.legal}
          <br />
          {COMPANY.address}
          <br />
          <a className="underline" href={`mailto:${COMPANY.email}`}>
            {COMPANY.email}
          </a>
        </p>
      </article>
    </div>
  );
}
