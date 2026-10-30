import { createFileRoute, Outlet, notFound } from "@tanstack/react-router";
import { getCareers } from "@/lib/public.functions";
import { CAREERS_ORG_SLUG } from "@/lib/site";
import { CareersShell } from "@/components/careers-shell";

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

function CareersLayout() {
  return <CareersShell><Outlet /></CareersShell>;
}
