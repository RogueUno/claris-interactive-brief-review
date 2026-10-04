import assert from 'node:assert/strict';
import {aggregatePilotsV1} from './pilot-aggregate-v1.mjs';

const strong=(id,overrides={})=>({
  opportunity_id:id,
  company:'Acme '+id,
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
  manual_prep_replacement:'MOSTLY',
  ...overrides
});

let r=aggregatePilotsV1([strong('1'),strong('2'),strong('3')]);
assert.equal(r.ok,true);
assert.equal(r.summary.paid_pilot_candidate_count,3);
assert.equal(r.summary.hard_failure_opportunity_count,0);
assert.equal(r.decision.commercial_validation_ready,true);
assert.equal(r.decision.four_figure_thesis_ready_for_buyer_test,true);

r=aggregatePilotsV1([
  strong('1'),
  strong('2',{material_wrong_fact_count:1}),
  strong('3')
]);
assert.equal(r.summary.hard_failure_opportunity_count,1);
assert.equal(r.decision.commercial_validation_ready,false);
assert.equal(r.decision.four_figure_thesis_ready_for_buyer_test,false);

r=aggregatePilotsV1([
  strong('1'),
  strong('2',{would_use_next_serious_call:false}),
  strong('3',{would_use_next_serious_call:false})
]);
assert.equal(r.summary.reuse_intent_count,1);
assert.equal(r.decision.commercial_validation_ready,false);

r=aggregatePilotsV1([strong('1'),strong('2')]);
assert.equal(r.ok,false);
assert.equal(r.errors[0].code,'THREE_PILOTS_REQUIRED');

console.log('pilot-aggregate-v1 tests: PASS');
