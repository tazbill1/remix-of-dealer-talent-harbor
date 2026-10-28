import { createFileRoute, Link, Outlet, redirect, useLocation, useMatches, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LayoutDashboard, Briefcase, Users, Building2, Globe, LogOut, Shield, Menu, CalendarDays, BarChart3, UserCog, FileText, Plug, MessageSquareText, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { meQuery, OrgContext, type OrgCtx } from "@/lib/org";
import { useMessagingMode } from "@/lib/texting-mode";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/applicants", label: "Applicants", icon: Users },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/calendar", label: "Interviews", icon: CalendarDays },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/stores", label: "Stores", icon: Building2 },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/automations", label: "Automatic texts", icon: MessageSquareText },
  { to: "/status-rules", label: "Status rules", icon: Workflow },
  { to: "/integrations", label: "Integrations", icon: Plug },
] as const;

function Layout() {
  const { data: me, isLoading } = useQuery(meQuery);
  const loc = useLocation();
  // The route actually being rendered (stays in sync with <Outlet />, unlike the pending location).
  const leafId = useMatches({ select: (m) => m[m.length - 1]?.routeId });
  const navigate = useNavigate();
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("wm_org");
    if (saved) setOrgId(saved);
  }, []);

  const membership = me?.memberships.find((m) => m.org_id === orgId) ?? me?.memberships[0];
  const needsOnboarding = me && !membership && !me.isPlatformAdmin;

  useEffect(() => {
    if (needsOnboarding && loc.pathname !== "/onboarding") navigate({ to: "/onboarding" });
  }, [needsOnboarding, loc.pathname, navigate]);

  if (isLoading || !me) return <div className="p-10 text-muted-foreground">Loading...</div>;

  const ctx: OrgCtx | null = membership ? {
    orgId: membership.org_id, orgName: membership.organizations?.name ?? "",
    orgSlug: membership.organizations?.slug ?? "", role: membership.role, isPlatformAdmin: me.isPlatformAdmin,
  } : null;

  // Group pages only render once a dealer group exists; onboarding and the admin console never need one.
  const groupFree = leafId === "/_authenticated/onboarding" || leafId === "/_authenticated/platform";
  let body: React.ReactNode = <Outlet />;
  if (!ctx && !groupFree) {
    body = needsOnboarding
      ? <div className="p-10 text-muted-foreground">Setting things up...</div>
      : <div className="p-8"><p>Pick a dealer group from the WerkandMe Admin console.</p>
          <Button className="mt-4" asChild><Link to="/platform">Open admin console</Link></Button></div>;
  }
  return (
    <OrgContext.Provider value={ctx}>
      <Shell me={me} org={ctx} onPick={setOrgId}>{body}</Shell>
    </OrgContext.Provider>
  );
}

type Me = NonNullable<Awaited<ReturnType<NonNullable<typeof meQuery.queryFn>>>>;

function Shell({ me, org, onPick, children }: { me: Me; org: OrgCtx | null; onPick: (id: string) => void; children: React.ReactNode }) {
  const sidebar = <SidebarBody me={me} org={org} onPick={onPick} />;
  return (
    <div className="flex min-h-screen bg-muted">
      <aside className="hidden w-64 shrink-0 bg-sidebar text-sidebar-foreground sm:block">{sidebar}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-background px-4 py-3 sm:hidden">
          <Logo className="h-6" />
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Menu"><Menu /></Button></SheetTrigger>
            <SheetContent side="left" className="w-64 border-0 bg-sidebar p-0 text-sidebar-foreground">{sidebar}</SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

/** Practice vs live, always visible, so nobody wonders whether a text really went out. */
function ModeBadge({ orgId }: { orgId: string }) {
  const { emailLive } = useMessagingMode(orgId);
  const pill = (label: string, live: boolean) => (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", live ? "bg-lime text-navy" : "bg-sidebar-accent text-sidebar-accent-foreground")}>
      {label}: {live ? "Live" : "Practice"}
    </span>
  );
  return (
    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
    <Link to="/integrations" className="mb-4 flex flex-wrap gap-1.5 px-2" aria-label="Sending status. Click to manage in Integrations.">
      <span className="rounded-full bg-status-demo px-2 py-0.5 text-[11px] font-medium text-status-demo-foreground">Texts: Demo</span>
      {pill("Email", emailLive)}
    </Link>
    </TooltipTrigger><TooltipContent side="right">Sending status. Click to manage in Integrations.</TooltipContent></Tooltip></TooltipProvider>
  );
}

function SidebarBody({ me, org, onPick }: { me: Me; org: OrgCtx | null; onPick: (id: string) => void }) {
  const loc = useLocation();
  return (
    <div className="flex h-full min-h-screen flex-col p-4">
      <Logo light className="mb-6 h-7 self-start" />
      {me.memberships.length > 1 ? (
        <select className="mb-4 rounded-md bg-sidebar-accent px-2 py-2 text-sm text-sidebar-accent-foreground"
          value={org?.orgId ?? ""} onChange={(e) => { localStorage.setItem("wm_org", e.target.value); onPick(e.target.value); }}>
          {me.memberships.map((m) => <option key={m.org_id} value={m.org_id}>{m.organizations?.name}</option>)}
        </select>
      ) : org ? <div className="mb-4 px-2 text-sm font-semibold text-sidebar-accent-foreground">{org.orgName}</div> : null}
      {org && <ModeBadge orgId={org.orgId} />}
      <nav className="space-y-1">
        {org && nav.map((n) => (
          <Link key={n.to} to={n.to}
            className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent",
              loc.pathname.startsWith(n.to) && "bg-sidebar-accent text-sidebar-accent-foreground")}>
            <n.icon className="size-4" />{n.label}
          </Link>
        ))}
        {org && (org.role === "group_admin" || org.isPlatformAdmin) && (
          <Link to="/team" className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent",
            loc.pathname === "/team" && "bg-sidebar-accent text-sidebar-accent-foreground")}>
            <UserCog className="size-4" />Team
          </Link>
        )}
        {org && (
          <a href={`/c/${org.orgSlug}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent">
            <Globe className="size-4" />Careers site
          </a>
        )}
        {me.isPlatformAdmin && (
          <Link to="/platform" className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent",
            loc.pathname === "/platform" && "bg-sidebar-accent text-sidebar-accent-foreground")}>
            <Shield className="size-4 text-lime" />WerkandMe Admin
          </Link>
        )}
      </nav>
      <div className="mt-auto border-t border-sidebar-border pt-4 text-xs">
        <div className="truncate px-2">{me.user.email}</div>
        <button onClick={() => supabase.auth.signOut()} className="mt-2 flex items-center gap-2 px-2 py-1 hover:text-sidebar-accent-foreground">
          <LogOut className="size-3.5" />Sign out
        </button>
      </div>
    </div>
  );
}
