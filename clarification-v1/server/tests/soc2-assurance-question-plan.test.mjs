import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proposeSoc2AssuranceFirstCallPlan } from '../soc2-assurance-question-plan.mjs';
import { asksSoc2AssuranceDeliverable,reviewOfflineSoc2ConsultantJudgment } from '../soc2-offline-judgment-review.mjs';

const base=JSON.parse(readFileSync(new URL('./fixtures/fictional-soc2-advisory-final.json',import.meta.url),'utf8'));
const BOOKING='We want SOC 2 readiness guidance before an enterprise customer security assessment. Please help us define assessment scope, existing evidence priorities, and an appropriate first step. The required date and available budget have not been established.';
const answers=[
 {question_id:'q_service',prompt:'Which advisory service are you interested in exploring?',answer_kind:'OPTION',selected_option_id:'soc2',value:'SOC 2 Readiness'},
 {question_id:'q_timing',prompt:'What timing is currently confirmed for the request?',answer_kind:'OPTION',selected_option_id:'unspecified',value:'Customer assessment planned; date not confirmed'},
 {question_id:'q_budget',prompt:'What is the status of a potential advisory budget?',answer_kind:'UNSURE',selected_option_id:null,value:'Not sure yet'}
];
const clone=()=>structuredClone(base);
function makeEnvelope(text=BOOKING){
 return {
  schema_version:'claris_clarification_envelope_v1',
  opportunity_id:'soc2_assurance_plan_test',
  package:{
   status:'SUBMITTED',
   questions:answers.map(a=>({question_id:a.question_id,prompt:a.prompt,mode:'DISCOVER',required:true,
    options:a.answer_kind==='OPTION'?[{option_id:a.selected_option_id,label:a.value}]:[]}))
  },
  response:{
   schema_version:'claris_prospect_response_v1',source_class:'PROSPECT_REPORTED',
   opportunity_id:'soc2_assurance_plan_test',
   submitted_at:'2026-10-12T09:00:00.000Z',
   answers:answers.map(a=>({...a,mode:'DISCOVER',source_class:'PROSPECT_REPORTED'}))
  },
  finalize_context:{
   schema_version:'claris_finalize_context_v1',
   case_state_json:JSON.stringify({
    booking_text_exact:text,
    canonical_truth_json:JSON.stringify({booking_evidence:[{
     evidence_id:'BOOK-001',authority:'BOOKING_TEXT',statement:text,exact_basis:text,resolvable:true
    }]})
   })
  }
 };
}

test('five occupied slots: recommend one assurance-first replacement while retaining all original topical coverage',()=>{
 const artifact=clone(), untouched=structuredClone(artifact), envelope=makeEnvelope();
 const r=proposeSoc2AssuranceFirstCallPlan(artifact,{envelope});
 assert.equal(r.status,'QUESTION_PLAN_PROPOSAL_FOR_CONSULTANT_REVIEW');
 assert.equal(r.original_selected_count,5);
 assert.equal(r.proposed_count,5);
 assert.equal(r.proposed_questions[0].origin,'DETERMINISTIC_OFFLINE_SUGGESTION');
 assert.ok(asksSoc2AssuranceDeliverable(r.proposed_questions[0].question));
 assert.equal(r.replaced_question.original_index,1);
 assert.equal(r.replacement_reason,'FULL_FIVE_QUESTION_PLAN_ASSURANCE_GAP');
 assert.deepEqual(r.dropped_topics,[]);
 assert.deepEqual(r.covered_topics_after,r.covered_topics_before);
 assert.deepEqual(r.proposed_questions[0].basis_ids,['BOOK-001','PROS-001']);
 assert.equal(r.prospect_service_source_id,'PROS-001');
 assert.equal(r.booking_assurance,'INTERNAL_CANONICAL_AGREEMENT_ONLY');
 assert.equal(r.auto_applied,false);
 assert.equal(r.delivery_authorized,false);
 assert.equal(r.write_authorized,false);
 assert.equal(r.semantic_assurance,'NOT_CERTIFIED');
 assert.deepEqual(artifact,untouched);
 assert.equal(JSON.stringify(r).includes(BOOKING),false);
 assert.equal(JSON.stringify(r).includes('Not sure yet'),false);
});

test('suggested deliverable question clears the narrow critique but does not certify whole brief',()=>{
 const artifact=clone();
 const r=proposeSoc2AssuranceFirstCallPlan(artifact,{envelope:makeEnvelope()});
 const copy=clone();
 copy.claris_final_brief.discovery_question_plan=r.proposed_questions.map(q=>({question:q.question,intent:q.intent}));
 const verdict=reviewOfflineSoc2ConsultantJudgment(copy,{envelope:makeEnvelope()});
 assert.equal(verdict.checks.some(x=>x.code==='SOC2_DELIVERABLE_DISAMBIGUATION_NOT_ASKED'),false);
 assert.equal(verdict.status,'MANUAL_COMMERCIAL_REVIEW_REQUIRED');
 assert.equal(verdict.semantic_assurance,'NOT_CERTIFIED');
 assert.equal(verdict.write_authorized,false);
});

test('already asked among selected questions: preserve existing FINALIZE questions and do not draft a duplicate',()=>{
 const artifact=clone();
 artifact.claris_final_brief.discovery_question_plan[0].question=
  'What did the customer request: a security questionnaire, SOC 2 Type I or Type II report, or another assurance deliverable?';
 const r=proposeSoc2AssuranceFirstCallPlan(artifact,{envelope:makeEnvelope()});
 assert.equal(r.status,'ALREADY_PRESENT_IN_SELECTED_QUESTIONS');
 assert.equal(r.proposed_count,0);
 assert.equal(r.existing_questions.length,5);
 assert.equal(r.auto_applied,false);
});

