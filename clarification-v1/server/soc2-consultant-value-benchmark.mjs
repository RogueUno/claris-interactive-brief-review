import { asksSoc2AssuranceDeliverable } from './soc2-offline-judgment-review.mjs';
import { assessDiscoveryCoverage } from './discovery-coverage.mjs';

// OFFLINE BENCHMARK ONLY. A simulated answer is held out from the question
// planner and used to illustrate what decision a consultant could explore if
// the buyer actually answered the question. This is not observation, proof,
// prediction accuracy, automatic question execution, or scope authorization.
const DELIVERABLE_TYPES=new Set([
  'QUESTIONNAIRE_ONLY','TYPE_I','TYPE_II','NOT_CONFIRMED','EXISTING_TYPE_II'
]);
const RISKY_ASSUMPTION=/\b(?:your|you have|you need|you must)\s+(?:failed|failing|noncompliant|been breached|a failed control|a compliance gap)\b/i;
const EXPLICIT_REPORT_TYPES=/\bType\s*I\b[\s\S]*\b(?:Type\s*II|II)\b|\bType\s*II\b[\s\S]*\bType\s*I\b/i;
const PERIOD=/\b(?:operating|observation|review|testing|audit)\s+period\b|\bperiod of (?:operation|control|evidence)\b/i;
const EXISTING_REPORT=/\b(?:existing|current|already have|previous|last)\s+(?:SOC\s*2\s*)?(?:Type\s*II\s*)?report\b|\b(?:report's|report)\s+(?:scope|period|coverage)\b/i;

const questions=plan=>Array.isArray(plan)
 ? plan.map(x=>typeof x==='string'?x:x?.question)
     .filter(x=>typeof x==='string'&&x.trim())
 : [];

export function assessSoc2QuestionPlanPotential(plan,{scenario}={}) {
  if(!scenario||!DELIVERABLE_TYPES.has(scenario.oracle?.deliverable)){
    return {status:'BENCHMARK_ORACLE_REQUIRED',evidence_assurance:'NONE',certified:false,
      decision_elicitable:false,decision_class:'NOT_ESTABLISHED',write_authorized:false,
      delivery_authorized:false};
  }
  const list=questions(plan);
  if(!list.length||list.length>5){
    return {status:'QUESTION_SET_INVALID',certified:false,decision_elicitable:false,
      decision_class:'NOT_ESTABLISHED',write_authorized:false,delivery_authorized:false};
  }
  const explicitAsk=list.some(asksSoc2AssuranceDeliverable);
  const bothTypes=list.some(q=>EXPLICIT_REPORT_TYPES.test(q));
  const safe=list.every(q=>!RISKY_ASSUMPTION.test(q));
  // Lexical topic breadth is a non-semantic proxy and does not substitute
  // for consultant relevance or a verified buyer answer.
  const breadth=assessDiscoveryCoverage({
    discovery_question_plan:list.map(question=>({question}))
  });
  const followUpGaps=[];
  if(scenario.oracle.deliverable==='TYPE_II'&&!list.some(q=>PERIOD.test(q))){
    followUpGaps.push('OPERATING_PERIOD_NOT_ASKED');
  }
  if(scenario.oracle.deliverable==='EXISTING_TYPE_II'&&!list.some(q=>EXISTING_REPORT.test(q))){
    followUpGaps.push('EXISTING_REPORT_SCOPE_AND_PERIOD_NOT_ASKED');
  }
  const decisionElicitable=explicitAsk&&bothTypes&&safe;
  return {
    status:'OFFLINE_QUESTION_ELICITATION_PROXY',
    question_count:list.length,
    decision_elicitable:decisionElicitable,
    // This is a COUNTERFACTUAL label from a hidden fictional oracle. Nothing
    // here says the actual buyer gave this answer or that a recommendation
    // should be rendered to a user.
    counterfactual_if_answer_received:decisionElicitable
      ? scenario.oracle.decision_critical_branch : 'DELIVERABLE_ROUTE_NOT_ELICITABLE',
    decision_class:'NOT_ESTABLISHED',
    source_of_counterfactual:'FICTIONAL_HELD_OUT_BENCHMARK_ORACLE',
    report_types_explicit:bothTypes,
    deliverable_question_present:explicitAsk,
    misleading_control_assumptions_detected:!safe,
    topical_coverage_count:breadth.covered_count,
    topical_dimensions:breadth.covered,
    remaining_follow_up_gaps:followUpGaps,
    evidence_assurance:'SIMULATED_CASE_ONLY',
    outcome_assurance:'NOT_MEASURED',
    certified:false,
    write_authorized:false,
    delivery_authorized:false
  };
}

export function compareSoc2QuestionPlanPotential(baseline,improved,{scenario}={}) {
  const original=assessSoc2QuestionPlanPotential(baseline,{scenario});
  const proposed=assessSoc2QuestionPlanPotential(improved,{scenario});
  if(original.status!=='OFFLINE_QUESTION_ELICITATION_PROXY'||
     proposed.status!=='OFFLINE_QUESTION_ELICITATION_PROXY'){
    return {status:'BENCHMARK_COMPARISON_NOT_EVALUABLE',
      baseline:original,proposed,certified:false};
  }
  return {
    status:'SIMULATED_QUESTION_PLAN_COMPARISON_ONLY',
    scenario_id:scenario.id,
    hidden_deliverable_category:scenario.oracle.deliverable,
    original,
    proposed,
    decision_elicitation_delta:Number(proposed.decision_elicitable)-Number(original.decision_elicitable),
    dropped_topical_dimensions:Object.keys(original.topical_dimensions)
      .filter(key=>original.topical_dimensions[key]&&!proposed.topical_dimensions[key]),
    // No uplift to conversion, forecast revenue, audit readiness, or real diagnosis
    // may be inferred from this counterfactual proxy.
    limitations:'Held-out fictional buyer answers and lexical assessment only; no real consultative call, prospect confirmation, human expert rating or business-outcome validation.',
    certified:false
  };
}
