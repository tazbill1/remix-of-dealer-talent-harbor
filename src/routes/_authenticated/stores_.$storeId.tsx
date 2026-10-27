import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Users, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { STATUSES, STATUS_LABEL, type AppStatus } from "@/lib/jobs";
import { GradientText } from "@/components/brand";
import { InterviewHoursCard } from "@/components/interview-hours";
import { StoreCalendarsCard } from "@/components/store-calendars";

export const Route = createFileRoute("/_authenticated/stores_/$storeId")({
  head: () => ({ meta: [{ title: "Store dashboard | WerkandMe Hiring" }] }),
  component: StoreDashboard,
});

function StoreDashboard() {
  const { storeId } = Route.useParams();
  const org = useOrg();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["store-dash", org.orgId, storeId],
    queryFn: async () => {
      const [store, jobs, apps] = await Promise.all([
        supabase.from("dealerships").select("*").eq("org_id", org.orgId).eq("id", storeId).maybeSingle(),
        supabase.from("jobs").select("id, title, status").eq("org_id", org.orgId).eq("dealership_id", storeId),
        supabase.from("applications").select("id, full_name, status, created_at, job_id").eq("org_id", org.orgId)
          .eq("dealership_id", storeId).order("created_at", { ascending: false }),
      ]);
      return { store: store.data, jobs: jobs.data ?? [], apps: apps.data ?? [] };
    },
  });

  const back = <Link to="/stores" className="inline-flex items-center gap-1 text-sm text-sapphire hover:underline"><ArrowLeft className="size-4" />Back to all stores</Link>;
  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (!data?.store) return <div className="space-y-4">{back}<p>Store not found.</p></div>;

  const { store, jobs, apps } = data;
  const openJobs = jobs.filter((j) => j.status === "open");
  const jobTitle = (id: string) => jobs.find((j) => j.id === id)?.title ?? "";
  const today = new Date().toDateString();
  const waiting = apps.filter((a) => a.status === "new" && Date.now() - +new Date(a.created_at) > 48 * 3600e3).length;
  const stats = [
    { label: "Open jobs", value: openJobs.length, icon: Briefcase },
    { label: "New today", value: apps.filter((a) => new Date(a.created_at).toDateString() === today).length, icon: Sparkles },
    { label: "Total applicants", value: apps.length, icon: Users },
    { label: "Hired", value: apps.filter((a) => a.status === "hired").length, icon: Trophy },
  ];

  return (
    <div className="space-y-6">
      {back}
      <div>
        <h1 className="text-3xl">{store.name} <GradientText>at a glance.</GradientText></h1>
        <p className="text-muted-foreground">
          {[store.brand, [store.city, store.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
          {" · "}Assistant: <span className="font-semibold text-sapphire">{store.assistant_name}</span>
        </p>
      </div>
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
      <InterviewHoursCard
        orgId={org.orgId}
        storeId={store.id}
        hours={store.interview_hours}
        minutes={store.interview_minutes}
        timeZone={store.timezone || "America/Chicago"}
        onSaved={() => qc.invalidateQueries({ queryKey: ["store-dash", org.orgId, storeId] })}
      />
      <StoreCalendarsCard orgId={org.orgId} storeId={store.id} />
      <div className="rounded-2xl bg-background p-5 shadow-sm">
        <h2 className="mb-4 text-lg">Pipeline</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {STATUSES.map((st) => (
            <div key={st} className="rounded-xl bg-muted p-3 text-center">
              <div className="text-2xl font-extrabold">{apps.filter((a) => a.status === st).length}</div>
              <div className="text-xs text-muted-foreground">{STATUS_LABEL[st]}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-background p-5 shadow-sm">
          <h2 className="mb-4 text-lg">Open jobs</h2>
          <div className="divide-y">
            {openJobs.map((j) => (
              <Link key={j.id} to="/jobs" className="block py-3 text-sm hover:text-sapphire">{j.title}</Link>
            ))}
            {!openJobs.length && <p className="py-3 text-sm text-muted-foreground">No open jobs.</p>}
          </div>
        </div>
        <div className="rounded-2xl bg-background p-5 shadow-sm">
          <h2 className="mb-4 text-lg">Recent applicants</h2>
          <div className="divide-y">
            {apps.slice(0, 8).map((a) => (
              <Link key={a.id} to="/applicants" className="flex items-center justify-between gap-2 py-3 text-sm hover:text-sapphire">
                <span><span className="font-semibold">{a.full_name}</span> <span className="text-muted-foreground">· {jobTitle(a.job_id)}</span></span>
                <span className="text-muted-foreground">{STATUS_LABEL[a.status as AppStatus]} · {new Date(a.created_at).toLocaleDateString()}</span>
              </Link>
            ))}
            {!apps.length && <p className="py-3 text-sm text-muted-foreground">No applicants yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
