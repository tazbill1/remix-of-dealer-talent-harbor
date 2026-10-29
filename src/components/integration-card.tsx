import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type IntegrationState = "connected" | "demo" | "coming_soon";
const labels = { connected: "Connected", demo: "Demo mode", coming_soon: "Coming soon" };
const styles = {
  connected: "bg-status-connected text-status-connected-foreground",
  demo: "bg-status-demo text-status-demo-foreground",
  coming_soon: "bg-secondary text-muted-foreground",
};

export function IntegrationBadge({ state }: { state: IntegrationState }) {
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", styles[state])}>{labels[state]}</span>;
}

export function IntegrationCard({ icon: Icon, title, state, what, note, children, compact = false }: {
  icon: LucideIcon; title: string; state: IntegrationState; what?: string; note?: string; children?: ReactNode; compact?: boolean;
}) {
  return <section aria-label={title} className={cn("flex min-w-0 flex-col rounded-lg border bg-card p-5 text-card-foreground shadow-sm", compact ? "h-auto self-start" : "integration-card")}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold"><Icon className="size-5 shrink-0 text-sapphire" />{title}</h2>
      <IntegrationBadge state={state} />
    </div>
    <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
      {what && <p className="text-sm">{what}</p>}
      {note && <p className="mt-3 text-sm text-muted-foreground">{note}</p>}
      {children}
    </div>
  </section>;
}