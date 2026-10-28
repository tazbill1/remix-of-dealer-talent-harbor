export const ACTION_LABELS: Record<string,string> = {pre_notice_pending:'Pre-notice pending',pre_notice_sent:'Waiting period',waiting_period:'Waiting period',final_notice_sent:'Final notice recorded',cancelled:'Cancelled'};
export type NoticeDates={status:string;pre_notice_sent_at:string|null;waiting_period_ends_at:string|null;final_notice_sent_at:string|null;report_copy_provided:boolean;report_copy_provided_at?:string|null};
export function noticeProblem(row:NoticeDates,now=Date.now()):string|null{
 const pre=row.pre_notice_sent_at?Date.parse(row.pre_notice_sent_at):null;
 const end=row.waiting_period_ends_at?Date.parse(row.waiting_period_ends_at):null;
 const final=row.final_notice_sent_at?Date.parse(row.final_notice_sent_at):null;
 if([pre,end,final].some(v=>v!==null&&!Number.isFinite(v)))return 'Enter valid dates.';
 if(pre!==null&&pre>now)return 'Pre-notice cannot be recorded in the future.';
 if(end!==null&&(pre===null||end<=pre))return 'Waiting period must end after the pre-notice.';
 if(final!==null){if(pre===null||end===null)return 'Record the pre-notice and waiting period first.';if(final<end)return 'Final notice must be after the waiting period ends.';if(final>now)return 'Final notice cannot be recorded in the future.';if(!row.report_copy_provided)return 'Confirm the report copy was provided before recording final notice.';}
 if(row.status==='final_notice_sent'&&final===null)return 'Record the final notice date.';
 if(row.report_copy_provided_at){const report=Date.parse(row.report_copy_provided_at);if(!Number.isFinite(report)||report>now)return 'Record a valid past report-copy time.';if(final!==null&&report>final)return 'Report copy must be provided by the final notice time.';}
 return null;
}
export function waitingLabel(row:NoticeDates,now=Date.now()){
 if(row.status==='cancelled')return 'Cancelled';if(row.final_notice_sent_at)return 'Final notice recorded';if(!row.pre_notice_sent_at)return 'Pre-notice pending';if(!row.waiting_period_ends_at)return 'Waiting date missing';const remaining=Date.parse(row.waiting_period_ends_at)-now;return remaining>0?`Waiting · ${Math.ceil(remaining/86400000)} calendar days left`:'Waiting period complete';
}
