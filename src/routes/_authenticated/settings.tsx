import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { settingsTabsFor, type SettingsTab } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { StatusRulesSettings } from "@/components/settings/status-rules";
import { MessageTemplatesSettings } from "@/components/settings/templates";
import { AutomaticTextsSettings } from "@/components/settings/automations";
import { OnboardingTemplatesSettings } from "@/components/settings/onboarding-templates";
import { StoreVideosCard } from "@/components/store-videos";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [
    { title: "Settings | WerkandMe Hiring" },
    { name: "description", content: "Status rules, templates, automatic texts, onboarding templates and videos in one place." },
    { property: "og:title", content: "Settings | WerkandMe Hiring" },
    { property: "og:description", content: "Status rules, templates, automatic texts, onboarding templates and videos in one place." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: z.object({ tab: z.enum(["rules", "templates", "texts", "onboarding", "videos"]).optional() }),
  component: SettingsPage,
});

function SettingsPage() {
  const org = useOrg();
  const tabs = settingsTabsFor(org);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: SettingsTab = tabs.find((t) => t.id === search.tab)?.id ?? tabs[0]!.id;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-1" role="tablist" aria-label="Settings">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => navigate({ search: { tab: t.id }, replace: true })}
            className={cn("rounded-md px-3 py-1.5 text-sm", tab === t.id ? "bg-sapphire text-primary-foreground" : "hover:bg-secondary")}>{t.label}</button>
        ))}
      </div>
      {tab === "rules" && <StatusRulesSettings />}
      {tab === "templates" && <MessageTemplatesSettings />}
      {tab === "texts" && <AutomaticTextsSettings />}
      {tab === "onboarding" && <OnboardingTemplatesSettings />}
      {tab === "videos" && <VideosTab />}
    </div>
  );
}

function VideosTab() {
  const org = useOrg();
  const isHr = canPostJobs(org.role, org.isPlatformAdmin);
  const storeRole = org.role === "dealer_manager" || org.role === "hiring_manager";
  // RLS returns only the stores this person can see.
  const { data: stores = [] } = useQuery({
    queryKey: ["stores", org.orgId],
    queryFn: async () => (await supabase.from("dealerships").select("*").eq("org_id", org.orgId).order("name")).data ?? [],
  });
  return (
    <div className="space-y-6">
      {(isHr || org.role === "regional_leader") && <StoreVideosCard orgId={org.orgId} storeId={null} canEdit={isHr} />}
      {stores.map((s) => (
        <StoreVideosCard key={s.id} orgId={org.orgId} storeId={s.id} canEdit={isHr || storeRole} collapsibleTitle={s.name} />
      ))}
    </div>
  );
}
