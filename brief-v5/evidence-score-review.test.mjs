import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewEvidenceScore} from './evidence-score-review.mjs';
const data={
  engagement_metadata:{deterministic_metrics:{evidence_completeness:100}},
  completeness_score_explanation:{
    critical_question_coverage:{status:'COMPLETE',score:35,basis_ids:['BOOK-001','PROS-001-A']},
    source_authority:{status:'COMPLETE',score:25,basis_ids:['BOOK-001','PROS-001-A','PROS-001-B','PROS-001-C']},
    corroboration_depth:{status:'COMPLETE',score:15,basis_ids:['FAC-003','FAC-006']},
    freshness:{status:'COMPLETE',score:15,basis_ids:['BOOK-001']},
    conflict_ambiguity_control:{status:'COMPLETE',score:10,basis_ids:[]}
  }
};
const records=[
 {evidence_id:'FAC-003',admission_status:'ADMITTED',sensitivity:'STANDARD',source_url:'https://posthog.com/docs/data'},
 {evidence_id:'FAC-006',admission_status:'ADMITTED',sensitivity:'STANDARD',source_url:'https://posthog.com/docs/api'}
];
const manifest={ok:true,entries:[{evidence_id:'PROS-001',question_id:'engagement_path_preference',value:'One accepted answer'}]};
const review={buyer_deliverable_fork:{open:true}};
function check(raw=data,opts={}){return reviewEvidenceScore(raw,{
  evidenceRegistry:records,acceptedManifest:manifest,commercialReview:review,...opts
});}
test('real Avery 100 stays mathematically correct yet is NOT independently certified',()=>{
 const result=check();
 assert.equal(result.provider_score,100);
 assert.equal(result.mathematically_consistent,true);
 assert.equal(result.independent_quality_score,null);
 assert.equal(result.independent_grade,null);
 assert.equal(result.assurance,'SEMANTIC_REVIEW_REQUIRED');
 assert.equal(result.review_required,true);
 assert.equal(result.no_provider_reexecution,true);
 for(const code of [
  'FULL_CRITICAL_COVERAGE_WITH_OPEN_BUYER_DECISION',
  'FULL_AMBIGUITY_CONTROL_WITH_OPEN_DECISION',
  'FRESHNESS_IS_BOOKING_RECENCY_ONLY',
  'PERFECT_SCORE_NOT_INDEPENDENTLY_SUPPORTED',
  'PROSPECT_SUBCLAIM_NOT_INDEPENDENT'
 ])assert.ok(result.warnings.some(x=>x.code===code),code);
 assert.ok(!result.warnings.some(x=>x.code==='PROSPECT_BASIS_UNBOUND'));
 assert.equal(result.scoring_dimensions.reduce((s,d)=>s+d.expected_points,0),100);
});
test('a derived prospect subclaim is related to its accepted answer, not a fabricated standalone source',()=>{
 const x=check();
 const sub=x.warnings.filter(w=>w.code==='PROSPECT_SUBCLAIM_NOT_INDEPENDENT');
 assert.ok(sub.some(w=>w.basis_ids.includes('PROS-001-B')));
 assert.ok(sub.some(w=>w.basis_ids.includes('PROS-001-C')));
 assert.equal(x.assurance,'SEMANTIC_REVIEW_REQUIRED');
});
test('a missing accepted answer or inadmissible FAC fails closed',()=>{
 const changed=structuredClone(data);
 changed.completeness_score_explanation.corroboration_depth.basis_ids=['FAC-007'];
 const x=check(changed,{acceptedManifest:{ok:true,entries:[]},
    evidenceRegistry:[{evidence_id:'FAC-007',admission_status:'REJECTED',sensitivity:'STANDARD',source_url:'https://example.com'}]});
 assert.equal(x.assurance,'INTEGRITY_REVIEW_REQUIRED');
 assert.ok(x.warnings.some(w=>w.code==='FAC_BASIS_NOT_ADMISSIBLE'));
 assert.ok(x.warnings.some(w=>w.code==='PROSPECT_BASIS_UNBOUND'));
});
test('weights and score mismatches cannot masquerade as sound arithmetic',()=>{
 const changed=structuredClone(data);
 changed.completeness_score_explanation.critical_question_coverage.score=20;
 changed.engagement_metadata.deterministic_metrics.evidence_completeness=99;
 const x=check(changed,{commercialReview:null});
 assert.equal(x.mathematically_consistent,false);
 assert.ok(x.warnings.some(w=>w.code==='DIMENSION_POINTS_MISMATCH'));
 assert.ok(x.warnings.some(w=>w.code==='PROVIDER_SCORE_SUM_MISMATCH'));
 assert.equal(x.provider_score,99);
});
test('unknown status and invalid numeric score do not silently convert to zero',()=>{
 const changed=structuredClone(data);
 changed.completeness_score_explanation.corroboration_depth.status='UNKNOWN';
 changed.engagement_metadata.deterministic_metrics.evidence_completeness=-12;
 const x=check(changed);
 assert.equal(x.assurance,'INTEGRITY_REVIEW_REQUIRED');
 assert.ok(x.warnings.some(w=>w.code==='INVALID_COMPLETENESS_STATUS'));
 assert.ok(x.warnings.some(w=>w.code==='PROVIDER_SCORE_INVALID'));
});
test('a structurally clean case still cannot claim independent certification',()=>{
 const changed=structuredClone(data);
 changed.completeness_score_explanation.source_authority.basis_ids=['BOOK-001','PROS-001'];
 changed.completeness_score_explanation.critical_question_coverage.basis_ids=['BOOK-001'];
 changed.completeness_score_explanation.freshness.basis_ids=['FAC-003'];
 const x=check(changed,{commercialReview:{buyer_deliverable_fork:{open:false}}});
 assert.equal(x.assurance,'STRUCTURAL_CHECK_ONLY');
 assert.equal(x.review_required,false);
 assert.equal(x.commercial_certification,false);
 assert.equal(x.independent_quality_score,null);
});
