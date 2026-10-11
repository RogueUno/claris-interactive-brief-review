import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveAcceptedProspectManifest} from '../accepted-prospect-evidence.mjs';
import {persistGovernedFinalSnapshot,verifyFinalSnapshot} from '../final-snapshot-persistence.mjs';
import {renderFinalBrief} from '../final-brief-renderer.mjs';

const liveOct10=JSON.parse(readFileSync(new URL('./fixtures/oct10-finalize-live-actual.json',import.meta.url),'utf8'));
const liveOct09=JSON.parse(readFileSync(new URL('./fixtures/oct09-finalize-actual.json',import.meta.url),'utf8'));
const id='prospect_provenance_replay_20261011';
const booking='Synthetic CLARIS MVP rehearsal. The company is Tailead; test research and call preparation only. Do not contact the prospect.';
const audit=JSON.stringify({audit_status:'PASS',repair_required:false,violations:[]});
const soc2='SOC 2 Readiness';

function fakeAcceptedEnvelope({answers=[],questions=[]}={}) {
  return {
    schema_version:'claris_clarification_envelope_v1',
    opportunity_id:id,
    package:{status:'SUBMITTED',questions},
    response:{schema_version:'claris_prospect_response_v1',opportunity_id:id,
      source_class:'PROSPECT_REPORTED',submitted_at:'2026-10-10T00:00:00.000Z',answers},
    finalize_context:{
      schema_version:'claris_finalize_context_v1',
      consultant_sot_json:JSON.stringify({services:[]}),
      case_state_json:JSON.stringify({
        booking_text_exact:booking,
        canonical_truth_json:JSON.stringify({
          booking_evidence:[{authority:'BOOKING_TEXT',evidence_id:'BOOK-001',
            statement:booking,exact_basis:booking,resolvable:true}],
          canonical_evidence_registry:[]
        })
      })
    }
  };
}
function acceptedSoc2() {
  return fakeAcceptedEnvelope({
    questions:[{question_id:'q_service',mode:'DISCOVER',response_type:'SINGLE_CHOICE',
      required:true,prompt:'Which advisory service are you interested in?',
      options:[{option_id:'soc2',label:soc2}]}],
    answers:[{question_id:'q_service',mode:'DISCOVER',source_class:'PROSPECT_REPORTED',
      answer_kind:'OPTION',selected_option_id:'soc2',value:soc2}]
  });
}
function repo(initial) {
  let envelope=structuredClone(initial), writes=0;
  return {
    read:()=>structuredClone(envelope), writes:()=>writes,
    repository:{
      async loadEnvelopeWithMeta(){return {envelope:structuredClone(envelope),etag:'etag-old'};},
      async saveEnvelopeWithMeta(_,updated,{ifMatch}){
        assert.equal(ifMatch,'etag-old'); writes++; envelope=structuredClone(updated);
        return {etag:'etag-new',envelope};
      }
    }
  };
}
function payload(artifact=liveOct10) {
  return {opportunity_id:id,status:'FINALIZED',final_stage:'FINALIZE',
    expected_opportunity_version:'etag-old',
    final_stage_output_json:JSON.stringify(artifact),
    final_brief_markdown:renderFinalBrief(artifact).brief_markdown,
    final_audit_json:audit};
}

test('accepted source ordinals refer to stored answers, not displayed optional question indices',()=>{
  const e=acceptedSoc2();
  e.package.questions.unshift({question_id:'q_optional',mode:'DISCOVER',required:false,prompt:'Optional context'});
  const manifest=deriveAcceptedProspectManifest(e);
  assert.equal(manifest.ok,true);
  assert.equal(manifest.entries.length,1);
  assert.equal(manifest.entries[0].evidence_id,'PROS-001');
  assert.equal(manifest.entries[0].question_id,'q_service');
  assert.equal(manifest.entries[0].value,soc2);
  assert.match(manifest.binding_sha256,/^[a-f0-9]{64}$/);
});
test('response order cannot be silently changed to redirect PROS references',()=>{
  const e=acceptedSoc2();
  e.package.questions.push({question_id:'q_budget',mode:'DISCOVER',required:true,prompt:'Budget?'});
  e.response.answers.push({question_id:'q_budget',mode:'DISCOVER',
    source_class:'PROSPECT_REPORTED',answer_kind:'TEXT',selected_option_id:null,value:'Unknown'});
  assert.equal(deriveAcceptedProspectManifest(e).ok,true);
  e.response.answers.reverse();
  assert.equal(deriveAcceptedProspectManifest(e).error,'ACCEPTED_PROSPECT_ANSWER_INVALID');
});
test('fake IDs, duplicates, missing required answers and unsupported response provenance fail closed',()=>{
  const base=acceptedSoc2();
  const cases=[
    e=>{e.response.answers[0].source_evidence_id='PROS-999';},
    e=>{e.response.source_class='PUBLIC_WEB';},
    e=>{e.response.answers[0].question_id='not_in_form';},
    e=>{e.response.answers.push(e.response.answers[0]);},
    e=>{e.response.answers=[];},
    e=>{e.response.answers[0].source_class='AI_INFERRED';},
    e=>{e.response.answers[0].value='';}
  ];
  for (const mutation of cases) {
    const e=structuredClone(base);mutation(e);
    assert.equal(deriveAcceptedProspectManifest(e).ok,false);
  }
});
test('historical Oct10 real AI output remains unbound when no accepted response exists',async()=>{
  // Historical FINALIZE payload is genuine; the envelope is a synthetic test
  // double, NOT a recovered or certified historical submission.
  const db=repo(fakeAcceptedEnvelope());
  const r=await persistGovernedFinalSnapshot(payload(liveOct10),{repository:db.repository});
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.error,'FINALIZE_PROVENANCE_UNRESOLVED');
  assert.equal(db.writes(),0);
});
test('the same Oct10 artifact is persistable only with explicit accepted answer backing PROS-001',async()=>{
  // This demonstrates contract behavior, NOT proof the old rehearsal had
  // such a persisted response. The real snapshot writer stays disabled.
  const db=repo(acceptedSoc2());
  const r=await persistGovernedFinalSnapshot(payload(liveOct10),{repository:db.repository});
  assert.equal(r.status,'STORED');
  assert.equal(db.writes(),1);
  const saved=db.read();
  assert.equal(verifyFinalSnapshot(saved.final_intelligence,id,{envelope:saved,bookingText:booking}).ok,true);
  saved.response.answers[0].value='A different accepted response';
  assert.equal(verifyFinalSnapshot(saved.final_intelligence,id,{envelope:saved,bookingText:booking}).error,
    'FINAL_SNAPSHOT_PROSPECT_BINDING_INVALID');
});
test('historical Oct09 claim-to-evidence edges cannot bypass the accepted answer contract',async()=>{
  const db=repo(fakeAcceptedEnvelope());
  const r=await persistGovernedFinalSnapshot(payload(liveOct09),{repository:db.repository});
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.error,'FINALIZE_PROVENANCE_UNRESOLVED');
  assert.equal(db.writes(),0);
});
test('unresolved fit basis references are blocked even if all lineage IDs are present',async()=>{
  const bad=structuredClone(liveOct10);
  bad.match_score_explanation.service_need_alignment.basis_ids=['PROS-999'];
  const db=repo(acceptedSoc2());
  const r=await persistGovernedFinalSnapshot(payload(bad),{repository:db.repository});
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.error,'FINALIZE_MATCH_BASIS_UNRESOLVED');
  assert.equal(db.writes(),0);
});
