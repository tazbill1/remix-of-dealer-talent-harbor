import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {noticeProblem} from './adverse-action';
const orgSchema=z.object({orgId:z.string().uuid()});
export const getAdverseActions=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(orgSchema).handler(async({data,context})=>{
 const {data:allowed,error}=await context.supabase.rpc('can_post_jobs',{_org:data.orgId,_uid:context.userId});if(error||!allowed)throw new Error('Only HR and group admins can manage notices.');
 const [records,applicants]=await Promise.all([context.supabase.from('adverse_actions').select('*, applications(full_name,email), dealerships(name)').eq('org_id',data.orgId).order('created_at',{ascending:false}),context.supabase.from('applications').select('id,full_name,email,dealership_id').eq('org_id',data.orgId).order('full_name')]);if(records.error||applicants.error)throw new Error('Notice records could not be loaded.');return {records:records.data??[],applicants:applicants.data??[]};
});
export const createAdverseAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(orgSchema.extend({applicantId:z.string().uuid(),reason:z.string().trim().min(1).max(4000)})).handler(async({data,context})=>{
 const {data:allowed,error}=await context.supabase.rpc('can_post_jobs',{_org:data.orgId,_uid:context.userId});if(error||!allowed)throw new Error('Only HR and group admins can manage notices.');
 const {data:app}=await context.supabase.from('applications').select('dealership_id').eq('id',data.applicantId).eq('org_id',data.orgId).maybeSingle();if(!app)throw new Error('Applicant not found.');
 const {data:saved,error:saveError}=await context.supabase.from('adverse_actions').insert({org_id:data.orgId,applicant_id:data.applicantId,store_id:app.dealership_id,created_by:context.userId,reason:data.reason}).select('*').single();if(saveError||!saved)throw new Error(saveError?.code==='23505'?'This applicant already has an open notice record.':'Notice record was not saved.');return saved;
});
export const saveAdverseAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(orgSchema.extend({id:z.string().uuid(),updatedAt:z.string(),reason:z.string().trim().min(1).max(4000),pre:z.string().datetime().nullable(),end:z.string().datetime().nullable(),final:z.string().datetime().nullable(),report:z.boolean(),cancel:z.boolean()})).handler(async({data,context})=>{
 const {data:allowed,error}=await context.supabase.rpc('can_post_jobs',{_org:data.orgId,_uid:context.userId});if(error||!allowed)throw new Error('Only HR and group admins can manage notices.');
 const {data:old}=await context.supabase.from('adverse_actions').select('*').eq('org_id',data.orgId).eq('id',data.id).maybeSingle();if(!old)throw new Error('Notice record not found.');if(old.status==='cancelled'||old.final_notice_sent_at)throw new Error('Closed notice records cannot be changed.');
 let end=data.end;
 // Reuse the database business-day calculation, including UTC weekday semantics.
 if(data.pre&&(!end||data.pre!==old.pre_notice_sent_at)){
  const {data:computed,error:dateError}=await context.supabase.rpc('five_business_days_after',{_start:data.pre});if(dateError||!computed)throw new Error('Waiting period could not be calculated.');end=computed;
 }
 const patch={reason:data.reason,pre_notice_sent_at:data.pre,waiting_period_ends_at:end,final_notice_sent_at:data.final,report_copy_provided:data.report,status:data.cancel?'cancelled':data.final?'final_notice_sent':data.pre?'waiting_period':'pre_notice_pending'};
 const problem=noticeProblem(patch);if(problem)throw new Error(problem);
 const {data:saved,error:saveError}=await context.supabase.from('adverse_actions').update(patch).eq('org_id',data.orgId).eq('id',data.id).eq('updated_at',data.updatedAt).select('*').maybeSingle();if(saveError||!saved)throw new Error('Notice was not saved. Refresh and try again.');return saved;
});
