import { redirect, Link } from "@tanstack/react-router";
import { resolveScanCode } from "@/lib/public.functions";
import { scanDestination } from "@/lib/scan";
import { Logo } from "@/components/brand";

/** Shared loader for /e/CODE and /s/CODE: send active scans on, else show the inactive page. */
export async function loadScan(kind: "event" | "store", code: string) {
  const r = await resolveScanCode({ data: { code, kind } });
  if (r.active) {
    const d = scanDestination(r.scan);
    if (d.to === "job") throw redirect({ to: "/c/$orgSlug/jobs/$jobId", params: { orgSlug: d.orgSlug, jobId: d.jobId }, search: { scan: r.code } });
    throw redirect({ to: "/c/$orgSlug", params: { orgSlug: d.orgSlug }, search: { scan: r.code, ...(d.storeId ? { store: d.storeId } : {}) } });
  }
  return { orgSlug: r.orgSlug };
}

export const SCAN_HEAD = () => ({ meta: [
  { title: "Job link | hireme" }, { name: "description", content: "Open jobs from a recruiting event or store QR code." },
  { property: "og:title", content: "Job link | hireme" }, { property: "og:description", content: "Open jobs from a recruiting event or store QR code." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
] });

export function InactiveScan({ orgSlug }: { orgSlug: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-5">
      <div className="max-w-md space-y-4 rounded-2xl bg-background p-8 text-center shadow-sm">
        <Logo className="mx-auto h-7" />
        <h1 className="text-2xl">This link is no longer active</h1>
        <p className="text-muted-foreground">The event or QR code you scanned has ended, but there are still open jobs.</p>
        <Link to="/c/$orgSlug" params={{ orgSlug }} className="inline-block font-medium text-sapphire underline">See open jobs</Link>
      </div>
    </div>
  );
}