test('if original FINALIZE already contains a valid excluded question, reuse it instead of fabricating another',()=>{
 const artifact=clone();
 artifact.claris_final_brief.discovery_question_plan.push({
  question:'Does the customer require a security questionnaire or a SOC 2 Type I or Type II report?',
  intent:'Determine the actual assurance requirement'
 });
 const r=proposeSoc2AssuranceFirstCallPlan(artifact,{envelope:makeEnvelope()});
 assert.equal(r.status,'QUESTION_PLAN_PROPOSAL_FOR_CONSULTANT_REVIEW');
 assert.equal(r.question_source,'EXISTING_FINALIZE_QUESTION_NOT_SELECTED');
 assert.equal(r.proposed_count,5);
 assert.equal(r.auto_applied,false);
});

test('one original scope question can be retained alongside a new question without overwriting it',()=>{
 const artifact=clone();
 artifact.claris_final_brief.discovery_question_plan=[
  artifact.claris_final_brief.discovery_question_plan[1]
 ];
 const r=proposeSoc2AssuranceFirstCallPlan(artifact,{envelope:makeEnvelope()});
 assert.equal(r.status,'QUESTION_PLAN_PROPOSAL_FOR_CONSULTANT_REVIEW');
 assert.equal(r.proposed_count,2);
 assert.equal(r.replaced_question,null);
 assert.equal(r.proposed_questions[1].origin,'FINALIZE_QUESTION_PLAN');
 assert.deepEqual(r.dropped_topics,[]);
});

test('keyword-only questionnaire question is NOT a substitute for report-vs-questionnaire clarification',()=>{
 assert.equal(asksSoc2AssuranceDeliverable('What is your approach to the customer questionnaire?'),false);
 assert.equal(asksSoc2AssuranceDeliverable('What is the SOC 2 Type II status?'),false);
 assert.equal(asksSoc2AssuranceDeliverable('Does the customer require a questionnaire or a SOC 2 report?'),true);
 const artifact=clone();
 artifact.claris_final_brief.discovery_question_plan[0].question=
  'What is your approach to the customer questionnaire?';
 const r=proposeSoc2AssuranceFirstCallPlan(artifact,{envelope:makeEnvelope()});
 assert.equal(r.status,'QUESTION_PLAN_PROPOSAL_FOR_CONSULTANT_REVIEW');
});

test('no authentic binding, no-contact rehearsal, mixed services and corrupted answers all block proposals',()=>{
 assert.equal(proposeSoc2AssuranceFirstCallPlan(clone()).status,'TRUSTED_BOOKING_AND_ACCEPTED_ANSWERS_REQUIRED');
 const noContact=makeEnvelope('Synthetic SOC 2 readiness rehearsal. Do not contact the prospect.');
 assert.equal(proposeSoc2AssuranceFirstCallPlan(clone(),{envelope:noContact}).status,'REHEARSAL_OR_CONTACT_SCOPE_RESTRICTED');
 const mixed=makeEnvelope('We need SOC 2 readiness and ISO 27001 preparation.');
 assert.equal(proposeSoc2AssuranceFirstCallPlan(clone(),{envelope:mixed}).status,'SOC2_BOOKING_SCOPE_NOT_UNAMBIGUOUS');
 const corrupted=makeEnvelope();
 corrupted.response.answers[0].value='ISO 27001 Preparation';
 assert.equal(proposeSoc2AssuranceFirstCallPlan(clone(),{envelope:corrupted}).status,'ACCEPTED_SOC2_SERVICE_INTEREST_NOT_ESTABLISHED');
 const unclear=makeEnvelope();
 unclear.response.answers[0].answer_kind='UNSURE';
 unclear.response.answers[0].selected_option_id=null;
 unclear.response.answers[0].value='Not sure yet';
 assert.equal(proposeSoc2AssuranceFirstCallPlan(clone(),{envelope:unclear}).status,'ACCEPTED_SOC2_SERVICE_INTEREST_NOT_ESTABLISHED');
});

test('AI service mismatch or prospect lineage contradiction cannot produce a seemingly valid plan',()=>{
 const wrong=clone();
 wrong.claris_final_brief.strategic_guidance.primary_service_id='SVC_ISO27001';
 assert.equal(proposeSoc2AssuranceFirstCallPlan(wrong,{envelope:makeEnvelope()}).status,'CONSULTANT_SERVICE_OR_BOOKING_LINEAGE_NOT_DECLARED');
 const contradicted=clone();
 contradicted.claris_final_brief.intelligence_lineage.push({
  source_id:'PROS-001',authority:'PROSPECT_REPORTED',
  usage:'Prospect expressed interest in ISO 27001.'
 });
 assert.equal(proposeSoc2AssuranceFirstCallPlan(contradicted,{envelope:makeEnvelope()}).status,'PROSPECT_SERVICE_CLAIM_CONFLICT');
});

test('cannot quietly discard unique original topical coverage when adding assurance question',()=>{
 const artifact=clone();
 artifact.claris_final_brief.discovery_question_plan=[
  {question:'What business goal must this work unlock?',intent:'Buyer outcome'},
  {question:'Which systems are in scope?',intent:'Scope'},
  {question:'What evidence already exists?',intent:'Evidence'},
  {question:'Who is the accountable executive sponsor?',intent:'Authority'},
  {question:'Has project funding been approved?',intent:'Budget'}
 ];
 const r=proposeSoc2AssuranceFirstCallPlan(artifact,{envelope:makeEnvelope()});
 assert.equal(r.status,'QUESTION_PLAN_PROPOSAL_FOR_CONSULTANT_REVIEW');
 assert.deepEqual(r.dropped_topics,[]);
 assert.equal(r.proposed_count,5);
});
