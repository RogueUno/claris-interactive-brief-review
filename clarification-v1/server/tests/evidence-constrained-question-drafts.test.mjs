import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draftEvidenceConstrainedQuestions } from '../evidence-constrained-question-drafts.mjs';

const load = name => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url),'utf8'));
const commercial = load('fictional-soc2-advisory-final.json');
const oct10 = load('oct10-finalize-live-actual.json');
const oct09 = load('oct09-finalize-actual.json');
const booking = (verbatim_text, source_id='BOOK-001') => ({
  origin:'PERSISTED_BOOKING', source_id, verbatim_text
});
const soc2 = 'We need SOC 2 readiness ahead of an enterprise customer security assessment; help define scope and evidence priorities.';
const trimmed = () => {
  const copy=structuredClone(commercial);
  copy.claris_final_brief.discovery_question_plan=[
    copy.claris_final_brief.discovery_question_plan[1]
  ];
  return copy;
};

test('one existing SOC2 scope question leads to four clearly marked drafts from open dimensions',()=>{
  const input=trimmed();
  const outcome=draftEvidenceConstrainedQuestions(input,{booking:booking(soc2)});
  assert.equal(outcome.status,'DRAFTS_FOR_REVIEW');
  assert.equal(outcome.mode,'OFFLINE_ADVISORY_ONLY');
  assert.equal(outcome.existing_selected_count,1);
  assert.equal(outcome.draft_count,4);
  assert.deepEqual(outcome.drafts.map(x=>x.topic),[
    'buyer_outcome','stakeholder_authority','timing','commercial_feasibility'
  ]);
  for (const item of outcome.drafts) {
    assert.equal(item.origin,'DETERMINISTIC_QUESTION_DRAFT');
    assert.equal(item.status,'CONSULTANT_REVIEW_REQUIRED');
    assert.ok(item.question.includes('SOC 2 readiness'));
    assert.equal(item.basis.booking_source_id,'BOOK-001');
    assert.equal(item.basis.verified_by_module,false);
    assert.ok(!/already failed|is inadequate|definitely|you must/i.test(item.question));
  }
  assert.ok(outcome.unfilled_topics.includes('existing_evidence'));
  assert.equal(trimmed().claris_final_brief.discovery_question_plan.length,1);
});

test('existing five targeted questions are never expanded or overwritten',()=>{
  const outcome=draftEvidenceConstrainedQuestions(commercial,{booking:booking(soc2)});
  assert.equal(outcome.status,'NO_REMAINING_SLOTS');
  assert.equal(outcome.draft_count,0);
  assert.equal(outcome.existing_selected_count,5);
});

test('real Oct10 explicitly no-contact rehearsal never gets commercial prompts',()=>{
  const text='Synthetic CLARIS MVP rehearsal. The company is Tailead; test research and call preparation only. Do not contact the prospect.';
  const r=draftEvidenceConstrainedQuestions(oct10,{booking:booking(text)});
  assert.equal(r.status,'SCOPE_RESTRICTED');
  assert.equal(r.draft_count,0);
});

test('real Oct09 rehearsal never gets commercial prompts either',()=>{
  const r=draftEvidenceConstrainedQuestions(oct09,{booking:booking('Rehearsal only: simulated SOC 2 readiness. Do not contact the prospect.')});
  assert.equal(r.status,'SCOPE_RESTRICTED');
  assert.equal(r.draft_count,0);
});

test('AI artifact cannot substitute for persisted booking evidence',()=>{
  const r=draftEvidenceConstrainedQuestions(trimmed());
  assert.equal(r.status,'TRUSTED_BOOKING_REQUIRED');
  assert.equal(r.draft_count,0);
  const fake=draftEvidenceConstrainedQuestions(trimmed(),{booking:{
    origin:'MODEL_SUMMARY',source_id:'BOOK-001',verbatim_text:soc2
  }});
  assert.equal(fake.status,'TRUSTED_BOOKING_REQUIRED');
});

test('unsupported needs, conflicting services and negated intent all fail closed',()=>{
  const unsupported=draftEvidenceConstrainedQuestions(trimmed(),{booking:booking('Need help with our security posture.')});
  assert.equal(unsupported.status,'SCOPE_UNSUPPORTED_OR_AMBIGUOUS');
  const conflict=draftEvidenceConstrainedQuestions(trimmed(),{booking:booking('Help with ISO 27001 preparation and evidence.')});
  assert.equal(conflict.status,'SCOPE_CONFLICT_WITH_FINALIZE');
  const negated=draftEvidenceConstrainedQuestions(trimmed(),{booking:booking('We do not need SOC 2 readiness; assess something else.')});
  assert.equal(negated.status,'NEGATED_SCOPE');
  const ambiguous=draftEvidenceConstrainedQuestions(trimmed(),{booking:booking('We need SOC 2 readiness and ISO 27001 preparation.')});
  assert.equal(ambiguous.status,'SCOPE_UNSUPPORTED_OR_AMBIGUOUS');
});

test('source cross-reference is mandatory but explicitly not proof of authenticity',()=>{
  const input=trimmed();
  const r=draftEvidenceConstrainedQuestions(input,{booking:booking(soc2,'BOOK-999')});
  assert.equal(r.status,'TRUSTED_BOOKING_REQUIRED');
  input.claris_final_brief.intelligence_lineage=[];
  const missing=draftEvidenceConstrainedQuestions(input,{booking:booking(soc2)});
  assert.equal(missing.status,'BOOKING_REFERENCE_NOT_DECLARED');
});

test('an artifact without unresolved dimensions does not authorize speculative drafts',()=>{
  const input=trimmed();
  input.claris_final_brief.match_score_explanation.match_breakdown={
    service_need_alignment:{status:'MATCH',basis_ids:['BOOK-001']}
  };
  const result=draftEvidenceConstrainedQuestions(input,{booking:booking(soc2)});
  assert.equal(result.status,'NO_DOCUMENTED_OPEN_GAPS');
  assert.equal(result.draft_count,0);
});
