import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFinalArtifact,renderFinalBrief} from '../final-brief-renderer.mjs';
import {assessCommercialBrief} from '../commercial-brief-readiness.mjs';
const realShape={
 engagement_metadata:{deterministic_metrics:{supported_match:80,scorable_coverage:85,evaluated_fit_rate:94.117647,evidence_completeness:100}},
 preliminary_brief:{what_matters:'Enterprise procurement assurance requirement'},
 match_score_explanation:{
  service_need_alignment:{status:'MATCH',basis_ids:['BOOK-001','PROS-001-A'],reasoning:'Explicit buyer assurance request'},
  buyer_stakeholder_fit:{status:'UNKNOWN',basis_ids:['BOOK-001'],reasoning:'Commercial owner not confirmed'}
 },
 completeness_score_explanation:{critical_question_coverage:{status:'COMPLETE',basis_ids:['BOOK-001'],reasoning:'Booking supplied scope'}},
 question_plan:[
  {question_id:'q_owner',text:'Who approves the consulting budget?',rationale:'Budget not approved'},
  {question_id:'q_scope',text:'Does the SOC 2 Type II report cover EU hosting?',rationale:'Report coverage unknown'},
  {question_id:'q_signoff',text:'Who signs off the security questionnaire?',rationale:'Technical approver open'}
 ],
 potential_service_relevance:[{service_id:'SVC_SOC2',name:'SOC 2 Readiness'}],
 intelligence_lineage:[
  {insight:'Buyer assurance blocker',evidence_ids:['BOOK-001','PROS-001-A']},
  {insight:'Official API documentation exists',evidence_ids:['FAC-006']}
 ],
 preliminary_brief_markdown:'### Strategic Overview\nBuyer evidence scope must be confirmed.',
 consultant_only_context:[{insight:'Historical context, not current finding',evidence_ids:['FAC-007']}]
};
test('second actual FINALIZE V3 shape retains three source questions and rationale',()=>{
 const normalized=normalizeFinalArtifact(realShape);
 assert.deepEqual(normalized.discovery_questions.map(q=>q.question),realShape.question_plan.map(q=>q.text));
 assert.deepEqual(normalized.discovery_questions.map(q=>q.intent),realShape.question_plan.map(q=>q.rationale));
});
test('real nested metrics and match and completeness explanation preserved without regrading',()=>{
 const n=normalizeFinalArtifact(realShape);
 assert.equal(n.metrics.supported_match,80);
 assert.equal(n.metrics.scorable_coverage,85);
 assert.equal(n.metrics.evidence_completeness,100);
 assert.equal(n.match_classifications.service_need_alignment.status,'MATCH');
 assert.equal(n.completeness_classifications.critical_question_coverage.status,'COMPLETE');
});
test('claim-edge source identities and usage preserved, not promoted to external proof',()=>{
 const n=normalizeFinalArtifact(realShape);
 assert.ok(n.intelligence_lineage.some(x=>x.source_id==='BOOK-001'&&x.usage==='Buyer assurance blocker'));
 assert.ok(n.intelligence_lineage.some(x=>x.source_id==='FAC-006'&&x.usage==='Official API documentation exists'));
 assert.ok(n.intelligence_lineage.every(x=>x.authority===null));
});
test('commercial-depth review remains REVIEW_REQUIRED despite provider 100 evidence completeness',()=>{
 const r=assessCommercialBrief(realShape);
 assert.equal(r.discovery_strategy.question_count,3);
 assert.equal(r.status,'REVIEW_REQUIRED');
 assert.ok(r.missing.includes('recommended_action'));
 assert.ok(r.missing.includes('talking_points'));
 assert.match(renderFinalBrief(realShape).brief_markdown,/Does the SOC 2 Type II report cover EU hosting/);
});
