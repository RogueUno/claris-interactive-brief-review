import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovalConsume} from '../../../calibration-v3/server/recovery-approval-consumption.mjs';
const clock=Date.parse('2026-10-08T14:00:00Z');
const path='claris/recovery-operator-approvals/opportunity_test_01.json';
const approved={approval_id:'approval_test',evidence_sha256:'a'.repeat(64),
 make_execution_id:'b'.repeat(32),receipt_etag:'etag-outbox'};
const record={...approved,status:'APPROVED',used:false,one_use:true,
 expires_at:'2026-10-08T14:05:00Z'};
function setup(data=record){
 let state={...data},version=1,writes=0;
 const storage={
  async getJsonWithMeta(){return {value:{...state},etag:'v'+version}},
  async putJson(_,value,{ifMatch}){
   await Promise.resolve();
   if(ifMatch!=='v'+version)throw Error('BLOB_PRECONDITION_FAILED');
   state={...value};version++;writes++;
  }
 };
 return {consume:createApprovalConsume({storage,now:()=>clock}),
  state:()=>state,writes:()=>writes};
}
test('single approval only wins once even under simultaneous callers',async()=>{
 const x=setup();const results=await Promise.all(Array.from({length:12},()=>x.consume(path,approved)));
 assert.equal(results.filter(Boolean).length,1);
 assert.equal(x.writes(),1);
 assert.equal(x.state().status,'CONSUMED');
 assert.equal(await x.consume(path,approved),false);
});
test('mismatched, expired or previously consumed approvals deny',async()=>{
 for(const change of [{used:true},{status:'CONSUMED'},
  {expires_at:'2026-10-08T13:59:00Z'},{evidence_sha256:'c'.repeat(64)},
  {receipt_etag:'wrong'},{one_use:false}]){
  assert.equal(await setup({...record,...change}).consume(path,approved),false);
 }
 assert.equal(await setup().consume('unsafe/path',approved),false);
});
