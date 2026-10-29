import { cn } from "@/lib/utils";

/** Made-up ABC Dealer Group mark: red shield, yellow speed stripe, white letters. */
export function AbcLogo({ className, withText = true, textClassName }: { className?: string; withText?: boolean; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 48 48" className="size-10 shrink-0" role="img" aria-label="ABC Dealer Group logo">
        <path d="M24 2 44 9v15c0 12-8.5 19.5-20 22C12.5 43.5 4 36 4 24V9z" className="fill-abc-red" />
        <path d="M24 2 44 9v15c0 12-8.5 19.5-20 22C12.5 43.5 4 36 4 24V9z" className="fill-none stroke-abc-black" strokeWidth="2.5" />
        <path d="M8 31 40 21v4L8 35z" className="fill-abc-yellow" />
        <text x="24" y="25" textAnchor="middle" className="fill-abc-white" style={{ font: "900 13px system-ui, sans-serif", letterSpacing: "-0.5px" }}>ABC</text>
      </svg>
      {withText && (
        <span className={cn("leading-none", textClassName)}>
          <span className="block font-display text-lg font-black tracking-tight">ABC</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">Dealer Group</span>
        </span>
      )}
    </span>
  );
}
