import { STATUS_LABEL, type AppStatus } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/** Statuses display in one neutral style; saved colors (STATUS_COLOR) are kept but not shown. */
export function StatusPill({ status, className, label }: { status: AppStatus; className?: string; label?: string | undefined }) {
  return (
    <span className={cn("inline-block rounded-full bg-border px-2 py-0.5 text-xs font-semibold text-foreground", className)}>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

/** Neutral: no per-status color. Kept as a function so callers don't change. */
export const statusSelectStyle = (_s: AppStatus) => ({});
