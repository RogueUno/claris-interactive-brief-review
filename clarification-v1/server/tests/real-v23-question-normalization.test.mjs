import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinalArtifact, renderFinalBrief } from '../final-brief-renderer.mjs';
import { assessCommercialBrief } from '../commercial-brief-readiness.mjs';

const v23Final={
  preliminary_brief_markdown:'### Executive Summary\nScoped commercial intelligence.',
  match_classifications:{
    service_need_alignment:{status:'MATCH',basis_ids:['PROS-001','SVC_SOC2'],reason:'Prospect chose readiness'},
    timing_urgency:{status:'UNKNOWN',basis_ids:[],reason:'Timing not confirmed'}
  },
  prospect_question_plan:[
    {question_id:'Q_SCOPE_SYSTEMS',text:'Which systems and evidence are in scope for this SOC 2 readiness?',strategy_alignment:'Clarify audit boundary.'},
    {question_id:'Q_DECISION_OWNER',text:'Who owns the decision, and are there budget or deadline constraints?',strategy_alignment:'Test decision feasibility.'}
  ],
  intelligence_lineage:[{evidence_id:'BOOK-001',source:'BOOKING_TEXT',description:'Original booking'},{evidence_id:'PROS-001',source:'PROSPECT_REPORTED',description:'Accepted answer'}],
  deterministic_metrics:{supported_match:'50/100',scorable_coverage:'50/100',evidence_completeness:'74.75/100'}
};
test('actual Make V2.3 text/strategy_alignment questions survive normalization in original order',()=>{
  const n=normalizeFinalArtifact(v23Final);
  assert.deepEqual(n.discovery_questions.map(x=>x.question),v23Final.prospect_question_plan.map(x=>x.text));
  assert.deepEqual(n.discovery_questions.map(x=>x.intent),v23Final.prospect_question_plan.map(x=>x.strategy_alignment));
});
test('commercial diagnostic no longer mistakes present provider questions for zero',()=>{
  const result=assessCommercialBrief(v23Final);
  assert.equal(result.discovery_strategy.question_count,2);
  assert.equal(result.missing.includes('discovery'),true,'two is below minimum three, not zero');
  assert.equal(result.status,'REVIEW_REQUIRED');
  assert.match(renderFinalBrief(v23Final).brief_markdown,/Which systems and evidence are in scope/);
});
test('legacy question and intent shape remains backward-compatible',()=>{
  const old=structuredClone(v23Final);
  old.prospect_question_plan=[{question:'What is the buyer objective?',intent:'Determine business outcome'}];
  const n=normalizeFinalArtifact(old);
  assert.equal(n.discovery_questions[0].question,'What is the buyer objective?');
  assert.equal(n.discovery_questions[0].intent,'Determine business outcome');
});
