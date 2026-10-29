import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyApplications, setMyNewsletter } from "@/lib/careers-portal.functions";
import { PORTAL_STEPS } from "@/lib/applicant-portal";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const title = "My applications | ABC Dealer Group Careers";
const description = "See your application progress, past applications and suggested jobs at ABC Dealer Group.";

export const Route = createFileRoute("/careers/account")({
  ssr: false,
  head: () => ({ meta: [
    { title }, { name: "description", content: description },
    { property: "og:title", content: title }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Account,
});

function Account() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (!data.user) navigate({ to: "/careers/login", replace: true }); else setReady(true); });
  }, [navigate]);
  const fetchMine = useServerFn(getMyApplications);
  const saveNews = useServerFn(setMyNewsletter);
  const q = useQuery({ queryKey: ["my-applications"], queryFn: () => fetchMine(), enabled: ready });

  async function signOut() {
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/careers", replace: true });
  }

  if (!ready || q.isLoading) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;
  if (q.error || !q.data) return <p role="alert" className="p-10 text-center">Couldn't load your applications. Please refresh.</p>;
  const d = q.data;

  return (
    <section className="mx-auto max-w-3xl space-y-8 px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl">My applications</h1><p className="text-sm text-muted-foreground">Signed in as {d.email}</p></div>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </div>

      <div>
        <h2 className="text-xl">Current</h2>
        {d.current.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No open applications. <Link to="/careers/jobs" className="text-abc-red underline">Browse jobs</Link></p> : (
          <div className="mt-3 space-y-3">
            {d.current.map((a) => (
              <div key={a.id} className="rounded-2xl border-l-4 border-abc-red bg-abc-white p-4 shadow-sm">
                <div className="flex flex-wrap justify-between gap-2"><div className="font-semibold">{a.jobTitle}</div><div className="text-sm text-muted-foreground">{a.storeName}</div></div>
                <p className="text-xs text-muted-foreground">Applied {new Date(a.appliedAt).toLocaleDateString()}</p>
                <ol className="mt-3 grid grid-cols-5 gap-1 text-center text-[11px]">
                  {PORTAL_STEPS.map((s, i) => (
                    <li key={s}><div className={`h-1.5 rounded-full ${i <= a.stage.step ? "bg-abc-red" : "bg-muted"}`} /><span className={i === a.stage.step ? "font-semibold" : "text-muted-foreground"}>{s}</span></li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl">Past applications</h2>
        {d.past.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing here yet.</p> : (
          <ul className="mt-3 divide-y rounded-2xl bg-abc-white shadow-sm">
            {d.past.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
                <span><span className="font-medium">{a.jobTitle}</span> · {a.storeName}</span>
                <span className="text-muted-foreground">{new Date(a.appliedAt).toLocaleDateString()} · {a.stage.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-xl">Jobs you might like</h2>
        {d.suggested.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">We'll suggest jobs here once you've applied. <Link to="/careers/jobs" className="text-abc-red underline">See all jobs</Link></p> : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {d.suggested.map((j) => (
              <a key={j.id} href={`/c/abc-motors/jobs/${j.id}`} className="rounded-2xl border-l-4 border-abc-yellow bg-abc-white p-4 shadow-sm hover:border-abc-red">
                <div className="font-semibold">{j.title}</div><div className="text-sm text-muted-foreground">{j.storeName}</div>
              </a>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-2xl bg-abc-white p-4 shadow-sm">
        <span className="text-sm">Send me job openings and news from {d.orgName}</span>
        <Switch checked={d.subscribed} onCheckedChange={async (on) => {
          try { await saveNews({ data: { on } }); toast.success(on ? "You're signed up" : "Unsubscribed"); void q.refetch(); }
          catch { toast.error("Couldn't save. Please try again."); }
        }} />
      </label>
    </section>
  );
}
