import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prioritizeDiscoveryQuestions } from '../discovery-prioritizer.mjs';
import { proposeSoc2AssuranceFirstCallPlan } from '../soc2-assurance-question-plan.mjs';
import {
  assessSoc2QuestionPlanPotential,compareSoc2QuestionPlanPotential
} from '../soc2-consultant-value-benchmark.mjs';

const benchmark=JSON.parse(readFileSync(new URL('./fixtures/soc2-consultant-value-cases.json',import.meta.url),'utf8'));
const fixture=JSON.parse(readFileSync(new URL('./fixtures/fictional-soc2-advisory-final.json',import.meta.url),'utf8'));
const service='Which advisory service are you interested in exploring?';
const answers=[
 {question_id:'q_service',prompt:service,answer_kind:'OPTION',selected_option_id:'soc2',value:'SOC 2 Readiness'},
 {question_id:'q_timing',prompt:'What timing is currently confirmed for the request?',answer_kind:'OPTION',selected_option_id:'unspecified',value:'Customer assessment planned; date not confirmed'},
 {question_id:'q_budget',prompt:'What is the status of a potential advisory budget?',answer_kind:'UNSURE',selected_option_id:null,value:'Not sure yet'}
];
function envelope(booking){
 const questions=answers.map(a=>({
  question_id:a.question_id,prompt:a.prompt,mode:'DISCOVER',required:true,
  options:a.answer_kind==='OPTION'?[{option_id:a.selected_option_id,label:a.value}]:[]
 }));
 return {
  schema_version:'claris_clarification_envelope_v1',
  opportunity_id:'isolated_soc2_consultant_value',
  package:{status:'SUBMITTED',questions},
  response:{
   schema_version:'claris_prospect_response_v1',
   opportunity_id:'isolated_soc2_consultant_value',
   source_class:'PROSPECT_REPORTED',
   submitted_at:'2026-10-12T09:00:00.000Z',
   answers:answers.map(a=>({...a,mode:'DISCOVER',source_class:'PROSPECT_REPORTED'}))
  },
  finalize_context:{
   schema_version:'claris_finalize_context_v1',
   case_state_json:JSON.stringify({
    booking_text_exact:booking,
    canonical_truth_json:JSON.stringify({booking_evidence:[{
     evidence_id:'BOOK-001',authority:'BOOKING_TEXT',resolvable:true,
     statement:booking,exact_basis:booking
    }]})
   })
  }
 };
}
const supported=benchmark.cases.filter(c=>c.oracle.deliverable!=='OUT_OF_SCOPE');
const blocked=benchmark.cases.filter(c=>c.oracle.deliverable==='OUT_OF_SCOPE');
const original=prioritizeDiscoveryQuestions(fixture).selected;
const snapshot=JSON.stringify(fixture);

test('benchmark fixture specifies five distinct hidden answers and two blocked scopes',()=>{
 assert.equal(benchmark.fictional,true);
 assert.equal(benchmark.cases.length,7);
 assert.equal(supported.length,5);
 assert.equal(blocked.length,2);
 assert.deepEqual(supported.map(x=>x.oracle.deliverable),
   ['QUESTIONNAIRE_ONLY','TYPE_I','TYPE_II','NOT_CONFIRMED','EXISTING_TYPE_II']);
 assert.equal(new Set(benchmark.cases.map(x=>x.id)).size,7);
 assert.equal(original.length,5);
 assert.equal(benchmark.oracle_usage,'HELD_OUT_SIMULATED_ANSWERS_EVALUATION_ONLY_NOT_BOOKING_EVIDENCE');
});

test('same original and proposed plans: five scenario routes become ASKABLE, not confirmed',()=>{
 let baselineCount=0,proposedCount=0;
 const results=[];
 for(const scenario of supported){
  const e=envelope(scenario.booking);
  // The oracle remains excluded from this invocation: the planner sees ONLY
  // the unchanged FINALIZE fixture and the canonical booking/accepted answers.
  const proposal=proposeSoc2AssuranceFirstCallPlan(structuredClone(fixture),{envelope:e});
  assert.equal(proposal.status,'QUESTION_PLAN_PROPOSAL_FOR_CONSULTANT_REVIEW',scenario.id);
  assert.equal(proposal.proposed_questions.length,original.length,scenario.id);
  assert.equal(proposal.auto_applied,false,scenario.id);
  assert.equal(proposal.write_authorized,false,scenario.id);
  assert.equal(proposal.delivery_authorized,false,scenario.id);
  assert.deepEqual(proposal.dropped_topics,[],scenario.id);
  assert.deepEqual(proposal.proposed_questions[0].basis_ids,['BOOK-001','PROS-001']);
  const output=compareSoc2QuestionPlanPotential(original,proposal.proposed_questions,{scenario});
  assert.equal(output.status,'SIMULATED_QUESTION_PLAN_COMPARISON_ONLY',scenario.id);
  assert.equal(output.original.decision_elicitable,false,scenario.id);
  assert.equal(output.proposed.decision_elicitable,true,scenario.id);
  assert.equal(output.original.decision_class,'NOT_ESTABLISHED');
  assert.equal(output.proposed.decision_class,'NOT_ESTABLISHED');
  assert.equal(output.proposed.counterfactual_if_answer_received,
    scenario.oracle.decision_critical_branch,scenario.id);
  assert.equal(output.proposed.evidence_assurance,'SIMULATED_CASE_ONLY');
  assert.equal(output.proposed.outcome_assurance,'NOT_MEASURED');
  assert.equal(output.proposed.certified,false);
  assert.equal(output.decision_elicitation_delta,1);
  assert.deepEqual(output.dropped_topical_dimensions,[]);
  assert.equal(output.proposed.misleading_control_assumptions_detected,false);
  assert.equal(JSON.stringify(proposal).includes(scenario.oracle.simulated_answer),false);
  baselineCount+=Number(output.original.decision_elicitable);
  proposedCount+=Number(output.proposed.decision_elicitable);
  results.push({
   id:scenario.id,original:output.original.decision_elicitable,
   proposed:output.proposed.decision_elicitable,
   uncovered_scenario_followups:output.proposed.remaining_follow_up_gaps,
   retained_topic_count:output.proposed.topical_coverage_count
  });
 }
 assert.equal(baselineCount,0);
 assert.equal(proposedCount,5);
 assert.equal(JSON.stringify(fixture),snapshot);
 console.log('SOC2_CONSULTANT_VALUE_PROXY='+JSON.stringify({
   synthetic_scenarios:supported.length,
   original_decision_elicitation:baselineCount,
   proposed_decision_elicitation:proposedCount,
   real_consultant_ratings:0,real_buyer_responses:0,paid_conversions:0,
   certification:'NONE',results
 }));
});

