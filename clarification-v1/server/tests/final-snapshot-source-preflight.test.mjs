import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPersistedFinalSources } from '../final-snapshot-source-preflight.mjs';

const ID='claris_mvp_test_20261009_one';
const booking='Synthetic CLARIS MVP rehearsal. The company is Tailead; test research and call preparation only. Do not contact the prospect.';
const email='owner@example.org';
const owner='consultant_fixture';
function validEnvelope() {
 return {
   schema_version:'claris_clarification_envelope_v1',
   opportunity_id:ID,
   package:{status:'SUBMITTED',opportunity_id:ID,consultant:{consultant_id:owner},questions:[
     {question_id:'service_interest',prompt:'Which service?',mode:'DISCOVER',
      required:true,response_type:'SINGLE_CHOICE'}
   ]},
   response:{schema_version:'claris_prospect_response_v1',opportunity_id:ID,
     source_class:'PROSPECT_REPORTED',submitted_at:'2026-10-09T19:20:00.000Z',
     answers:[{question_id:'service_interest',mode:'DISCOVER',
       source_class:'PROSPECT_REPORTED',answer_kind:'OPTION',
       selected_option_id:'soc2',value:'SOC 2 Readiness'}]},
   finalize_context:{schema_version:'claris_finalize_context_v1',
     consultant_id:owner,consultant_delivery_email:email,
     consultant_sot_json:JSON.stringify({services:[]}),
     case_state_json:JSON.stringify({
       booking_text_exact:booking,
       canonical_truth_json:JSON.stringify({booking_evidence:[
         {evidence_id:'BOOK-001',authority:'BOOKING_TEXT',resolvable:true,
          statement:booking,exact_basis:booking}
       ]})
     })}
 };
}
function mock(env=validEnvelope()) {
 const log=[];
 const repository={
   async loadEnvelopeWithMeta(id){log.push(['load',id]);return {envelope:structuredClone(env),etag:'etag-stored'};},
   async saveEnvelopeWithMeta(){log.push(['WRITE']);throw Error('DO_NOT_WRITE');}
 };
 const consultantRepository={
   async loadIdentity(){log.push(['owner-identity']);return {};},
   async loadProfileEnvelopeWithMeta(){log.push(['owner-profile']);return {};}
 };
 const ownerVerifier=async context=>{
   log.push(['owner-check']);
   return {consultant_id:context.consultant_id,
     consultant_delivery_email:context.consultant_delivery_email};
 };
 return {log,repository,consultantRepository,ownerVerifier};
}
test('read-only source preflight reports actual accepted answer IDs, not answer text',async()=>{
 const db=mock();
 const r=await inspectPersistedFinalSources(ID,db);
 assert.equal(r.ok,true);
 assert.equal(r.status,'SOURCE_PREFLIGHT_PASSED');
 assert.equal(r.snapshot_state,'NOT_PERSISTED');
 assert.equal(r.artifact_certification,'NOT_EVALUATED_NO_PERSISTED_ARTIFACT');
 assert.equal(r.accepted_answer_count,1);
 assert.deepEqual(r.accepted_source_ids,['PROS-001']);
 assert.equal(r.owner_status,'CURRENT_LOCKED_OWNER_VERIFIED');
 assert.equal(r.delivery_authorized,false);
 assert.equal(r.write_performed,false);
 assert.deepEqual(db.log,[['load',ID],['owner-check']]);
 for(const text of [booking,'SOC 2 Readiness',email,owner,'etag-stored']) {
   assert.equal(JSON.stringify(r).includes(text),false);
 }
});
test('invalid ID, missing or pending opportunity cannot be read as eligible',async()=>{
 let reads=0;
 const deps=mock();
 deps.repository.loadEnvelopeWithMeta=async()=>{reads++;return {envelope:null,etag:null};};
 assert.equal((await inspectPersistedFinalSources('../bad',deps)).http_status,400);
 assert.equal(reads,0);
 assert.equal((await inspectPersistedFinalSources(ID,deps)).status,'NOT_FOUND');
 const pending=validEnvelope();pending.package.status='OPEN';pending.response=null;
 assert.equal((await inspectPersistedFinalSources(ID,mock(pending))).status,'SUBMISSION_NOT_ESTABLISHED');
});
test('missing ETag and damaged booking canonical mapping fail closed',async()=>{
 const db=mock();
 db.repository.loadEnvelopeWithMeta=async()=>({envelope:validEnvelope(),etag:null});
 assert.equal((await inspectPersistedFinalSources(ID,db)).error,'ATOMIC_OPPORTUNITY_VERSION_REQUIRED');
 const e=validEnvelope();const state=JSON.parse(e.finalize_context.case_state_json);
 state.canonical_truth_json=JSON.stringify({booking_evidence:[]});
 e.finalize_context.case_state_json=JSON.stringify(state);
 assert.equal((await inspectPersistedFinalSources(ID,mock(e))).status,'BOOKING_CONTEXT_UNVERIFIED');
});
test('no accepted answer or mismatched provenance blocks manifest derivation',async()=>{
 const env=validEnvelope();env.response.answers=[];
 assert.equal((await inspectPersistedFinalSources(ID,mock(env))).status,'PROSPECT_BINDING_UNVERIFIED');
 const e=validEnvelope();e.response.answers[0].source_class='AI_INFERRED';
 assert.equal((await inspectPersistedFinalSources(ID,mock(e))).status,'PROSPECT_BINDING_UNVERIFIED');
});
test('consultant mismatch or failed locked owner verifier never passes preflight',async()=>{
 const env=validEnvelope();const deps=mock(env);
 deps.ownerVerifier=async()=>{throw Error('private locked profile');};
 const failed=await inspectPersistedFinalSources(ID,deps);
 assert.equal(failed.status,'OWNER_UNVERIFIED');
 assert.doesNotMatch(JSON.stringify(failed),/private locked profile/);
 const mismatch=mock(env);
 mismatch.ownerVerifier=async()=>({consultant_id:'different',consultant_delivery_email:email});
 assert.equal((await inspectPersistedFinalSources(ID,mismatch)).status,'OWNER_UNVERIFIED');
});
test('receipt reservation never authorizes or mutates delivery',async()=>{
 const e=validEnvelope();e.final_delivery_receipt={status:'RESERVED'};
 const deps=mock(e);
 const r=await inspectPersistedFinalSources(ID,deps);
 assert.equal(r.status,'DELIVERY_ALREADY_RESERVED');
 assert.equal(r.http_status,409);
 assert.equal(deps.log.some(x=>x[0]==='WRITE'),false);
});
test('malformed final snapshot is not treated as absent',async()=>{
 const e=validEnvelope();e.final_intelligence={status:'FINALIZED'};
 const deps=mock(e);const r=await inspectPersistedFinalSources(ID,deps);
 assert.equal(r.status,'SNAPSHOT_INVALID');
 assert.equal(deps.log.some(x=>x[0]==='WRITE'),false);
});
test('read errors are redacted without leaking private storage details',async()=>{
 const deps=mock();
 deps.repository.loadEnvelopeWithMeta=async()=>{throw Error('storage-secret');};
 const r=await inspectPersistedFinalSources(ID,deps);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.error,'PREFLIGHT_ENVELOPE_READ_FAILED');
 assert.doesNotMatch(JSON.stringify(r),/storage-secret/);
});
