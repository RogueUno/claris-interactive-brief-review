import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryAttestor,recoveryEvidencePath} from '../../../calibration-v3/server/recovery-attestation.mjs';

const id='opportunity_qa_20261008',consultant='consultant_qa',etag='immutable-etag-01';
const now=Date.parse('2026-10-08T14:00:00.000Z');
const h='a'.repeat(64);
const evidence={
 schema_version:'claris_recovery_attestation_v1',
 authority:'SERVER_VERIFIED_MAKE_EXECUTION',
 opportunity_id:id,consultant_id:consultant,receipt_etag:etag,
 make_execution_id:'make_execution_12345',make_scenario_id:'7824690',
 make_stage:'PREPARE',execution_status:'TERMINAL_FAILED',
 provider_http_status:503,provider_failure_class:'TRANSIENT',
 no_pending_execution:true,no_claim_or_send:true,
 outbox_status_at_attestation:'REGISTERED',
 operator_approved:true,one_use_approval:true,
 evidence_sha256:h,operator_approval_sha256:h,
 approval_status:'APPROVED',
 observed_at:'2026-10-08T12:00:00.000Z',
 approved_at:'2026-10-08T12:20:00.000Z',
 expires_at:'2026-10-08T15:00:00.000Z'
};
const query={opportunity_id:id,consultant_id:consultant,receipt_etag:etag,receipt:{status:'REGISTERED'}};
function fixture(record=evidence,withEtag=true){
 const storage={async getJsonWithMeta(path){
   assert.equal(path,recoveryEvidencePath(id));
   return {value:structuredClone(record),etag:withEtag?'evidence-etag':null};
 }};
 return createRecoveryAttestor({storage,now:()=>now});
}
test('missing private proof fails closed',async()=>{
 const result=await fixture(null)(query);
 assert.equal(result,null);
});
test('server-backed, bound, unexpired proof produces narrow authorization',async()=>{
 const result=await fixture()(query);
 assert.equal(result.authorized,true);
 assert.equal(result.receipt_etag,etag);
 assert.equal(result.no_pending_execution,true);
 assert.equal(result.no_claim_or_send,true);
 assert.equal('make_execution_id' in result,false);
});
test('untrusted or stale recovery evidence is refused',async()=>{
 const patches=[
  {authority:'MAKE_CALLER_ASSERTION'}, {receipt_etag:'different'},
  {opportunity_id:'different_id'}, {consultant_id:'different_consultant'},
  {make_execution_id:''},{make_scenario_id:''},
  {make_stage:'FINALIZE'}, {execution_status:'RUNNING'},
  {provider_http_status:429},{provider_failure_class:'UNKNOWN'},
  {no_pending_execution:false},{no_claim_or_send:false},
  {outbox_status_at_attestation:'RESERVED'},
  {operator_approved:false},{one_use_approval:false},
  {approval_status:'PENDING'}, {expires_at:'2026-10-08T13:00:00.000Z'},
  {observed_at:'2026-10-08T15:00:00.000Z'},
  {approved_at:'2026-10-08T15:00:00.000Z'},
  {evidence_sha256:'fake'}, {operator_approval_sha256:'fake'}
 ];
 for(const patch of patches){
   const result=await fixture({...evidence,...patch})(query);
   assert.equal(result,null,JSON.stringify(patch));
 }
 assert.equal(await fixture(evidence,false)(query),null);
});
test('untrusted receipt state and missing storage stay denied',async()=>{
 assert.equal(await fixture()({...query,receipt:{status:'RESERVED'}}),null);
 await assert.rejects(async()=>createRecoveryAttestor({storage:{}}),/RECOVERY_STORAGE_REQUIRED/);
});
