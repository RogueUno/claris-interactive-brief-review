import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectBookingScopeBoundary} from '../booking-scope-boundary-review.mjs';

const load=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'));
const oct09=load('oct09-finalize-actual.json');
const oct10=load('oct10-finalize-live-actual.json');
const booking='Synthetic CLARIS MVP rehearsal. The company is Tailead; test research and call preparation only. Do not contact the prospect.';
function envelope(text=booking){
 return {finalize_context:{schema_version:'claris_finalize_context_v1',
  case_state_json:JSON.stringify({
   booking_text_exact:text,
   canonical_truth_json:JSON.stringify({booking_evidence:[
    {evidence_id:'BOOK-001',authority:'BOOKING_TEXT',resolvable:true,
     statement:text,exact_basis:text}
   ]})
  })
 }};
}
test('actual October 9 and 10 FINALIZE respect rehearsal and no-contact boundaries',()=>{
 for(const artifact of [oct09,oct10]){
  const r=inspectBookingScopeBoundary(artifact,envelope());
  assert.equal(r.booking_scope,'SYNTHETIC_NO_CONTACT');
  assert.equal(r.status,'SYNTHETIC_SCOPE_NOT_CONTRADICTED');
  assert.equal(r.conflict_count,0);
  assert.equal(r.pilot_eligibility,'BLOCKED_SYNTHETIC_NO_CONTACT');
  assert.equal(r.semantic_assurance,'NOT_CERTIFIED');
  assert.equal(r.manual_review_required,true);
  assert.ok(r.scanned_text_fields>10);
  assert.equal(JSON.stringify(r).includes(booking),false);
 }
});
test('prospect-selected service cannot become a recommended live service',()=>{
 const altered=structuredClone(oct10);
 altered.engagement_readiness.qualification_status='QUALIFIED';
 altered.engagement_readiness.recommended_action='Pitch SOC 2 services to the prospect.';
 const r=inspectBookingScopeBoundary(altered,envelope());
 assert.equal(r.status,'SYNTHETIC_SCOPE_CONFLICT_DETECTED');
 assert.ok(r.conflicts.some(x=>x.reason==='COMMERCIAL_QUALIFICATION_IN_REHEARSAL'));
 assert.ok(r.conflicts.some(x=>x.reason==='UNAUTHORIZED_COMMERCIAL_ACTION'));
 assert.equal(r.pilot_eligibility,'BLOCKED_SYNTHETIC_NO_CONTACT');
});
test('top-level primary service promotion conflicts with booking scope',()=>{
 const altered=structuredClone(oct09);
 altered.consultant_prep_strategy.primary_service_id='SVC_SOC2';
 const r=inspectBookingScopeBoundary(altered,envelope());
 assert.ok(r.conflicts.some(x=>x.reason==='LIVE_SERVICE_RECOMMENDATION_IN_SYNTHETIC_SCOPE'));
});
test('unexpected contact directives buried in preliminary brief are visible',()=>{
 const altered=structuredClone(oct10);
 altered.preliminary_brief_markdown += '\nSchedule a call with the prospect to discuss SOC 2 Readiness.';
 const r=inspectBookingScopeBoundary(altered,envelope());
 assert.equal(r.status,'SYNTHETIC_SCOPE_CONFLICT_DETECTED');
 assert.ok(r.conflicts.some(x=>x.field==='preliminary_brief_markdown'&&
   x.reason==='PROSPECT_CONTACT_DIRECTIVE_IN_NO_CONTACT_SCOPE'));
});
test('explicit no-contact instruction is not a positive directive',()=>{
 const altered=structuredClone(oct10);
 altered.additional_safety_note='Do not contact the prospect or send a proposal.';
 const r=inspectBookingScopeBoundary(altered,envelope());
 assert.equal(r.conflict_count,0);
});
test('high-confidence service recommendation without boundary caveat is flagged',()=>{
 const altered=structuredClone(oct10);
 altered.potential_service_relevance=[{
   service_id:'SVC_SOC2',status:'RECOMMENDED',
   relevance_rationale:'Perfect candidate for commercial work.'
 }];
 const r=inspectBookingScopeBoundary(altered,envelope());
 assert.ok(r.conflicts.some(x=>x.reason==='SERVICE_PROMOTED_WITHOUT_SCOPE_EXCEPTION'));
});
test('mere SOC 2 interest and explicitly excluded service relevance remain contextual',()=>{
 const r=inspectBookingScopeBoundary(oct09,envelope());
 assert.equal(r.conflict_count,0);
 assert.equal(r.semantic_assurance,'NOT_CERTIFIED');
});
test('ordinary commercial booking is not silently declared safe by synthetic-only reviewer',()=>{
 const r=inspectBookingScopeBoundary(oct10,envelope('We need a SOC 2 audit consultation.'));
 assert.equal(r.status,'SCOPE_NOT_SYNTHETIC_NO_CONTACT_CONFIRMED');
 assert.equal(r.pilot_eligibility,'BLOCKED');
 assert.equal(r.semantic_assurance,'NOT_CERTIFIED');
});
test('missing or forged canonical booking never passes review',()=>{
 const e=envelope();
 const caseState=JSON.parse(e.finalize_context.case_state_json);
 caseState.booking_text_exact='other booking';
 e.finalize_context.case_state_json=JSON.stringify(caseState);
 const r=inspectBookingScopeBoundary(oct10,e);
 assert.equal(r.status,'BOOKING_CONTEXT_UNVERIFIED');
 assert.equal(r.manual_review_required,true);
});
