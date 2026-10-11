import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectProspectClaimConsistency} from '../prospect-claim-consistency.mjs';

const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'));
const oct09=fixture('oct09-finalize-actual.json');
const oct10=fixture('oct10-finalize-live-actual.json');
const question='Which advisory service are you interested in exploring?';

function envelope(label='SOC 2 Readiness',prompt=question) {
 return {
  opportunity_id:'semantics_test_20261011',
  package:{status:'SUBMITTED',questions:[{
    question_id:'q_service',mode:'DISCOVER',required:true,prompt,
    options:[{option_id:'chosen',label}]
  }]},
  response:{schema_version:'claris_prospect_response_v1',
    opportunity_id:'semantics_test_20261011',
    source_class:'PROSPECT_REPORTED',
    submitted_at:'2026-10-10T21:00:00Z',
    answers:[{question_id:'q_service',mode:'DISCOVER',
      source_class:'PROSPECT_REPORTED',answer_kind:'OPTION',
      selected_option_id:'chosen',value:label}]
  }
 };
}

test('Oct10 claim aligns narrowly with a meaningful recorded SOC2 selection',()=>{
 const result=inspectProspectClaimConsistency(oct10,envelope());
 assert.equal(result.status,'NARROW_LABEL_ALIGNMENT_ONLY');
 assert.equal(result.source_claim_count,1);
 assert.equal(result.aligned_count,1);
 assert.equal(result.conflict_count,0);
 assert.equal(result.scope_assurance,'NOT_EVALUATED');
 assert.equal(result.semantic_assurance,'NOT_CERTIFIED');
 assert.deepEqual(result.checks,[{
   source_id:'PROS-001',outcome:'LABEL_ALIGNED_REVIEW_REQUIRED',
   reason:'SELECTED_OPTION_AND_PROMPT_COMPATIBLE'
 }]);
 assert.equal(JSON.stringify(result).includes(question),false);
 assert.equal(JSON.stringify(result).includes('SOC 2 Readiness'),false);
});

test('Oct09 claim citation is compared to same persisted accepted answer',()=>{
 const result=inspectProspectClaimConsistency(oct09,envelope());
 assert.equal(result.status,'NARROW_LABEL_ALIGNMENT_ONLY');
 assert.equal(result.aligned_count,1);
});

test('mismatched selected ISO27001 label cannot validate SOC2 claim',()=>{
 const result=inspectProspectClaimConsistency(oct10,envelope('ISO 27001 preparation'));
 assert.equal(result.status,'PROSPECT_CLAIM_CONFLICT_DETECTED');
 assert.equal(result.conflict_count,1);
 assert.equal(result.checks[0].reason,'ACCEPTED_SERVICE_LABEL_MISMATCH');
});

test('a form asking what services the customer already owns cannot prove interest',()=>{
 const result=inspectProspectClaimConsistency(oct10,envelope('SOC 2 Readiness',
   'Which service does the prospect already own?'));
 assert.equal(result.status,'MANUAL_REVIEW_REQUIRED');
 assert.equal(result.checks[0].reason,'FORM_PROMPT_DOES_NOT_ESTABLISH_INTEREST');
});

test('a non-validated option label cannot pass source check',()=>{
 const e=envelope();
 e.response.answers[0].value='SOC 2 readiness, definitely buying';
 const result=inspectProspectClaimConsistency(oct10,e);
 assert.equal(result.status,'MANUAL_REVIEW_REQUIRED');
 assert.equal(result.checks[0].reason,'NO_VERIFIED_SELECTED_OPTION_LABEL');
});

test('text answers and ambiguous answers do not imply verified selected interest',()=>{
 const e=envelope();
 e.response.answers[0].answer_kind='TEXT';
 e.response.answers[0].selected_option_id=null;
 const result=inspectProspectClaimConsistency(oct10,e);
 assert.equal(result.status,'MANUAL_REVIEW_REQUIRED');
 const empty=inspectProspectClaimConsistency(oct10,envelope('Other advisory'));
 assert.equal(empty.status,'MANUAL_REVIEW_REQUIRED');
});

test('unsupported manifest is rejected rather than inventing a source',()=>{
 const e=envelope();
 e.response.answers[0].question_id='forged';
 const result=inspectProspectClaimConsistency(oct10,e);
 assert.equal(result.status,'PROSPECT_MANIFEST_UNVERIFIED');
 assert.equal(result.source_claim_count,0);
});

test('no prospect claims does not certify overall semantics',()=>{
 const data=structuredClone(oct10);
 data.intelligence_lineage=data.intelligence_lineage.filter(item=>item.evidence_id==='BOOK-001');
 const result=inspectProspectClaimConsistency(data,envelope());
 assert.equal(result.status,'NO_PROSPECT_CLAIMS');
 assert.equal(result.semantic_assurance,'NOT_CERTIFIED');
});

test('synthetic rehearsal scope statements remain outside this narrow review',()=>{
 const result=inspectProspectClaimConsistency(oct10,envelope());
 assert.equal(result.scope_assurance,'NOT_EVALUATED');
 assert.equal(result.semantic_assurance,'NOT_CERTIFIED');
 assert.equal(result.note.includes('does not validate additional AI claims'),true);
});
