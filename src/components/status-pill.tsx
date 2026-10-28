import { STATUS_COLOR, STATUS_LABEL, type AppStatus } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/** Client stage colors are fixed data values, with white text on each. */
export function StatusPill({ status, className, label }: { status: AppStatus; className?: string; label?: string | undefined }) {
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold", className)}
      style={{ backgroundColor: STATUS_COLOR[status], color: "#FFFFFF" }}>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export const statusSelectStyle = (s: AppStatus) => ({ backgroundColor: STATUS_COLOR[s], color: "#FFFFFF" });
