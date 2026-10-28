import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Users, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { STATUSES, STATUS_LABEL, type AppStatus } from "@/lib/jobs";
import { GradientText } from "@/components/brand";
import { dayKey } from "@/lib/applicant-filters";
import { isTestName } from "@/lib/display";
import { InterviewHoursCard } from "@/components/interview-hours";
import { StoreInterviewersCard } from "@/components/store-interviewers";
import { StoreVideosCard } from "@/components/store-videos";
import { QrCard } from "@/components/qr-card";
import { scanLink } from "@/lib/scan";
import { canPostJobs } from "@/lib/jobs";

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

  const { store, jobs } = data;
  // Match the Applicants list, which hides test applicants by default.
  const apps = data.apps.filter((a) => !isTestName(a.full_name));
  const tz = store.timezone || "America/Chicago";
  const openJobs = jobs.filter((j) => j.status === "open");
  const jobTitle = (id: string) => jobs.find((j) => j.id === id)?.title ?? "";
  const today = dayKey(Date.now(), tz);
  const waiting = apps.filter((a) => a.status === "new" && Date.now() - +new Date(a.created_at) > 48 * 3600e3).length;
  const stats = [
    { label: "Open jobs", value: openJobs.length, icon: Briefcase, to: "/jobs" as const, search: { store: store.id, status: "open" } },
    { label: "New today", value: apps.filter((a) => dayKey(a.created_at, tz) === today).length, icon: Sparkles, to: "/applicants" as const, search: { store: store.id, applied: "today" } },
    { label: "Total applicants", value: apps.length, icon: Users, to: "/applicants" as const, search: { store: store.id } },
    { label: "Hired", value: apps.filter((a) => a.status === "hired").length, icon: Trophy, to: "/applicants" as const, search: { store: store.id, status: "hired" } },
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
          <Link key={s.label} to={s.to} search={s.search} aria-label={`${s.label}: ${s.value}. View list`}
            className="block cursor-pointer rounded-2xl bg-background p-5 shadow-sm transition hover:shadow-md hover:ring-1 hover:ring-sapphire/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sapphire">
            <s.icon className="size-5 text-sapphire" />
            <div className="mt-3 text-3xl font-extrabold">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </Link>
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
      <StoreInterviewersCard orgId={org.orgId} storeId={store.id} />
      <div className="rounded-2xl bg-background p-5 shadow-sm">
        <h2 className="mb-1 text-lg">Store QR code</h2>
        <p className="mb-4 text-sm text-muted-foreground">Put this on signs and flyers at the store. Applicants who scan it are tagged "Store QR code".</p>
        <QrCard name={store.name} link={scanLink(typeof window !== "undefined" ? window.location.origin : "", "store", store.qr_code)} showLink
          caption={`Scans open ${store.name}'s jobs.`} fileName={`${store.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-store-qr.png`} />
      </div>
      <StoreVideosCard orgId={org.orgId} storeId={store.id}
        canEdit={canPostJobs(org.role, org.isPlatformAdmin) || org.role === "dealer_manager" || org.role === "hiring_manager"} />
      <div className="rounded-2xl bg-background p-5 shadow-sm">
        <h2 className="mb-4 text-lg">Pipeline</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-5">
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
