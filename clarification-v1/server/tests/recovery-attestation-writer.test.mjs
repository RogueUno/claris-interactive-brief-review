import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryAttestationWriter} from '../../../calibration-v3/server/recovery-attestation-writer.mjs';
import {createRecoveryAttestor} from '../../../calibration-v3/server/recovery-attestation.mjs';
const id='opportunity_qa_20261008',who='consultant_qa',scenarioId=7824690,runId='a'.repeat(32);
const clock=Date.parse('2026-10-08T14:00:00Z');
const rec={status:'REGISTERED',opportunity_id:id,consultant_id:who,recovery_count:0,
  claim_hash:null,provider_message_id:null,reserved_at:null,sent_at:null};
const execution={id:runId,scenario_id:scenarioId,status:'error',failure_stage:'PREPARE',
  provider_http_status:503,provider_failure_class:'TRANSIENT',finished:true,
  pending_operations:0,send_attempted:false,claim_attempted:false,
  finished_at:'2026-10-08T13:00:00Z'};
const scenario={id:scenarioId,status:'inactive',isWaitingOnIncompleteExecutions:false,incompleteExecutions:0};
const request={opportunity_id:id,consultant_id:who,receipt_etag:'etag-1',
  make_execution_id:runId,make_scenario_id:scenarioId};
function fixture({record=rec,run=execution,sc=scenario,approvalPatch={},failWrite=false}={}) {
 const writes=new Map();
 const storage={
   async getJsonWithMeta(path){
     if(path.startsWith('claris/direct-final-outbox/')) return {value:structuredClone(record),etag:'etag-1'};
     return {value:writes.get(path)||null,etag:writes.has(path)?'private-etag':null};
   },
   async putJsonIfAbsent(path,value) {
     if(failWrite||writes.has(path))throw Error('CREATE_UNCERTAIN');
     writes.set(path,structuredClone(value));
   }
 };
 const inspectExecution=async()=>structuredClone(run);
 const inspectScenario=async()=>structuredClone(sc);
 const readOperatorApproval=async q=>({
   status:'APPROVED',opportunity_id:id,consultant_id:who,
   evidence_sha256:q.evidence_sha256,receipt_etag:'etag-1',
   make_execution_id:runId,one_use:true,used:false,
   approval_id:'approval-123',approver_id:'operator-456',
   approved_at:'2026-10-08T13:50:00Z',expires_at:'2026-10-08T14:05:00Z',
   ...approvalPatch
 });
 const writer=createRecoveryAttestationWriter({storage,inspectExecution,inspectScenario,
   readOperatorApproval,consumeOperatorApproval:async()=>true,now:()=>clock});
 return {writer,writes,storage};
}
test('independently inspected terminal-503 plus approval creates immutable bound proof',async()=>{
 const f=fixture(); const first=await f.writer(request);
 assert.equal(first.status,'ATTESTATION_CREATED');
 const attestor=createRecoveryAttestor({storage:f.storage,now:()=>clock});
 const proof=await attestor({opportunity_id:id,consultant_id:who,
   receipt:rec,receipt_etag:'etag-1'});
 assert.equal(proof.authorized,true);
 assert.equal(proof.operator_approved,true);
 const duplicate=await f.writer(request);
 assert.equal(duplicate.ok,false);
 assert.equal(duplicate.error,'RECOVERY_WRITER_CREATE_UNCERTAIN');
 assert.equal(f.writes.size,1);
});
test('independent inspector must prove terminal 503 and no delivery attempt',async()=>{
 for(const patch of [
  {status:'running'},{provider_http_status:429},{finished:false},
  {pending_operations:1},{send_attempted:true},{claim_attempted:true},
  {failure_stage:'FINALIZE'}
 ]){
   const f=fixture({run:{...execution,...patch}});
   const result=await f.writer(request);
   assert.equal(result.error,'RECOVERY_WRITER_NOT_PROVEN',JSON.stringify(patch));
   assert.equal(f.writes.size,0);
 }
});
test('operator approval is evidence-bound, short-lived and unused',async()=>{
 for(const patch of [
  {status:'PENDING'},{evidence_sha256:'f'.repeat(64)},
  {one_use:false},{used:true},{receipt_etag:'wrong'},
  {expires_at:'2026-10-08T13:59:59Z'},
  {expires_at:'2026-10-08T16:00:00Z'}
 ]){
   const f=fixture({approvalPatch:patch});const result=await f.writer(request);
   assert.equal(result.error,'RECOVERY_WRITER_APPROVAL_DENIED',JSON.stringify(patch));
 }
});
test('race, changed owner, active or incomplete scenario are fail-closed',async()=>{
 for(const patch of [
  {status:'RESERVED'},{recovery_count:1},{claim_hash:'x'},{sent_at:'2026-10-08T13:00:00Z'}
 ]){
   const f=fixture({record:{...rec,...patch}});
   assert.equal((await f.writer(request)).error,'RECOVERY_WRITER_NOT_PROVEN');
 }
 for(const patch of [{status:'active'},{incompleteExecutions:1},{isWaitingOnIncompleteExecutions:true}]){
   const f=fixture({sc:{...scenario,...patch}});
   assert.equal((await f.writer(request)).error,'RECOVERY_WRITER_NOT_PROVEN');
 }
 assert.equal((await fixture({failWrite:true}).writer(request)).error,'RECOVERY_WRITER_CREATE_UNCERTAIN');
});
