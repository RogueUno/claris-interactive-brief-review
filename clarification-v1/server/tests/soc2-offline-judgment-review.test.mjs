import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewOfflineSoc2ConsultantJudgment} from '../soc2-offline-judgment-review.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/fictional-soc2-advisory-final.json',import.meta.url),'utf8'));
const BOOKING='We want SOC 2 readiness guidance before an enterprise customer security assessment. Please help us define assessment scope, existing evidence priorities, and an appropriate first step. The required date and available budget have not been established.';
const EVIDENCE=[
 {question_id:'q_service',prompt:'Which advisory service are you interested in exploring?',answer_kind:'OPTION',selected_option_id:'soc2',value:'SOC 2 Readiness'},
 {question_id:'q_timing',prompt:'What timing is currently confirmed for the request?',answer_kind:'OPTION',selected_option_id:'unspecified',value:'Customer assessment planned; date not confirmed'},
 {question_id:'q_budget',prompt:'What is the status of a potential advisory budget?',answer_kind:'UNSURE',selected_option_id:null,value:'Not sure yet'}
];
function envelope(booking=BOOKING){
 return {
  schema_version:'claris_clarification_envelope_v1',
  opportunity_id:'soc2_review_test_20261012',
  package:{status:'SUBMITTED',
   questions:EVIDENCE.map(e=>({
    question_id:e.question_id,prompt:e.prompt,mode:'DISCOVER',required:true,
    options:e.answer_kind==='OPTION'?[{option_id:e.selected_option_id,label:e.value}]:[]
   }))
  },
  response:{
   schema_version:'claris_prospect_response_v1',
   opportunity_id:'soc2_review_test_20261012',
   source_class:'PROSPECT_REPORTED',
   submitted_at:'2026-10-12T09:00:02.000Z',
   answers:EVIDENCE.map(e=>({
    ...e,mode:'DISCOVER',source_class:'PROSPECT_REPORTED'
   }))
  },
  finalize_context:{
   schema_version:'claris_finalize_context_v1',
   case_state_json:JSON.stringify({
    booking_text_exact:booking,
    canonical_truth_json:JSON.stringify({booking_evidence:[{
     evidence_id:'BOOK-001',authority:'BOOKING_TEXT',
     statement:booking,exact_basis:booking,resolvable:true
    }]})
   })
  }
 };
}
const codes=review=>review.checks.map(x=>x.code);
const clone=()=>structuredClone(fixture);

test('quality review finds concrete gaps in the existing SOC2 fixture rather than approving it on structural depth',()=>{
 const review=reviewOfflineSoc2ConsultantJudgment(clone(),{envelope:envelope()});
 assert.equal(review.status,'MANUAL_COMMERCIAL_REVIEW_REQUIRED');
 assert.equal(review.booking_assurance,'INTERNAL_CANONICAL_AGREEMENT_ONLY');
 assert.deepEqual(review.supported_evidence_ids,['PROS-001','PROS-002','PROS-003']);
 assert.equal(review.open_commercial_unknowns.budget,'UNCONFIRMED');
 assert.equal(review.open_commercial_unknowns.timing,'UNCONFIRMED');
 assert.equal(review.open_commercial_unknowns.authority,'NOT_ESTABLISHED');
 assert.equal(review.question_count,5);
 for(const code of [
  'SOC2_DELIVERABLE_DISAMBIGUATION_NOT_ASKED',
  'REHEARSAL_LANGUAGE_LEAKS_INTO_COMMERCIAL_BRIEF',
  'NUMERIC_METRICS_METHODOLOGY_NOT_INDEPENDENTLY_AUDITED',
  'QUALIFICATION_LABEL_REQUIRES_ECONOMIC_CAVEAT'
 ])assert.ok(codes(review).includes(code),code);
 assert.equal(review.semantic_assurance,'NOT_CERTIFIED');
 assert.equal(review.factual_assurance,'NOT_INDEPENDENTLY_VERIFIED');
 assert.equal(review.write_authorized,false);
 assert.equal(review.delivery_authorized,false);
 assert.equal(JSON.stringify(review).includes('morgan@'),false);
 assert.equal(JSON.stringify(review).includes(BOOKING),false);
});

