import { beforeEach,describe,it,expect,vi } from "vitest";
const mock=vi.hoisted(()=>({allowed:true,role:"group_admin",assigned:true,rpc:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>{const builder={middleware:()=>builder,inputValidator:()=>builder,handler:(fn:unknown)=>fn};return builder;}}));
vi.mock("@/integrations/supabase/auth-middleware",()=>({requireSupabaseAuth:{}}));
vi.mock("@tanstack/react-start/server",()=>({getRequestHeader:()=>"127.0.0.1"}));
import {importReferralCsv,previewReferralCsv} from "@/lib/referral-enrollment.functions";
function context(){return{userId:"user",supabase:{rpc:mock.rpc,from:()=>({select:()=>({eq:()=>({data:[],error:null})})})}};}
beforeEach(()=>{mock.rpc.mockReset();mock.rpc.mockImplementation(async(name:string)=>name==="can_manage_referrals"?{data:mock.allowed,error:null}:mock.allowed?{data:{inserted:1,skipped:0,failed:0,rows:[{row:1,status:"added"}]},error:null}:{data:null,error:{message:"denied"}});});
describe("HR-only referral CSV boundaries",()=>{
 it.each(["group_admin","recruiter","platform_admin"])("permits %s imports",async()=>{mock.allowed=true;const result=await (importReferralCsv as unknown as (x:unknown)=>Promise<{inserted:number}>)({data:{orgId:"org",rows:[]},context:context()});expect(result.inserted).toBe(1);});
 it.each(["dealer_manager","hiring_manager","regional_leader"])("rejects %s CSV preview",async()=>{mock.allowed=false;await expect((previewReferralCsv as unknown as (x:unknown)=>Promise<unknown>)({data:{orgId:"org",csv:""},context:context()})).rejects.toThrow("Only HR");});
 it("fails closed when the database rejects import",async()=>{mock.allowed=false;await expect((importReferralCsv as unknown as (x:unknown)=>Promise<unknown>)({data:{orgId:"other-org",rows:[]},context:context()})).rejects.toThrow("Couldn't import");});
});