import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { employeeSchema, previewEmployees, signupSchema } from "@/lib/referral-enrollment";

export const getReferralSignup = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin.from("dealerships").select("id, name, org_id").eq("referral_signup_token", data.token).maybeSingle();
    if (!s) return null;
    const [{ data: settings }, { data: org }] = await Promise.all([
      supabaseAdmin.from("referral_settings").select("self_signup_enabled").eq("org_id", s.org_id).maybeSingle(),
      supabaseAdmin.from("organizations").select("name,slug").eq("id", s.org_id).maybeSingle(),
    ]);
    return settings?.self_signup_enabled && org ? { store: s.name, group: org.name, slug: org.slug } : null;
  });

export const signupReferralEmployee = createServerFn({ method: "POST" })
  .inputValidator((d: z.input<typeof signupSchema>) => signupSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = getRequestHeader("cf-connecting-ip") ?? "unknown";
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${data.token}|${ip}`));
    const rateKey = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2,"0")).join("");
    const { data: result, error } = await supabaseAdmin.rpc("referral_employee_signup", { _token: data.token, _first: data.first, _last: data.last, _role: data.role, _email: data.email, _phone: data.phone, _rate_key: rateKey });
    if (error) throw new Error("Couldn't create your link. Check your details or ask HR whether signup is still open.");
    const parsed = z.object({ code: z.string(), existing: z.boolean(), active: z.boolean(), orgSlug: z.string() }).safeParse(result);
    if (!parsed.success) throw new Error("Too many signup attempts. Please try again later.");
    return parsed.data;
  });

export const previewReferralCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; csv: string }) => z.object({ orgId: z.string().uuid(), csv: z.string().max(2_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("can_manage_referrals", { _org: data.orgId, _uid: context.userId });
    if (!allowed) throw new Error("Only HR and admins can upload employees.");
    const { data: stores, error } = await context.supabase.from("dealerships").select("id,name").eq("org_id", data.orgId);
    if (error) throw new Error("Could not load stores.");
    const existing: {employee_name:string;store_id:string|null;email:string|null;phone:string|null}[] = [];
    for (let offset=0; ; offset+=1000) {
      const page = await context.supabase.from("referrers").select("employee_name,store_id,email,phone").eq("org_id",data.orgId).order("id").range(offset,offset+999);
      if (page.error) throw new Error("Could not check existing employees.");
      existing.push(...page.data);
      if (page.data.length<1000) break;
    }
    return previewEmployees(data.csv, stores ?? [], existing);
  });

export const importReferralCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; rows: z.input<typeof employeeSchema>[] }) => z.object({ orgId: z.string().uuid(), rows: z.array(employeeSchema).max(250) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("import_referral_employees", { _org: data.orgId, _rows: data.rows });
    if (error) throw new Error("Couldn't import this batch. Please try again; existing employees will be skipped.");
    return z.object({ inserted: z.number(), skipped: z.number(), failed: z.number(), rows: z.array(z.object({ row: z.number(), status: z.string(), error: z.string().optional() })) }).parse(result);
  });