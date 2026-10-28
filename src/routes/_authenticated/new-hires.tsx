import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { overdueCount, progress } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/new-hires")({
  head: () => ({ meta: [
    { title: "Onboarding | WerkandMe Hiring" }, { name: "description", content: "Track new hire paperwork and manager tasks." },
    { property: "og:title", content: "Onboarding | WerkandMe Hiring" }, { property: "og:description", content: "Track new hire paperwork and manager tasks." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Onboarding,
});

function Onboarding() {
  const org = useOrg();
  const navigate = useNavigate();
  const isHr = canPostJobs(org.role, org.isPlatformAdmin);
  const { data, isPending } = useQuery({
    queryKey: ["onboarding-list", org.orgId],
    queryFn: async () => {
      const [lists, items, apps, stores] = await Promise.all([
        supabase.from("onboarding_checklists").select("id, application_id, store_id, start_date, status").eq("org_id", org.orgId).order("start_date", { ascending: false }),
        supabase.from("onboarding_checklist_items").select("checklist_id, required, completed_at, due_date").eq("org_id", org.orgId),
        supabase.from("applications").select("id, full_name").eq("org_id", org.orgId).eq("status", "hired"),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId),
      ]);
      return { lists: lists.data ?? [], items: items.data ?? [], apps: apps.data ?? [], stores: stores.data ?? [] };
    },
  });
  if (org.role === "regional_leader" && !org.isPlatformAdmin) return <p className="text-muted-foreground">Onboarding is available to HR and store managers.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl"><ClipboardCheck className="size-7 text-sapphire" />Onboarding</h1>
          <p className="text-muted-foreground">Every new hire gets a checklist when they're moved to Hired. Nothing is sent automatically.</p>
        </div>
        {isHr && <Button variant="outline" asChild><Link to="/settings" search={{ tab: "onboarding" }}>Onboarding templates</Link></Button>}
      </div>
      <div className="overflow-x-auto rounded-2xl bg-background shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground">
            {["New hire", "Store", "Start date", "Progress", ""].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {(data?.lists ?? []).map((c) => {
              const its = (data?.items ?? []).filter((i) => i.checklist_id === c.id);
              const p = progress(its);
              const late = overdueCount(its);
              return (
                <tr key={c.id} className="cursor-pointer border-b last:border-0 hover:bg-secondary/60"
                  onClick={() => void navigate({ to: "/applicants", search: { applicant: c.application_id, tab: "onboarding" } })}>
                  <td className="px-3 py-2.5 font-medium">{data?.apps.find((a) => a.id === c.application_id)?.full_name ?? "New hire"}</td>
                  <td className="px-3 py-2.5">{data?.stores.find((s) => s.id === c.store_id)?.name ?? ""}</td>
                  <td className="px-3 py-2.5">{c.start_date ? new Date(`${c.start_date}T12:00:00`).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-lime" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></div>
                      <span className="text-xs text-muted-foreground">{p.done} of {p.total}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">{late > 0 && <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">{late} overdue item{late === 1 ? "" : "s"}</span>}</td>
                </tr>
              );
            })}
            {!isPending && !data?.lists.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No new hires yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
