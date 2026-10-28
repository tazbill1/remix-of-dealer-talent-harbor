import { createFileRoute } from "@tanstack/react-router";
import { InactiveScan, loadScan, SCAN_HEAD } from "@/components/scan-redirect";

export const Route = createFileRoute("/s/$code")({
  loader: ({ params }) => loadScan("store", params.code),
  head: SCAN_HEAD,
  component: () => <InactiveScan orgSlug={Route.useLoaderData().orgSlug} />,
  errorComponent: () => <InactiveScan orgSlug="abc-motors" />,
  notFoundComponent: () => <InactiveScan orgSlug="abc-motors" />,
});
