import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Users, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { GradientText } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | WerkandMe Hiring" }] }),
  component: Dashboard,
});

function Dashboard() {
  const org = useOrg();
  const { data } = useQuery({
    queryKey: ["dashboard", org.orgId],
    queryFn: async () => {
      const [stores, jobs, apps] = await Promise.all([
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId),
        supabase.from("jobs").select("id, status, dealership_id").eq("org_id", org.orgId),
        supabase.from("applications").select("id, status, dealership_id, created_at").eq("org_id", org.orgId),
      ]);
      return { stores: stores.data ?? [], jobs: jobs.data ?? [], apps: apps.data ?? [] };
    },
  });
  const stores = data?.stores ?? [];
  const apps = data?.apps ?? [];
  const openJobs = (data?.jobs ?? []).filter((j) => j.status === "open").length;
  const today = new Date().toDateString();
  const newToday = apps.filter((a) => new Date(a.created_at).toDateString() === today).length;
  const waiting = apps.filter((a) => a.status === "new" && Date.now() - +new Date(a.created_at) > 48 * 3600e3).length;
  const ranking = stores.map((s) => ({
    ...s,
    total: apps.filter((a) => a.dealership_id === s.id).length,
    hired: apps.filter((a) => a.dealership_id === s.id && a.status === "hired").length,
  })).sort((a, b) => b.total - a.total);

  const stats = [
    { label: "Open jobs", value: openJobs, icon: Briefcase },
    { label: "New today", value: newToday, icon: Sparkles },
    { label: "Total applicants", value: apps.length, icon: Users },
    { label: "Hired", value: apps.filter((a) => a.status === "hired").length, icon: Trophy },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Good to see you! <GradientText>Here's the group.</GradientText></h1>
        <p className="text-muted-foreground">{org.orgName} · {stores.length} stores</p>
      </div>
      {stores.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-background p-6">
          <p className="font-semibold">First step: add your stores.</p>
          <Button className="mt-3" asChild><Link to="/stores">Add stores</Link></Button>
        </div>
      )}
      {waiting > 0 && (
        <div className="rounded-2xl bg-accent p-4 text-sm">
          <b>{waiting} applicant{waiting > 1 ? "s have" : " has"}</b> been waiting more than 48 hours.{" "}
          <Link to="/applicants" className="font-semibold text-sapphire hover:underline">Review now</Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-background p-5 shadow-sm">
            <s.icon className="size-5 text-sapphire" />
            <div className="mt-3 text-3xl font-extrabold">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-background p-5 shadow-sm">
        <h2 className="mb-4 text-lg">Stores by applicants</h2>
        <div className="divide-y">
          {ranking.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between py-3 text-sm">
              <span><span className="mr-3 text-muted-foreground">{i + 1}</span>{s.name}</span>
              <span className="text-muted-foreground">{s.total} applicants · <span className="font-semibold text-foreground">{s.hired} hired</span></span>
            </div>
          ))}
          {ranking.length === 0 && <p className="py-3 text-sm text-muted-foreground">No stores yet.</p>}
        </div>
      </div>
    </div>
  );
}
