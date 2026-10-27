import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, type Membership } from "@/lib/org";
import { TextingSettings } from "@/components/texting-settings";
import { TeamInvites } from "@/components/team-invites";
import { useServerFn } from "@tanstack/react-start";
import { teamCalendars } from "@/lib/member-calendars.functions";
import { CalendarLinkForm } from "@/components/calendar-link";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team | WerkandMe Hiring" }, { name: "description", content: "Manage WerkandMe team roles, coverage and group texting settings." }, { property: "og:title", content: "Team | WerkandMe Hiring" }, { property: "og:description", content: "Manage team roles, coverage and group texting settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Team,
});

const roles: { v: Membership["role"]; l: string }[] = [
  { v: "group_admin", l: "Group admin" },
  { v: "recruiter", l: "Recruiter / HR" },
  { v: "regional_leader", l: "Regional leader" },
  { v: "dealer_manager", l: "Dealer manager (GM)" },
  { v: "hiring_manager", l: "Hiring manager" },
];
const scoped = new Set(["regional_leader", "dealer_manager", "hiring_manager"]);

function Team() {
  const org = useOrg();
  const qc = useQueryClient();
  const isAdmin = org.role === "group_admin" || org.isPlatformAdmin;
  const { data } = useQuery({
    queryKey: ["team", org.orgId],
    enabled: isAdmin,
    queryFn: async () => {
      const [m, s, r, d] = await Promise.all([
        supabase.from("org_members").select("*").eq("org_id", org.orgId).order("created_at"),
        supabase.from("org_member_scopes").select("*").eq("org_id", org.orgId),
        supabase.from("regions").select("id, name").eq("org_id", org.orgId).order("name"),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId).order("name"),
      ]);
      return { members: m.data ?? [], scopes: s.data ?? [], regions: r.data ?? [], stores: d.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["team", org.orgId] });
  const getCalendars = useServerFn(teamCalendars);
  const { data: calendars } = useQuery({
    queryKey: ["team-calendars", org.orgId],
    enabled: isAdmin,
    queryFn: () => getCalendars({ data: { orgId: org.orgId } }),
  });

  if (!isAdmin) return <p>Only group admins can manage the team.</p>;

  async function setRole(id: string, role: Membership["role"]) {
    const { error } = await supabase.from("org_members").update({ role }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    refresh();
  }
  async function addScope(memberId: string, value: string) {
    if (!value) return;
    const [kind, id = ""] = value.split(":");
    const { error } = await supabase.from("org_member_scopes").insert({
      org_id: org.orgId, member_id: memberId,
      region_id: kind === "r" ? id : null, dealership_id: kind === "s" ? id : null,
    });
    if (error) return toast.error(error.message);
    refresh();
  }
  async function removeMember(id: string, who: string) {
    if (!window.confirm(`Remove ${who} from this group? They'll lose access right away.`)) return;
    const { error } = await supabase.from("org_members").delete().eq("id", id);
    if (error) return toast.error(error.message.includes("at least one group admin") ? "A group must keep at least one group admin." : error.message);
    toast.success(`${who} removed`);
    refresh();
  }
  async function removeScope(id: string) {
    const { error } = await supabase.from("org_member_scopes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Team</h1>
        <p className="text-muted-foreground">Invite people, set their role, and choose the stores or regions they cover. Managers only see applicants for their stores.</p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-background shadow-sm">
        {data?.members.map((m) => {
          const mine = data.scopes.filter((s) => s.member_id === m.id);
          return (
            <div key={m.id} className="space-y-3 border-b p-4 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-semibold">{m.email ?? "Team member"}</div>
                <button onClick={() => removeMember(m.id, m.email ?? "this person")} className="ml-auto text-xs text-muted-foreground hover:text-destructive sm:order-last">Remove</button>
                <select aria-label={`Role for ${m.email}`} className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={m.role} onChange={(e) => setRole(m.id, e.target.value as Membership["role"])}>
                  {roles.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </div>
              {scoped.has(m.role) ? (
                <div className="flex flex-wrap items-center gap-2">
                  {mine.length === 0 && <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm text-destructive" title="Managers should only see their own stores">Sees the whole group: add a store or region</span>}
                  {mine.map((s) => {
                    const label = s.region_id
                      ? `${data.regions.find((r) => r.id === s.region_id)?.name ?? "Region"} region`
                      : data.stores.find((d) => d.id === s.dealership_id)?.name ?? "Store";
                    return (
                      <span key={s.id} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
                        {label}
                        <button aria-label={`Remove ${label}`} onClick={() => removeScope(s.id)} className="text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
                      </span>
                    );
                  })}
                  <select aria-label={`Add coverage for ${m.email}`} className="h-8 rounded-md border bg-background px-2 text-xs"
                    value="" onChange={(e) => addScope(m.id, e.target.value)}>
                    <option value="">+ Add region or store</option>
                    {data.regions.length > 0 && <optgroup label="Regions">{data.regions.map((r) => <option key={r.id} value={`r:${r.id}`}>{r.name}</option>)}</optgroup>}
                    <optgroup label="Stores">{data.stores.map((d) => <option key={d.id} value={`s:${d.id}`}>{d.name}</option>)}</optgroup>
                  </select>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Sees every store in the group</div>
              )}
              <CalendarLinkForm
                compact
                orgId={org.orgId}
                memberId={m.id}
                status={calendars?.[m.id] ?? { linked: false }}
                onChanged={() => qc.invalidateQueries({ queryKey: ["team-calendars", org.orgId] })}
              />
            </div>
          );
        })}
      </div>
      {data && <TeamInvites orgId={org.orgId} stores={data.stores} regions={data.regions} />}
      <TextingSettings orgId={org.orgId} />
    </div>
  );
}
