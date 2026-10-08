import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoredRecoveryApprovalReader,recoveryApprovalPath}
  from '../../../calibration-v3/server/recovery-operator-approval.mjs';
const now=Date.parse('2026-10-08T15:00:00Z'),id='qa_recovery_approval_01';
const input={opportunity_id:id,consultant_id:'consultant_qa',
  evidence_sha256:'a'.repeat(64),make_execution_id:'b'.repeat(32),receipt_etag:'etag-1'};
const valid={schema_version:'claris_recovery_operator_approval_v1',
 status:'APPROVED',...input,one_use:true,used:false,
 approval_id:'approval_12345678',approver_id:'operator_12345678',
 approved_at:'2026-10-08T14:55:00Z',expires_at:'2026-10-08T15:05:00Z'};
const reader=(record=valid,etag='private-etag')=>createStoredRecoveryApprovalReader({
  storage:{async getJsonWithMeta(path){
    assert.equal(path,recoveryApprovalPath(id));
    return {value:record,etag};
  }},now:()=>now});
test('privately stored one-use approval binds exact evidence and execution',async()=>{
 const a=await reader()(input);
 assert.equal(a.status,'APPROVED');
 assert.equal(a.make_execution_id,input.make_execution_id);
 assert.equal(a.used,false);
});
test('missing, changed or expired approval is never accepted',async()=>{
 for(const patch of [
  {status:'PENDING'},{used:true},{one_use:false},
  {evidence_sha256:'c'.repeat(64)},{receipt_etag:'wrong'},
  {make_execution_id:'d'.repeat(32)},{consultant_id:'wrong'},
  {expires_at:'2026-10-08T14:59:00Z'},
  {expires_at:'2026-10-08T15:30:00Z'}
 ]){
  assert.equal(await reader({...valid,...patch})(input),null,JSON.stringify(patch));
 }
 assert.equal(await reader(null)(input),null);
 assert.equal(await reader(valid,null)(input),null);
});