test('specialist blind spots stay open even after the type question is added',()=>{
 const type2=supported.find(c=>c.oracle.deliverable==='TYPE_II');
 const existing=supported.find(c=>c.oracle.deliverable==='EXISTING_TYPE_II');
 for(const [scenario,missing] of [[type2,'OPERATING_PERIOD_NOT_ASKED'],
   [existing,'EXISTING_REPORT_SCOPE_AND_PERIOD_NOT_ASKED']]){
  const p=proposeSoc2AssuranceFirstCallPlan(fixture,{envelope:envelope(scenario.booking)});
  const out=assessSoc2QuestionPlanPotential(p.proposed_questions,{scenario});
  assert.equal(out.decision_elicitable,true);
  assert.ok(out.remaining_follow_up_gaps.includes(missing));
  assert.equal(out.decision_class,'NOT_ESTABLISHED');
 }
});

test('actual question wording (not AI intent metadata) controls the outcome',()=>{
 const scenario=supported[0];
 const fake=original.map(x=>({...x,intent:'Determine whether customer needs questionnaire versus SOC 2 Type I or II report'}));
 assert.equal(assessSoc2QuestionPlanPotential(fake,{scenario}).decision_elicitable,false);
 const leading=[
  {question:'Since you have failed SOC 2 controls, what is your requested questionnaire or Type II report?'}
 ];
 const flagged=assessSoc2QuestionPlanPotential(leading,{scenario});
 assert.equal(flagged.misleading_control_assumptions_detected,true);
 assert.equal(flagged.decision_elicitable,false);
});

test('an already-good original plan does not produce spurious claimed uplift',()=>{
 const caseOne=supported[0];
 const already=structuredClone(fixture);
 already.claris_final_brief.discovery_question_plan[0].question=
  'Does the customer require a security questionnaire or a SOC 2 Type I or Type II report, and what decision or actual required date is involved?';
 const p=proposeSoc2AssuranceFirstCallPlan(already,{envelope:envelope(caseOne.booking)});
 assert.equal(p.status,'ALREADY_PRESENT_IN_SELECTED_QUESTIONS');
 assert.equal(p.proposed_count,0);
 const before=prioritizeDiscoveryQuestions(already).selected;
 const comparison=compareSoc2QuestionPlanPotential(before,before,{scenario:caseOne});
 assert.equal(comparison.decision_elicitation_delta,0);
 assert.equal(comparison.original.decision_elicitable,true);
});

test('explicit no-contact and mixed-framework scope never enter an uplift calculation',()=>{
 for(const scenario of blocked){
  const p=proposeSoc2AssuranceFirstCallPlan(fixture,{envelope:envelope(scenario.booking)});
  assert.equal(p.proposed_count,0);
  assert.equal(p.write_authorized,false);
  assert.equal(p.delivery_authorized,false);
  assert.ok(['SOC2_BOOKING_SCOPE_NOT_UNAMBIGUOUS','REHEARSAL_OR_CONTACT_SCOPE_RESTRICTED'].includes(p.status));
 }
});

test('no-oracle, malformed plan and open commercial facts are not certified as decisions',()=>{
 const a=assessSoc2QuestionPlanPotential(original);
 assert.equal(a.status,'BENCHMARK_ORACLE_REQUIRED');
 assert.equal(a.certified,false);
 const malformed=assessSoc2QuestionPlanPotential([],{scenario:supported[0]});
 assert.equal(malformed.status,'QUESTION_SET_INVALID');
 assert.equal(malformed.decision_class,'NOT_ESTABLISHED');
 const p=proposeSoc2AssuranceFirstCallPlan(fixture,{envelope:envelope(supported[2].booking)});
 const out=assessSoc2QuestionPlanPotential(p.proposed_questions,{scenario:supported[2]});
 assert.equal(out.decision_class,'NOT_ESTABLISHED');
 assert.equal(out.write_authorized,false);
 assert.equal(out.delivery_authorized,false);
 assert.equal(out.outcome_assurance,'NOT_MEASURED');
});
