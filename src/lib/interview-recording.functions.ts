import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { recordingConsentText } from './interview-recording';
export const recordingSettings = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({orgId:z.string().uuid()})).handler(async({data,context})=>{
 const {data:row,error}=await context.supabase.from('messaging_settings').select('interview_recording_enabled,recording_retention_days').eq('org_id',data.orgId).maybeSingle();if(error)throw error;
 return {enabled:row?.interview_recording_enabled??false,days:row?.recording_retention_days??90};
});
export const saveRecordingSettings = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({orgId:z.string().uuid(),enabled:z.boolean(),days:z.union([z.literal(30),z.literal(60),z.literal(90),z.literal(180)])})).handler(async({data,context})=>{
 const {data:allowed}=await context.supabase.rpc('can_post_jobs',{_org:data.orgId,_uid:context.userId});if(!allowed)throw new Error('Only group admins and HR can change recording settings.');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {error}=await supabaseAdmin.from('messaging_settings').upsert({org_id:data.orgId,interview_recording_enabled:data.enabled,recording_retention_days:data.days});if(error)throw error;return {ok:true};
});
export const saveRecordingConsent = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({interviewId:z.string().uuid(),granted:z.boolean(),days:z.number()})).handler(async({data,context})=>{
 const {authorizeInterview}=await import('./interview-recording.server');const {db,interview,app,settings}=await authorizeInterview(context.supabase,context.userId,data.interviewId);
 if(!settings.interview_recording_enabled)throw new Error('Interview recording is off.');
 if(data.days!==settings.recording_retention_days)throw new Error('Recording settings changed. Please read the updated consent script.');
 const {getRequest}=await import('@tanstack/react-start/server');const request=getRequest();
 const {data:consent,error}=await db.from('applicant_consents').insert({org_id:interview.org_id,store_id:app.dealership_id,applicant_id:app.id,consent_type:'recording',granted:data.granted,consent_text:recordingConsentText(settings.recording_retention_days),source:'staff_entry',created_by:context.userId,user_agent:request.headers.get('user-agent')}).select('id').single();if(error)throw error;return {id:consent.id};
});
export const prepareRecordingUpload = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({interviewId:z.string().uuid(),consentId:z.string().uuid(),format:z.enum(['in_person','phone','video']),method:z.enum(['microphone','tab_audio','upload']),duration:z.number().positive(),recordingId:z.string().uuid().optional()})).handler(async({data,context})=>{
 const {authorizeInterview}=await import('./interview-recording.server');const {db,interview,app,settings}=await authorizeInterview(context.supabase,context.userId,data.interviewId);
 const {data:consent}=await db.from('applicant_consents').select('*').eq('id',data.consentId).eq('applicant_id',app.id).eq('created_by',context.userId).single();
 if(!settings.interview_recording_enabled||!consent?.granted||consent.revoked_at||consent.consent_type!=='recording')throw new Error('Recording requires candidate consent.');
 let id=data.recordingId;
 if(id){const {data:r}=await db.from('interview_recordings').select('id,status').eq('id',id).eq('interview_id',interview.id).eq('consent_id',consent.id).eq('created_by',context.userId).single();if(!r||r.status!=='uploading')throw new Error('Upload is not available.');}
 else {const {data:r,error}=await db.from('interview_recordings').insert({org_id:interview.org_id,store_id:app.dealership_id,applicant_id:app.id,interview_id:interview.id,consent_id:consent.id,format:data.format,capture_method:data.method,duration:data.duration,created_by:context.userId,retention_days:settings.recording_retention_days,audio_delete_after:new Date(Date.now()+settings.recording_retention_days*86400000).toISOString()}).select('id').single();if(error)throw error;id=r.id;}
 const path=`${interview.org_id}/${interview.id}/${id}.wav`;
 const {error:patchError}=await db.from('interview_recordings').update({storage_path:path}).eq('id',id);if(patchError)throw patchError;
 const {data:url,error}=await db.storage.from('interview-recordings').createSignedUploadUrl(path,{upsert:true});if(error)throw error;return {id,path,token:url.token};
});
export const finishRecordingUpload = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid()})).handler(async({data,context})=>{
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');const {data:r}=await db.from('interview_recordings').select('*').eq('id',data.id).eq('created_by',context.userId).single();if(!r)throw new Error('Recording not found.');
 const {authorizeInterview}=await import('./interview-recording.server');await authorizeInterview(context.supabase,context.userId,r.interview_id);
 if(r.status!=='uploading'||!r.storage_path)throw new Error('Recording upload already completed.');
 const {data:audio,error}=await db.storage.from('interview-recordings').download(r.storage_path);if(error||!audio||audio.size<=44)throw new Error('Audio upload was not found.');
 const header=new DataView(await audio.slice(0,44).arrayBuffer());if(header.getUint32(0,false)!==0x52494646||header.getUint32(8,false)!==0x57415645)throw new Error('Only audio WAV files may be saved.');
 const {error:update}=await db.from('interview_recordings').update({status:'uploaded'}).eq('id',r.id).eq('status','uploading');if(update)throw update;return {ok:true};
});
export const recordingAudioUrl = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid()})).handler(async({data,context})=>{
 const {data:r}=await context.supabase.from('interview_recordings').select('storage_path').eq('id',data.id).single();if(!r?.storage_path)return null;
 const {data:url,error}=await context.supabase.storage.from('interview-recordings').createSignedUrl(r.storage_path,300);if(error)throw error;return url.signedUrl;
});
