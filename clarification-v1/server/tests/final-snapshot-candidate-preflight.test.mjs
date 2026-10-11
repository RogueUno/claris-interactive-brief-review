import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderFinalBrief} from '../final-brief-renderer.mjs';
import {inspectLiveFinalCandidate} from '../final-snapshot-candidate-preflight.mjs';

const artifact=JSON.parse(readFileSync(new URL('./fixtures/fictional-soc2-advisory-final.json',import.meta.url),'utf8'));
const historical=JSON.parse(readFileSync(new URL('./fixtures/oct10-finalize-live-actual.json',import.meta.url),'utf8'));
const id='source_candidate_fixture_20261011';
const booking='We need SOC 2 readiness for a customer procurement milestone.';
const audit=JSON.stringify({audit_status:'PASS',repair_required:false,violations:[]});

function fixture({answer='SOC 2 Readiness'}={}) {
 return {
  schema_version:'claris_clarification_envelope_v1',opportunity_id:id,
  package:{status:'SUBMITTED',opportunity_id:id,consultant:{consultant_id:'consultant_fixture'},questions:[
    {question_id:'q_service',mode:'DISCOVER',required:true,prompt:'Which service?',
      response_type:'SINGLE_CHOICE',options:[{option_id:'soc2',label:'SOC 2 Readiness'}]}
  ]},
  response:{schema_version:'claris_prospect_response_v1',
    opportunity_id:id,source_class:'PROSPECT_REPORTED',
    submitted_at:'2026-10-10T00:00:00.000Z',answers:[
      {question_id:'q_service',mode:'DISCOVER',source_class:'PROSPECT_REPORTED',
        answer_kind:'OPTION',selected_option_id:'soc2',value:answer}
    ]},
  finalize_context:{schema_version:'claris_finalize_context_v1',
    consultant_id:'consultant_fixture',consultant_delivery_email:'owner@example.org',
    consultant_sot_json:JSON.stringify({services:[{service_id:'SVC_SOC2'}]}),
    case_state_json:JSON.stringify({booking_text_exact:booking,
      canonical_truth_json:JSON.stringify({
        booking_evidence:[{evidence_id:'BOOK-001',authority:'BOOKING_TEXT',
          resolvable:true,statement:booking,exact_basis:booking}],
        canonical_evidence_registry:[]
      })
    })}
 };
}
function dependencies(envelope=fixture()) {
 const calls=[];
 const repository={
  async loadEnvelopeWithMeta(opportunityId) {
   calls.push('read');
   assert.equal(opportunityId,id);
   return {envelope:structuredClone(envelope),etag:'etag-test'};
  },
  async saveEnvelopeWithMeta(){calls.push('WRITE');throw Error('NO_WRITES_ALLOWED');}
 };
 const consultantRepository={
   async loadIdentity(){throw Error('ownerVerifier fixture only');},
   async loadProfileEnvelopeWithMeta(){throw Error('ownerVerifier fixture only');}
 };
 const ownerVerifier=async context=>({
   consultant_id:context.consultant_id,
   consultant_delivery_email:context.consultant_delivery_email
 });
 return {repository,consultantRepository,ownerVerifier,calls};
}
function candidate(a=artifact) {
 return {opportunity_id:id,status:'FINALIZED',final_stage:'FINALIZE',
   final_stage_output_json:JSON.stringify(a),
   final_brief_markdown:renderFinalBrief(a).brief_markdown,
   final_audit_json:audit};
}

