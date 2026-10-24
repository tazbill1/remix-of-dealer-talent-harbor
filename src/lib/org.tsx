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
    return {
      user: { id: user.id, email: user.email ?? "" },
      memberships: (memberships ?? []) as Membership[],
      isPlatformAdmin: !!admin,
    };
  },
});

export type OrgCtx = { orgId: string; orgName: string; orgSlug: string; role: Membership["role"] };
export const OrgContext = createContext<OrgCtx | null>(null);
export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("No dealer group selected");
  return ctx;
}
