import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePrecallScorecard } from '../precall-scorecard.mjs';
const match = (status, id) => ({ status, basis_ids: id ? [id] : [], reason: `${status} basis` });
const completeness = (status, id) => ({ status, basis_ids: id ? [id] : [], reason: `${status} basis` });
const score_basis = {
  gate_status: 'PASS',
  canonical_match_classifications: {
    service_need_alignment: match('MATCH','BOOK-001'),
    icp_company_fit: match('MATCH','FAC-001'),
    business_trigger: match('PARTIAL_MATCH','BOOK-001'),
    buyer_stakeholder_fit: match('MATCH','BOOK-001'),
    engagement_economics: match('UNKNOWN'),
    timing_urgency: match('UNKNOWN'),
    expansion_potential: match('MISMATCH','PROS-001')
  },
  canonical_completeness_classifications: {
    critical_question_coverage: completeness('COMPLETE','BOOK-001'),
    source_authority: completeness('COMPLETE','FAC-001'),
    corroboration_depth: completeness('PARTIAL','FAC-002'),
    freshness: completeness('COMPLETE','FAC-003'),
    conflict_ambiguity_control: completeness('COMPLETE','FAC-004')
  },
  basis_resolution: { all_scored_basis_resolvable: true, unresolved_basis_ids: [] }
};
const prepare = { open_dimensions: [{dimension_id:'D1'},{dimension_id:'D2'},{dimension_id:'D3'}] };
const discovery = {
  authorized_dimensions: [{dimension_id:'D1',authority:'PREPARE'},{dimension_id:'D2',authority:'PREPARE'},{dimension_id:'D3',authority:'PREPARE'}],
  primary_questions: [{dimension_id:'D1'},{dimension_id:'D2'},{dimension_id:'D3'}]
};
const certification = {
  schema_version:'CLARIS_PRECALL_CERTIFICATION_V1',
  premium_semantic_pass:true, discovery_semantic_pass:true,
  premium_deterministic_pass:true, discovery_deterministic_pass:true
};
test('reproduces frozen weighting and excludes UNKNOWN from evaluated-fit denominator',()=>{
  const r=compilePrecallScorecard({score_basis,prepare,discovery,certification});
  assert.equal(r.lead_fit.supported_match,67.5);
  assert.equal(r.lead_fit.scorable_coverage,80);
  assert.equal(r.lead_fit.evaluated_fit_rate,84.4);
  assert.equal(r.lead_fit.grade,'B');
  assert.equal(r.evidence_coverage.score,94);
  assert.equal(r.call_readiness.status,'READY');
  assert.equal(r.call_readiness.open_variables,3);
});
test('keeps traceable basis ids and reasons',()=>{
  const r=compilePrecallScorecard({score_basis,prepare,discovery,certification});
  const d=r.lead_fit.dimensions.find(x=>x.key==='service_need_alignment');
  assert.deepEqual(d.basis_ids,['BOOK-001']);
  assert.match(d.reason,/MATCH basis/);
});
test('fails closed when scored basis is unresolved',()=>{
  assert.throws(()=>compilePrecallScorecard({score_basis:{...score_basis,basis_resolution:{all_scored_basis_resolvable:false}},prepare,discovery,certification}),/SCORE_BASIS_NOT_RESOLVABLE/);
});
test('fails closed when non-unknown classification has no basis',()=>{
  const broken=structuredClone(score_basis);
  broken.canonical_match_classifications.icp_company_fit.basis_ids=[];
  assert.throws(()=>compilePrecallScorecard({score_basis:broken,prepare,discovery,certification}),/SCORE_BASIS_REQUIRED:icp_company_fit/);
});
test('readiness blocks uncovered admitted dimensions',()=>{
  const r=compilePrecallScorecard({score_basis,prepare,discovery:{...discovery,primary_questions:discovery.primary_questions.slice(0,2)},certification});
  assert.equal(r.call_readiness.status,'NOT_READY');
  assert.deepEqual(r.call_readiness.uncovered_dimensions,['D3']);
});
