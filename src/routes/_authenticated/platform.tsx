import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/org";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/platform")({
  head: () => ({ meta: [{ title: "WerkandMe Admin" }] }),
  component: Platform,
});

function Platform() {
  const { data: me } = useQuery(meQuery);
  const { data } = useQuery({
    queryKey: ["platform"],
    enabled: !!me?.isPlatformAdmin,
    queryFn: async () => {
      const [orgs, stores, apps] = await Promise.all([
        supabase.from("organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("dealerships").select("org_id"),
        supabase.from("applications").select("org_id"),
      ]);
      return { orgs: orgs.data ?? [], stores: stores.data ?? [], apps: apps.data ?? [] };
    },
  });
  if (me && !me.isPlatformAdmin) return <Navigate to="/dashboard" />;
  if (!me) return null;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl">WerkandMe Admin</h1><p className="text-muted-foreground">{data?.orgs.length ?? 0} dealer groups</p></div>
      <div className="overflow-hidden rounded-2xl bg-background shadow-sm">
        {data?.orgs.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-0">
            <div>
              <div className="font-semibold">{o.name}</div>
              <div className="text-sm text-muted-foreground">
                /c/{o.slug} · {data.stores.filter((s) => s.org_id === o.id).length} stores · {data.apps.filter((a) => a.org_id === o.id).length} applicants · joined {new Date(o.created_at).toLocaleDateString()}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => { localStorage.setItem("wm_org", o.id); window.location.href = "/dashboard"; }}>
              Open group
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