test('adding an explicit questionnaire versus SOC2 Type I/II question fixes only that gap, not certification',()=>{
 const candidate=clone();
 candidate.claris_final_brief.discovery_question_plan[0].question=
  'Does the enterprise require a security questionnaire, a SOC 2 Type I or II report, or another assurance deliverable, and by what date?';
 const review=reviewOfflineSoc2ConsultantJudgment(candidate,{envelope:envelope()});
 assert.equal(codes(review).includes('SOC2_DELIVERABLE_DISAMBIGUATION_NOT_ASKED'),false);
 assert.equal(review.status,'MANUAL_COMMERCIAL_REVIEW_REQUIRED');
 assert.equal(review.semantic_assurance,'NOT_CERTIFIED');
});

test('approved budget, confirmed date, verified buyer and alleged control failures cannot be promoted over unknowns',()=>{
 const candidate=clone();
 candidate.claris_final_brief.match_score_explanation.overall_assessment='The deadline is confirmed.';
 candidate.claris_final_brief.strategic_guidance.rationale='The budget is approved. The decision maker is confirmed. We identified major control gaps.';
 const review=reviewOfflineSoc2ConsultantJudgment(candidate,{envelope:envelope()});
 for(const code of [
  'BUDGET_ASSERTED_AGAINST_UNKNOWN_ANSWER',
  'DEADLINE_ASSERTED_AGAINST_UNCONFIRMED_ANSWER',
  'DECISION_AUTHORITY_ASSERTED_WITHOUT_ACCEPTED_BASIS',
  'CONTROL_FAILURE_ASSESSED_WITHOUT_VERIFIED_FINDING'
 ])assert.ok(codes(review).includes(code),code);
 assert.equal(review.checks.filter(x=>x.severity==='critical').length,4);
});

test('open qualification questions and explicit uncertainty do not become confirmed negative findings',()=>{
 const candidate=clone();
 candidate.claris_final_brief.strategic_guidance.rationale=
  'Budget has not been confirmed; a potential control gap is a hypothesis, not a finding.';
 candidate.claris_final_brief.match_score_explanation.overall_assessment=
  'The deadline is not confirmed. We need to ask if a decision maker is identified.';
 const review=reviewOfflineSoc2ConsultantJudgment(candidate,{envelope:envelope()});
 for(const code of [
  'BUDGET_ASSERTED_AGAINST_UNKNOWN_ANSWER',
  'DEADLINE_ASSERTED_AGAINST_UNCONFIRMED_ANSWER',
  'DECISION_AUTHORITY_ASSERTED_WITHOUT_ACCEPTED_BASIS',
  'CONTROL_FAILURE_ASSESSED_WITHOUT_VERIFIED_FINDING'
 ])assert.equal(codes(review).includes(code),false,code);
});

test('accepted SOC2 selection cannot support lineage falsely claiming ISO 27001',()=>{
 const candidate=clone();
 candidate.claris_final_brief.intelligence_lineage.push({
  source_id:'PROS-001',authority:'PROSPECT_REPORTED',
  usage:'The prospect expressed interest in ISO 27001.'
 });
 const review=reviewOfflineSoc2ConsultantJudgment(candidate,{envelope:envelope()});
 assert.equal(review.prospect_service_claim_check,'PROSPECT_CLAIM_CONFLICT_DETECTED');
 assert.ok(codes(review).includes('ACCEPTED_SERVICE_LABEL_CONFLICT'));
 const issue=review.checks.find(x=>x.code==='ACCEPTED_SERVICE_LABEL_CONFLICT');
 assert.deepEqual(issue.evidence_refs,['PROS-001']);
});

test('missing or inconsistent persisted inputs fail closed and other services are out of scope',()=>{
 const unbound=reviewOfflineSoc2ConsultantJudgment(clone());
 assert.equal(unbound.status,'SOURCE_BINDING_REQUIRED');
 assert.equal(unbound.review_required,true);
 const bad=envelope();
 bad.response.answers[0].value='';
 assert.equal(reviewOfflineSoc2ConsultantJudgment(clone(),{envelope:bad}).status,'SOURCE_BINDING_REQUIRED');
 const other=reviewOfflineSoc2ConsultantJudgment(clone(),{envelope:envelope('We want ISO 27001 readiness help.')});
 assert.equal(other.status,'NOT_EVALUATED_OUTSIDE_SCOPE');
 assert.equal(other.write_authorized,false);
});
