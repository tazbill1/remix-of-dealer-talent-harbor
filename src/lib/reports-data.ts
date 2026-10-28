import { supabase } from "@/integrations/supabase/client";
import { fetchAll, chunk } from "./fetch-all";
import { assignedStores, type ReportData, type ReportApp, type ReportInterview, type ReportOffer, type ReportMessage } from "./reports";
import type { AStore, AJob, AEvent } from "./analytics";

/** Authenticated reads only. RLS remains authoritative; explicit assignment filters also deny unassigned managers. */
export async function fetchReportData(orgId: string): Promise<ReportData> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sign in to view reports.");
  const roles = await Promise.all([
    supabase.rpc("is_platform_admin", { _uid: user.id }),
    supabase.rpc("has_org_role", { _org: orgId, _uid: user.id, _role: "group_admin" }),
    supabase.rpc("has_org_role", { _org: orgId, _uid: user.id, _role: "recruiter" }),
  ]);
  for (const result of roles) if (result.error) throw result.error;
  const groupWide = roles.some(r => r.data === true);
  const [allStores, regions] = await Promise.all([
    fetchAll<AStore>((f,t) => supabase.from("dealerships").select("id,name,region_id").eq("org_id",orgId).order("id").range(f,t)),
    fetchAll<{id:string;name:string}>((f,t) => supabase.from("regions").select("id,name").eq("org_id",orgId).order("id").range(f,t)),
  ]);
  let scopes: {dealership_id:string|null;region_id:string|null}[] = [];
  if (!groupWide) {
    const {data: member, error} = await supabase.from("org_members").select("id").eq("org_id",orgId).eq("user_id",user.id).maybeSingle();
    if (error) throw error;
    if (member) scopes = await fetchAll((f,t) => supabase.from("org_member_scopes").select("dealership_id,region_id").eq("org_id",orgId).eq("member_id",member.id).order("id").range(f,t));
  }
  const stores = assignedStores(allStores, groupWide, scopes).sort((a,b) => a.name.localeCompare(b.name));
  const storeChunks = chunk(stores.map(s => s.id));
  const [apps, jobs] = await Promise.all([
    Promise.all(storeChunks.map(ids => fetchAll<ReportApp>((f,t) => supabase.from("applications").select("id,job_id,dealership_id,status,source,full_name,created_at,updated_at,hired_at,needs_attention").eq("org_id",orgId).in("dealership_id",ids).order("id").range(f,t)))).then(x=>x.flat()),
    Promise.all(storeChunks.map(ids => fetchAll<AJob>((f,t) => supabase.from("jobs").select("id,title,dealership_id,status,division,department,hiring_manager,created_at").eq("org_id",orgId).in("dealership_id",ids).order("id").range(f,t)))).then(x=>x.flat()),
  ]);
  const batches = chunk(apps.map(a=>a.id));
  const [events,messages,interviews,offers] = await Promise.all([
    Promise.all(batches.map(ids=>fetchAll<AEvent>((f,t)=>supabase.from("application_events").select("application_id,kind,message,created_at").eq("org_id",orgId).eq("kind","status").in("application_id",ids).order("id").range(f,t)))).then(x=>x.flat()),
    Promise.all(batches.map(ids=>fetchAll<ReportMessage>((f,t)=>supabase.from("messages").select("application_id,party,direction,created_at,sent_at,status,channel,provider").eq("org_id",orgId).in("application_id",ids).order("id").range(f,t)))).then(x=>x.flat()),
    Promise.all(batches.map(ids=>fetchAll<ReportInterview>((f,t)=>supabase.from("interviews").select("application_id,starts_at,status").eq("org_id",orgId).in("application_id",ids).order("id").range(f,t)))).then(x=>x.flat()),
    Promise.all(batches.map(ids=>fetchAll<ReportOffer>((f,t)=>supabase.from("offers").select("application_id,created_at,status,is_offer_letter,provider_document_id").eq("org_id",orgId).in("application_id",ids).order("id").range(f,t)))).then(x=>x.flat()),
  ]);
  const regionIds = new Set(stores.map(s=>s.region_id));
  return {apps,jobs,stores,regions:regions.filter(r=>regionIds.has(r.id)),events,messages,interviews,offers,groupWide};
}