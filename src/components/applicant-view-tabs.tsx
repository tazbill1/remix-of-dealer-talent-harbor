import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useOrg } from "@/lib/org";
import { canSeeNav } from "@/lib/nav";

export type ApplicantView = "all" | "attention" | "pool" | "duplicates";

const cls = (active: boolean) => cn("rounded-md px-3 py-1.5 text-sm", active ? "bg-sapphire text-primary-foreground" : "hover:bg-secondary");

/** Quick views shared by Applicants, Talent pool and Possible duplicates (each keeps its own page). */
export function ApplicantViewTabs({ active }: { active: ApplicantView }) {
  const org = useOrg();
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-1" role="tablist" aria-label="Applicant views">
      <Link to="/applicants" search={{}} role="tab" aria-selected={active === "all"} className={cls(active === "all")}>All</Link>
      <Link to="/applicants" search={{ focus: "attention" }} role="tab" aria-selected={active === "attention"} className={cls(active === "attention")}>Needs attention</Link>
      <Link to="/talent-pool" role="tab" aria-selected={active === "pool"} className={cls(active === "pool")}>Talent pool</Link>
      {canSeeNav("/duplicates", org) && (
        <Link to="/duplicates" role="tab" aria-selected={active === "duplicates"} className={cls(active === "duplicates")}>Possible duplicates</Link>
      )}
    </div>
  );
}
