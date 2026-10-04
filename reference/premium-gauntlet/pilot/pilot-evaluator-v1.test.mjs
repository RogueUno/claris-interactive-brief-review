import assert from 'node:assert/strict';
import {evaluatePilotV1} from './pilot-evaluator-v1.mjs';

const strong={
  opportunity_id:'opp_real_1',
  company:'Acme',
  consultant_id:'consultant_1',
  baseline_manual_prep_minutes:45,
  claris_review_minutes:7,
  material_facts_not_in_booking:4,
  redundant_questions_avoided:3,
  primary_questions_total:5,
  primary_questions_helpful:4,
  conditional_probes_triggered:2,
  conditional_probes_helpful:1,
  material_wrong_fact_count:0,
  unsupported_inference_changed_call:false,
  missed_critical_question_changed_call:false,
  private_data_exposure:false,
  consultant_policy_violation:false,
  trust_rating:5,
  live_usability_rating:4,
  diagnostic_confidence_rating:5,
  would_use_next_serious_call:true,
  manual_prep_replacement:'MOSTLY'
};
let r=evaluatePilotV1(strong);
assert.equal(r.ok,true);
assert.equal(r.hard_failures.length,0);
assert.equal(r.evidence.prep_minutes_saved,38);
assert.equal(r.decision.paid_pilot_candidate,true);
assert.equal(r.decision.four_figure_value_evidence_strong,true);

r=evaluatePilotV1({...strong,material_wrong_fact_count:1});
assert.equal(r.decision.safe_to_continue_pilot,false);
assert(r.hard_failures.includes('MATERIAL_WRONG_FACT'));
assert.equal(r.decision.paid_pilot_candidate,false);

r=evaluatePilotV1({...strong,unsupported_inference_changed_call:true});
assert(r.hard_failures.includes('UNSUPPORTED_INFERENCE_CHANGED_CALL'));
assert.equal(r.decision.four_figure_value_evidence_strong,false);

r=evaluatePilotV1({...strong,baseline_manual_prep_minutes:20,claris_review_minutes:10});
assert.equal(r.decision.paid_pilot_candidate,false);

r=evaluatePilotV1({...strong,would_use_next_serious_call:false});
assert.equal(r.decision.paid_pilot_candidate,false);

r=evaluatePilotV1({company:'Acme'});
assert.equal(r.ok,false);
assert(r.errors.some(x=>x.path==='opportunity_id'));

console.log('pilot-evaluator-v1 tests: PASS');