test('genuine FINALIZE-shaped candidate can be structurally reviewed with zero writes',async()=>{
 const env=dependencies();
 const result=await inspectLiveFinalCandidate(candidate(),env);
 assert.equal(result.status,'CANDIDATE_CONTRACT_PASSED');
 assert.equal(result.http_status,200);
 assert.equal(result.preview_only,true);
 assert.equal(result.write_performed,false);
 assert.equal(result.delivery_authorized,false);
 assert.equal(result.audit_assurance,'ADMIN_SUPPLIED_PASS_NOT_INDEPENDENTLY_REEXECUTED');
 assert.equal(result.semantic_assurance,'NOT_CERTIFIED');
 assert.equal(result.write_eligibility,'NOT_DETERMINED_REQUIRES_SEPARATE_EXPLICIT_PILOT');
 assert.match(result.artifact_sha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(env.calls,['read','read']);
 const text=JSON.stringify(result);
 for(const secret of [booking,'owner@example.org','SOC 2 Readiness','etag-test'])
   assert.equal(text.includes(secret),false);
});

test('unrelated accepted answer is not called semantically verified',async()=>{
 const env=dependencies(fixture({answer:'Unrelated service'}));
 const result=await inspectLiveFinalCandidate(candidate(),env);
 assert.equal(result.status,'CANDIDATE_CONTRACT_PASSED');
 assert.equal(result.semantic_assurance,'NOT_CERTIFIED');
 // This is intentionally structural only; a semantic certification gate is
 // required before any live release or delivery.
 assert.equal(result.delivery_authorized,false);
});

test('missing accepted answer fails source preflight even with valid candidate',async()=>{
 const e=fixture();e.response.answers=[];
 const env=dependencies(e);
 const result=await inspectLiveFinalCandidate(candidate(),env);
 assert.equal(result.status,'SOURCE_PREFLIGHT_NOT_PASSED');
 assert.equal(result.source_status,'PROSPECT_BINDING_UNVERIFIED');
 assert.deepEqual(env.calls,['read']);
});

test('invalid audit, wrong markdown and unresolved source fail closed',async()=>{
 const inputs=[
   {...candidate(),final_audit_json:'{"audit_status":"FAIL"}'},
   {...candidate(),final_brief_markdown:'fabricated consultant output'},
   (()=>{const a=structuredClone(artifact);a.claris_final_brief.intelligence_lineage.push({source_id:'PROS-999',usage:'unrelated'});return candidate(a)})()
 ];
 for(const input of inputs){
  const env=dependencies();
  const result=await inspectLiveFinalCandidate(input,env);
  assert.equal(result.status,'CANDIDATE_CONTRACT_BLOCKED');
  assert.equal(result.delivery_authorized,false);
  assert.deepEqual(env.calls,['read','read']);
 }
});

test('existing snapshot, reserved delivery and malformed opportunity block',async()=>{
 const e=fixture();e.final_intelligence={invalid:true};
 let env=dependencies(e);
 const result=await inspectLiveFinalCandidate(candidate(),env);
 assert.equal(result.status,'SOURCE_PREFLIGHT_NOT_PASSED');
 assert.equal(result.source_status,'SNAPSHOT_INVALID');
 assert.deepEqual(env.calls,['read']);
 const r=fixture();r.final_delivery_receipt={status:'RESERVED'};
 env=dependencies(r);
 assert.equal((await inspectLiveFinalCandidate(candidate(),env)).source_status,'DELIVERY_ALREADY_RESERVED');
 assert.deepEqual(env.calls,['read']);
 env=dependencies();
 assert.equal((await inspectLiveFinalCandidate({...candidate(),opportunity_id:'../bad'},env)).http_status,400);
 assert.deepEqual(env.calls,[]);
});

test('historic synthetic FINALIZE may be analyzed without enabling any external action',async()=>{
 const env=dependencies();
 const result=await inspectLiveFinalCandidate(candidate(historical),env);
 assert.equal(result.preview_only,true);
 assert.equal(result.write_performed,false);
 assert.equal(result.delivery_authorized,false);
 assert.equal(result.semantic_assurance,'NOT_CERTIFIED');
 // This synthetic test envelope is not the actual persisted opportunity.
 assert.equal(result.status,'CANDIDATE_CONTRACT_PASSED');
});

test('storage failures are redacted and cannot cause a write or secret disclosure',async()=>{
 const env=dependencies();
 env.repository.loadEnvelopeWithMeta=async()=>{throw Error('private-storage-secret');};
 const result=await inspectLiveFinalCandidate(candidate(),env);
 assert.equal(result.status,'SOURCE_PREFLIGHT_NOT_PASSED');
 assert.equal(result.error,'PREFLIGHT_ENVELOPE_READ_FAILED');
 assert.equal(JSON.stringify(result).includes('private-storage-secret'),false);
});
