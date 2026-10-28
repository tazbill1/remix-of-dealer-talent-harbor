import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import {withdrawalPatch} from './consent-records';
export const listConsentRecords=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({orgId:z.string().uuid()})).handler(async({data,context})=>{
 const {data:allowed,error:accessError}=await context.supabase.rpc('can_post_jobs',{_org:data.orgId,_uid:context.userId});if(accessError||!allowed)throw new Error('Only HR and group admins can review consent records.');
 const {data:rows,error}=await context.supabase.from('applicant_consents').select('*, applications(full_name,email), dealerships(name)').eq('org_id',data.orgId).order('granted_at',{ascending:false});if(error)throw error;return rows??[];
});
export const withdrawConsent=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({orgId:z.string().uuid(),consentId:z.string().uuid()})).handler(async({data,context})=>{
 const {data:allowed,error:accessError}=await context.supabase.rpc('can_post_jobs',{_org:data.orgId,_uid:context.userId});if(accessError||!allowed)throw new Error('Only HR and group admins can record withdrawals.');
 const {data:row,error:readError}=await context.supabase.from('applicant_consents').select('granted,revoked_at').eq('org_id',data.orgId).eq('id',data.consentId).maybeSingle();if(readError||!row)throw new Error('Consent record could not be found.');
 const patch=withdrawalPatch(row,new Date().toISOString());
 const {data:saved,error}=await context.supabase.from('applicant_consents').update(patch).eq('org_id',data.orgId).eq('id',data.consentId).eq('granted',true).is('revoked_at',null).select('id,revoked_at,revoked_source').maybeSingle();if(error||!saved)throw new Error('Withdrawal was not saved. Refresh and try again.');return saved;
});
