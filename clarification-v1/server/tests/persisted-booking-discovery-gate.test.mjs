import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  extractPersistedBookingContext,
  draftFromPersistedBookingContext
} from '../persisted-booking-discovery-gate.mjs';

const load=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'));
const synthetic=load('oct10-finalize-live-actual.json');
const base=load('fictional-soc2-advisory-final.json');
const soc2='We need SOC 2 readiness ahead of an enterprise customer security assessment; help define scope and evidence priorities.';
const noContact='Synthetic CLARIS MVP rehearsal. The company is Tailead; test research and call preparation only. Do not contact the prospect.';

function envelope(bookingText) {
  return {
    finalize_context:{
      schema_version:'claris_finalize_context_v1',
      case_state_json:JSON.stringify({
        booking_text_exact:bookingText,
        canonical_truth_json:JSON.stringify({
          booking_evidence:[{
            authority:'BOOKING_TEXT',
            statement:bookingText,
            exact_basis:bookingText,
            evidence_id:'BOOK-001',
            resolvable:true
          }]
        })
      })
    }
  };
}

test('certified case-state agreement retains original synthetic no-contact boundary',()=>{
  const verified=extractPersistedBookingContext(envelope(noContact));
  assert.equal(verified.ok,true);
  assert.equal(verified.assurance,'INTERNAL_CANONICAL_AGREEMENT_ONLY');
  assert.equal(verified.booking.verbatim_text,noContact);
  const result=draftFromPersistedBookingContext(synthetic,envelope(noContact));
  assert.equal(result.status,'SCOPE_RESTRICTED');
  assert.equal(result.draft_count,0);
});

test('reduced fictional commercial brief generates drafts only through internally consistent envelope',()=>{
  const input=structuredClone(base);
  input.claris_final_brief.discovery_question_plan=[input.claris_final_brief.discovery_question_plan[1]];
  const result=draftFromPersistedBookingContext(input,envelope(soc2));
  assert.equal(result.status,'DRAFTS_FOR_REVIEW');
  assert.equal(result.draft_count,4);
  assert.equal(result.booking_assurance,'INTERNAL_CANONICAL_AGREEMENT_ONLY');
  assert.ok(result.drafts.every(q=>q.basis.verified_by_module===false));
});

test('conflicting model or rewritten booking cannot escape canonical mismatch',()=>{
  const env=envelope(soc2);
  const state=JSON.parse(env.finalize_context.case_state_json);
  state.booking_text_exact='We need vCISO advisory support.';
  env.finalize_context.case_state_json=JSON.stringify(state);
  const extracted=extractPersistedBookingContext(env);
  assert.equal(extracted.ok,false);
  assert.equal(extracted.reason,'BOOKING_EVIDENCE_MISMATCH');
  assert.equal(draftFromPersistedBookingContext(base,env).draft_count,0);
});

test('missing envelope, missing context and malformed JSON fail closed',()=>{
  for (const input of [null,{}, {finalize_context:{schema_version:'wrong'}},
    {finalize_context:{schema_version:'claris_finalize_context_v1',case_state_json:'{broken'}}]) {
    assert.equal(extractPersistedBookingContext(input).ok,false);
    const preview=draftFromPersistedBookingContext(base,input);
    assert.equal(preview.status,'BOOKING_CONTEXT_UNVERIFIED');
    assert.equal(preview.draft_count,0);
  }
});

test('missing canonical provenance and non-resolvable BOOK-001 are rejected',()=>{
  const env=envelope(soc2);
  const state=JSON.parse(env.finalize_context.case_state_json);
  state.canonical_truth_json=JSON.stringify({booking_evidence:[{
    evidence_id:'BOOK-001',authority:'BOOKING_TEXT',statement:soc2,exact_basis:soc2,
    resolvable:false
  }]});
  env.finalize_context.case_state_json=JSON.stringify(state);
  assert.equal(extractPersistedBookingContext(env).reason,'BOOKING_EVIDENCE_MISMATCH');
});

test('booking text must be exact: no trimmed or silently rewritten wording',()=>{
  const env=envelope(' '+soc2);
  assert.equal(extractPersistedBookingContext(env).reason,'BOOKING_TEXT_NOT_CANONICAL');
});
