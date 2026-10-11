import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderFinalBrief } from '../final-brief-renderer.mjs';
import { previewPersistedOpportunityDiscovery } from '../admin-discovery-preview.mjs';

const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'));
const soc2=fixture('fictional-soc2-advisory-final.json');
const rehearsal=fixture('oct10-finalize-live-actual.json');
const ID='claris_preview_fixture_01';
const REQUEST='We need SOC 2 readiness ahead of an enterprise customer security assessment; help define scope and evidence priorities.';
const NO_CONTACT='Synthetic CLARIS MVP rehearsal. The company is Tailead; test research and call preparation only. Do not contact the prospect.';

function envelope(booking=REQUEST, artifact=soc2) {
  const e = {
    schema_version:'claris_clarification_envelope_v1',
    opportunity_id:ID,
    package:{status:'SUBMITTED'},
    response:{submitted_at:'2026-10-10T00:00:00Z',answers:[]},
    finalize_context:{
      schema_version:'claris_finalize_context_v1',
      case_state_json:JSON.stringify({
        booking_text_exact:booking,
        canonical_truth_json:JSON.stringify({
          booking_evidence:[{
            authority:'BOOKING_TEXT',statement:booking,exact_basis:booking,
            evidence_id:'BOOK-001',resolvable:true
          }]
        })
      })
    },
    final_intelligence:{
      schema_version:'claris_final_intelligence_snapshot_v1',
      opportunity_id:ID,
      source:'GOVERNED_FINALIZE',
      status:'FINALIZED',final_stage:'FINALIZE',
      final_stage_output_json:JSON.stringify(artifact),
      final_brief_markdown:renderFinalBrief(artifact).brief_markdown,
      final_audit_json:JSON.stringify({
        audit_status:'PASS',repair_required:false,violations:[]
      })
    }
  };
  return seal(e);
}

function seal(e) {
  const hash=x=>createHash('sha256').update(x,'utf8').digest('hex');
  const snapshot=e.final_intelligence;
  snapshot.integrity_version='sha256-v1';
  snapshot.artifact_sha256=hash(snapshot.final_stage_output_json);
  snapshot.markdown_sha256=hash(snapshot.final_brief_markdown);
  snapshot.audit_sha256=hash(snapshot.final_audit_json);
  snapshot.booking_sha256=hash(JSON.parse(e.finalize_context.case_state_json).booking_text_exact);
  return e;
}

function repository(value, journal=[]) {
  return {
    async loadEnvelopeWithMeta(opportunityId) {
      journal.push(['load', opportunityId]);
      return { envelope:value,etag:'some-existing-etag' };
    },
    async saveEnvelopeWithMeta(...args) {
      journal.push(['UNEXPECTED_WRITE',args.length]);
      throw new Error('PREVIEW_MUST_NOT_WRITE');
    }
  };
}

test('persisted commercial case yields safe read-only consultant review previews',async()=>{
  const e=envelope();
  e.final_intelligence.final_stage_output_json=JSON.stringify({
    ...soc2,
    claris_final_brief:{
      ...soc2.claris_final_brief,
      discovery_question_plan:[soc2.claris_final_brief.discovery_question_plan[1]]
    }
  });
  e.final_intelligence.final_brief_markdown=renderFinalBrief(e.final_intelligence.final_stage_output_json).brief_markdown;
  seal(e);
  const journal=[];
  const result=await previewPersistedOpportunityDiscovery(ID,{repository:repository(e,journal)});
  assert.equal(result.http_status,200);
  assert.equal(result.ok,true);
  assert.equal(result.status,'PREVIEW_READY');
  assert.equal(result.draft_status,'DRAFTS_FOR_REVIEW');
  assert.equal(result.final_questions.length,1);
  assert.equal(result.review_drafts.length,4);
  assert.equal(result.no_auto_send,true);
  assert.equal(result.booking_assurance,'INTERNAL_CANONICAL_AGREEMENT_ONLY');
  assert.deepEqual(journal,[['load',ID]]);
  assert.equal(JSON.stringify(result).includes('case_state_json'),false);
  assert.equal(JSON.stringify(result).includes('consultant_delivery_email'),false);
});

