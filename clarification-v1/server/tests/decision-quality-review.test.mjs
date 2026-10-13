import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewDecisionQuality} from '../decision-quality-review.mjs';

const fixture=JSON.parse(readFileSync(new URL('./tests/fixtures/oct10-finalize-live-actual.json',import.meta.url),'utf8'));
const posthogLike={
 match_classifications:{service_need_alignment:{status:'MATCH',basis_ids:['PROS-001','SVC_SOC2'],reason:'Prospect chose formal readiness'},business_trigger:{status:'UNKNOWN',basis_ids:[],reason:'Exact buyer requirement open'}},
 prospect_question_plan:[
  {question_id:'Q1',text:'Which systems are anticipated in scope for this SOC 2 readiness project?',strategy_alignment:'Boundary'},
  {question_id:'Q2',text:'Who is the project decision owner, and are budget or dates established?',strategy_alignment:'Feasibility'}
 ],
 intelligence_lineage:[{evidence_id:'BOOK-001',source:'BOOKING_TEXT',description:'Canonical booking'},{evidence_id:'PROS-001',source:'PROSPECT_REPORTED',description:'Accepted answer'}],
 deterministic_metrics:{supported_match:'50/100',scorable_coverage:'50/100',evidence_completeness:'74.75/100'},
 preliminary_brief_markdown:'Summary available.'
};
const booking='Enterprise buyer requested security assurance materials. We need to decide whether questionnaire support or a formal SOC 2 readiness project is appropriate.';
test('historical thin FINALIZE remains commercial review rather than certified',()=>{
 const r=reviewDecisionQuality(fixture,{trustedBookingText:'Synthetic CLARIS rehearsal; do not contact a prospect.'});
 assert.equal(r.status,'HOLD_FOR_COMMERCIAL_REVIEW');
 assert.equal(r.auto_send_allowed,false);
 assert.ok(r.missing.includes('discovery'));
 assert.equal(r.buyer_deliverable_fork.required,false);
});
test('PostHog-like actual two-question output fails buyer deliverable differential',()=>{
 const r=reviewDecisionQuality(posthogLike,{trustedBookingText:booking});
 assert.equal(r.status,'HOLD_FOR_COMMERCIAL_REVIEW');
 assert.equal(r.question_count,2);
 assert.equal(r.buyer_deliverable_fork.open,true);
 assert.ok(r.missing.includes('buyer_assurance_deliverable_fork'));
 assert.deepEqual(r.buyer_deliverable_fork.reviewer_question.basis_ids,['BOOK-001']);
 assert.equal(r.buyer_deliverable_fork.reviewer_question.origin,'DETERMINISTIC_REVIEW_SUGGESTION');
});
test('explicit original FINALIZE question may resolve the fork but cannot certify shallow brief',()=>{
 const a=structuredClone(posthogLike);
 a.prospect_question_plan.unshift({question_id:'Q0',text:'What did the buyer actually request: a questionnaire or a SOC 2 Type II report?',strategy_alignment:'Differentiate required deliverable'});
 const r=reviewDecisionQuality(a,{trustedBookingText:booking});
 assert.equal(r.buyer_deliverable_fork.open,false);
 assert.equal(r.buyer_deliverable_fork.reviewer_question,null);
 assert.equal(r.status,'HOLD_FOR_COMMERCIAL_REVIEW');
});
test('untrusted booking or absent BOOK-001 can never unlock gate',()=>{
 const a=structuredClone(posthogLike);
 a.intelligence_lineage=a.intelligence_lineage.filter(x=>x.evidence_id!=='BOOK-001');
 const r=reviewDecisionQuality(a,{trustedBookingText:booking});
 assert.equal(r.status,'BOOKING_AUTHORITY_REQUIRED');
 assert.equal(r.auto_send_allowed,false);
 assert.equal(r.buyer_deliverable_fork.required,false);
});
test('no assumed extra questions, fake sources, or email permission',()=>{
 const before=JSON.stringify(posthogLike);
 const r=reviewDecisionQuality(posthogLike,{trustedBookingText:booking});
 assert.equal(JSON.stringify(posthogLike),before);
 assert.equal(r.mandatory_ai_reexecution,false);
 assert.equal(r.production_delivery_authorized,false);
});
