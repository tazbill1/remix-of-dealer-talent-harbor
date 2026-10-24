import { createContext, useContext } from "react";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Membership = {
  org_id: string;
  role: "group_admin" | "dealer_manager" | "hiring_manager" | "recruiter";
  organizations: { id: string; name: string; slug: string } | null;
};

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const [{ data: memberships }, { data: admin }] = await Promise.all([
      supabase.from("org_members").select("org_id, role, organizations(id, name, slug)").eq("user_id", user.id),
      supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);
    let list = (memberships ?? []) as Membership[];
    if (admin) {
      // WerkandMe Admin can step into any dealer group.
      const { data: orgs } = await supabase.from("organizations").select("id, name, slug").order("name");
      const have = new Set(list.map((m) => m.org_id));
      list = [...list, ...(orgs ?? []).filter((o) => !have.has(o.id))
        .map((o) => ({ org_id: o.id, role: "group_admin" as const, organizations: o }))];
    }
    return { user: { id: user.id, email: user.email ?? "" }, memberships: list, isPlatformAdmin: !!admin };
  },
});

export type OrgCtx = { orgId: string; orgName: string; orgSlug: string; role: Membership["role"] };
export const OrgContext = createContext<OrgCtx | null>(null);
export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("No dealer group selected");
  return ctx;
}
