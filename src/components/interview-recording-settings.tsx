import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Mic} from 'lucide-react';
import {toast} from 'sonner';
import {IntegrationCard} from './integration-card';
import {Switch} from './ui/switch';
import {recordingSettings,saveRecordingSettings} from '@/lib/interview-recording.functions';
export function InterviewRecordingSettings({orgId,canEdit}:{orgId:string;canEdit:boolean}){
 const get=useServerFn(recordingSettings),save=useServerFn(saveRecordingSettings),qc=useQueryClient();const key=['recording-settings',orgId];
 const {data,isPending}=useQuery({queryKey:key,queryFn:()=>get({data:{orgId}})});
 async function update(enabled:boolean,days:number){try{await save({data:{orgId,enabled,days:days as 30|60|90|180}});await qc.invalidateQueries({queryKey:key});}catch(e){toast.error(e instanceof Error?e.message:'Settings could not be saved.');}}
 return <IntegrationCard icon={Mic} title="Interview recording" state="connected" what="Audio only. Candidates must agree before recording. AI suggests scores; your interviewer decides."><fieldset disabled={!canEdit||isPending} className="mt-4 space-y-4 border-t pt-4"><label className="flex items-center justify-between gap-4 text-sm">Record and transcribe interviews<Switch aria-label="Record and transcribe interviews" checked={data?.enabled??false} onCheckedChange={v=>void update(v,data?.days??90)}/></label><label className="flex items-center justify-between gap-4 text-sm">Delete audio after<select aria-label="Delete audio after" className="rounded-md border bg-background p-2" value={data?.days??90} onChange={e=>void update(data?.enabled??false,Number(e.target.value))}>{[30,60,90,180].map(d=><option key={d} value={d}>{d} days</option>)}</select></label></fieldset></IntegrationCard>;
}