test('real October 10 no-contact rehearsal has zero drafted questions',async()=>{
  const result=await previewPersistedOpportunityDiscovery(ID,{
    repository:repository(envelope(NO_CONTACT,rehearsal))
  });
  assert.equal(result.http_status,200);
  assert.equal(result.status,'SCOPE_RESTRICTED');
  assert.equal(result.review_drafts.length,0);
  assert.equal(result.commercial_readiness_status,'NOT_COMMERCIAL_BENCHMARK');
  assert.equal(result.no_auto_send,true);
});

test('current persisted submission without a stored FINALIZE artifact does not invent one',async()=>{
  const e=envelope();
  delete e.final_intelligence;
  const journal=[];
  const result=await previewPersistedOpportunityDiscovery(ID,{repository:repository(e,journal)});
  assert.equal(result.http_status,409);
  assert.equal(result.status,'FINAL_ARTIFACT_NOT_PERSISTED');
  assert.equal(result.error,'GOVERNED_FINAL_SNAPSHOT_REQUIRED');
  assert.equal(result.review_drafts,undefined);
  assert.deepEqual(journal,[['load',ID]]);
});

test('artifact tampering, provenance mismatch or failed audit fail closed',async()=>{
  const variants=[
    e=>{e.final_intelligence.opportunity_id='other-opportunity';},
    e=>{e.final_intelligence.final_brief_markdown+='\\nFALSIFIED';},
    e=>{e.final_intelligence.final_audit_json='{"audit_status":"FAIL"}';},
    e=>{e.final_intelligence.final_stage='PREPARE';},
    e=>{e.final_intelligence.final_stage_output_json='{invalid-json';}
  ];
  for(const change of variants) {
    const e=envelope(); change(e);
    const result=await previewPersistedOpportunityDiscovery(ID,{repository:repository(e)});
    assert.equal(result.http_status,409);
    assert.equal(result.status,'FINAL_ARTIFACT_SNAPSHOT_INVALID');
    assert.equal(result.review_drafts,undefined);
  }
});

test('opportunity validation, pending cases and missing envelope fail closed without writes',async()=>{
  let calls=0;
  const spy={loadEnvelopeWithMeta:async()=>{calls++;throw Error('should not run');}};
  assert.equal((await previewPersistedOpportunityDiscovery('../x',{repository:spy})).http_status,400);
  assert.equal(calls,0);
  assert.equal((await previewPersistedOpportunityDiscovery(ID,{repository:repository(null)})).http_status,404);
  const e=envelope();e.package.status='OPEN';e.response=null;
  const result=await previewPersistedOpportunityDiscovery(ID,{repository:repository(e)});
  assert.equal(result.status,'SUBMISSION_NOT_ESTABLISHED');
  assert.equal(result.http_status,409);
});

test('internally conflicting booking text refuses preview even with otherwise valid final',async()=>{
  const e=envelope();
  const state=JSON.parse(e.finalize_context.case_state_json);
  state.booking_text_exact='Altered booking';
  e.finalize_context.case_state_json=JSON.stringify(state);
  const result=await previewPersistedOpportunityDiscovery(ID,{repository:repository(e)});
  assert.equal(result.status,'BOOKING_CONTEXT_UNVERIFIED');
  assert.equal(result.http_status,409);
  assert.equal(result.review_drafts,undefined);
});

test('all dependency errors are redacted and no mutation methods are invoked',async()=>{
  const result=await previewPersistedOpportunityDiscovery(ID,{
    repository:{loadEnvelopeWithMeta:async()=>{throw Error('private-storage-bucket-key');}}
  });
  assert.equal(result.http_status,500);
  assert.equal(result.error,'PREVIEW_REPOSITORY_READ_FAILED');
  assert.doesNotMatch(JSON.stringify(result),/private-storage-bucket-key/);
});
