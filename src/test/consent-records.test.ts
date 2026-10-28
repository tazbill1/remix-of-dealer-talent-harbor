import {describe,it,expect} from 'vitest';
import {withdrawalPatch,consentState} from '@/lib/consent-records';
describe('consent withdrawals',()=>{
 it('changes only the withdrawal time and source',()=>expect(withdrawalPatch({granted:true,revoked_at:null},'2026-10-28T04:33:00Z')).toEqual({revoked_at:'2026-10-28T04:33:00Z',revoked_source:'staff_entry'}));
 it('cannot overwrite an existing withdrawal',()=>expect(()=>withdrawalPatch({granted:true,revoked_at:'2026-10-27T00:00:00Z'},'2026-10-28T00:00:00Z')).toThrow('already been withdrawn'));
 it('cannot withdraw a declined choice',()=>expect(()=>withdrawalPatch({granted:false,revoked_at:null},'2026-10-28T00:00:00Z')).toThrow('Declined'));
 it('keeps original granted true while displaying withdrawn',()=>expect(consentState({granted:true,revoked_at:'2026-10-28T00:00:00Z'})).toBe('Withdrawn'));
});
