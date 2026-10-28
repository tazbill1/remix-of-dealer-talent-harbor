import {createFileRoute} from '@tanstack/react-router';
import {authenticateCronRequest} from '@/integrations/supabase/cron-auth';
export const Route=createFileRoute('/api/public/cron/recording-cleanup')({server:{handlers:{POST:async({request})=>{const denied=await authenticateCronRequest(request);if(denied)return denied;const {cleanupRecordingAudio}=await import('@/lib/interview-recording.server');return Response.json(await cleanupRecordingAudio());}}}});
