import { Loader2 } from "lucide-react";

/** Simple centered spinner shown while a route (e.g. the dashboard) is loading. */
export function RouteSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
      <Loader2 className="size-8 animate-spin text-sapphire" />
    </div>
  );
}
