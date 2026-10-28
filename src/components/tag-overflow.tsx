import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Small "+N" chip; hover or tap shows the hidden tags. Clicks don't open the applicant. */
export function TagOverflow({ tags }: { tags: ReactNode[] }) {
  const [open, setOpen] = useState(false);
  if (!tags.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${tags.length} more tags`}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
          className="mt-1 inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">+{tags.length}</button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto max-w-64 flex-wrap gap-1 p-2" onClick={(e) => e.stopPropagation()}>{tags}</PopoverContent>
    </Popover>
  );
}
