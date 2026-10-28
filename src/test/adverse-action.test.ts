import {describe,it,expect} from 'vitest';
import {noticeProblem,waitingLabel} from '@/lib/adverse-action';
const row={status:'waiting_period',pre_notice_sent_at:'2026-10-20T12:00:00Z',waiting_period_ends_at:'2026-10-27T12:00:00Z',final_notice_sent_at:null,report_copy_provided:false};
const now=Date.parse('2026-10-28T12:00:00Z');
describe('adverse-action tracking',()=>{
 it('blocks a final notice before the waiting period ends',()=>expect(noticeProblem({...row,final_notice_sent_at:'2026-10-26T12:00:00Z',report_copy_provided:true},now)).toBe('Final notice must be after the waiting period ends.'));
 it('requires report-copy confirmation with final notice',()=>expect(noticeProblem({...row,final_notice_sent_at:'2026-10-28T12:00:00Z'},now)).toContain('report copy'));
 it('accepts final notice at the end of the waiting period',()=>expect(noticeProblem({...row,final_notice_sent_at:'2026-10-27T12:00:00Z',report_copy_provided:true},now)).toBeNull());
 it('does not allow future notice dates',()=>expect(noticeProblem({...row,pre_notice_sent_at:'2026-10-29T12:00:00Z'},now)).toContain('future'));
 it('shows completed waiting period',()=>expect(waitingLabel(row,now)).toBe('Waiting period complete'));
 it('blocks report provision dated after final notice',()=>expect(noticeProblem({...row,report_copy_provided:true,report_copy_provided_at:'2026-10-28T12:00:00Z',final_notice_sent_at:'2026-10-27T12:00:00Z'},now)).toBe('Report copy must be provided by the final notice time.'));
});
