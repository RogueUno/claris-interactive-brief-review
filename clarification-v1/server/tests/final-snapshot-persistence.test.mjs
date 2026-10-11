import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderFinalBrief } from '../final-brief-renderer.mjs';
import { verifyFinalSnapshot, persistGovernedFinalSnapshot } from '../final-snapshot-persistence.mjs';
import { previewPersistedOpportunityDiscovery } from '../admin-discovery-preview.mjs';

const artifact = JSON.parse(readFileSync(new URL('./fixtures/fictional-soc2-advisory-final.json',import.meta.url),'utf8'));
const id='claris_final_snapshot_fixture_20261011';
const booking='We need SOC 2 readiness ahead of an enterprise customer security assessment; help define scope and evidence priorities.';
const audit=JSON.stringify({audit_status:'PASS',repair_required:false,violations:[]});
const markdown=renderFinalBrief(artifact).brief_markdown;
function envelope() {
  return {
    schema_version:'claris_clarification_envelope_v1', opportunity_id:id,
    package:{status:'SUBMITTED',consultant:{consultant_id:'test_consultant'}},
    response:{submitted_at:'2026-10-10T00:00:00Z',answers:[]},
    finalize_context:{
      schema_version:'claris_finalize_context_v1',
      consultant_sot_json:JSON.stringify({services:[{service_id:'SVC_SOC2'}]}),
      case_state_json:JSON.stringify({
        booking_text_exact:booking,
        canonical_truth_json:JSON.stringify({
          booking_evidence:[{evidence_id:'BOOK-001',authority:'BOOKING_TEXT',
            statement:booking,exact_basis:booking,resolvable:true}],
          canonical_evidence_registry:[]
        })
      })
    },
    final_delivery_receipt:null
  };
}
function payload(override={}) {
  return {
    opportunity_id:id, expected_opportunity_version:'etag-one',
    status:'FINALIZED',final_stage:'FINALIZE',
    final_stage_output_json:JSON.stringify(artifact),
    final_brief_markdown:markdown, final_audit_json:audit, ...override
  };
}
function memory(initial=envelope()) {
  let stored=structuredClone(initial), version=1, writes=0;
  const log=[];
  const repository={
    async loadEnvelopeWithMeta(requested) {
      log.push('load');
      assert.equal(requested,id);
      return {envelope:stored ? structuredClone(stored):null,etag:'etag-'+(version===1?'one':version)};
    },
    async saveEnvelopeWithMeta(requested,next,{ifMatch}) {
      log.push('save');
      assert.equal(requested,id);
      assert.equal(ifMatch,'etag-'+(version===1?'one':version));
      writes++;
      stored=structuredClone(next);
      version++;
      return {envelope:stored,etag:'etag-'+version};
    }
  };
  return {repository,log,read:()=>structuredClone(stored),writes:()=>writes};
}
test('first accepted FINALIZE snapshot writes once with ETag, integrity digests and no delivery receipt',async()=>{
  const db=memory();
  const r=await persistGovernedFinalSnapshot(payload(),{repository:db.repository});
  assert.equal(r.status,'STORED');assert.equal(r.ok,true);
  assert.deepEqual(db.log,['load','save']);
  assert.equal(db.writes(),1);
  const saved=db.read();
  assert.equal(saved.final_delivery_receipt,null);
  const snap=saved.final_intelligence;
  assert.equal(snap.source,'GOVERNED_FINALIZE');
  assert.equal(snap.integrity_version,'sha256-v1');
  assert.equal(typeof snap.artifact_sha256,'string');
  assert.equal(verifyFinalSnapshot(snap,id,{bookingText:booking}).ok,true);
  const preview=await previewPersistedOpportunityDiscovery(id,{repository:db.repository});
  assert.equal(preview.status,'PREVIEW_READY');
  assert.equal(preview.review_drafts.length,0);
  assert.equal(preview.no_auto_send,true);
  assert.equal(db.writes(),1);
});
test('same exact artifact replay is idempotent, even after ETag changed',async()=>{
  const db=memory();
  await persistGovernedFinalSnapshot(payload(),{repository:db.repository});
  const again=await persistGovernedFinalSnapshot(payload(),{repository:db.repository});
  assert.equal(again.status,'ALREADY_STORED');
  assert.equal(db.writes(),1);
});
test('different finalized intelligence cannot replace an existing snapshot',async()=>{
  const db=memory();
  await persistGovernedFinalSnapshot(payload(),{repository:db.repository});
  const different=payload({final_audit_json:JSON.stringify({...JSON.parse(audit),summary:'different'})});
  const r=await persistGovernedFinalSnapshot(different,{repository:db.repository});
  assert.equal(r.status,'CONFLICT');
  assert.equal(r.error,'DIFFERENT_FINAL_SNAPSHOT_EXISTS');
  assert.equal(db.writes(),1);
});
test('concurrent CAS conflict is reported, never retried with overwrite',async()=>{
  const db=memory();
  db.repository.saveEnvelopeWithMeta=async()=>{const e=new Error('BLOB_PRECONDITION_FAILED');e.code='BLOB_PRECONDITION_FAILED';throw e;};
  const r=await persistGovernedFinalSnapshot(payload(),{repository:db.repository});
  assert.equal(r.status,'CONFLICT');
  assert.equal(r.error,'FINAL_SNAPSHOT_CONCURRENT_WRITE');
  assert.equal(db.writes(),0);
});
test('lost atomic version or stale version blocks without writes',async()=>{
  const db=memory();
  assert.equal((await persistGovernedFinalSnapshot(payload({expected_opportunity_version:'stale'}),{repository:db.repository})).error,'FINAL_SNAPSHOT_VERSION_MISMATCH');
  const noVersion={loadEnvelopeWithMeta:async()=>({envelope:envelope(),etag:null}),saveEnvelopeWithMeta:()=>{throw Error('write attempted');}};
  assert.equal((await persistGovernedFinalSnapshot(payload(),{repository:noVersion})).error,'FINAL_SNAPSHOT_ETAG_REQUIRED');
  assert.equal(db.writes(),0);
});
test('pending submission and preexisting delivery reservation cannot be modified',async()=>{
  const pending=envelope();pending.package.status='OPEN';pending.response=null;
  assert.equal((await persistGovernedFinalSnapshot(payload(),{repository:memory(pending).repository})).error,'PROSPECT_SUBMISSION_REQUIRED');
  const reserved=envelope();reserved.final_delivery_receipt={schema_version:'claris_final_delivery_receipt_v1',status:'RESERVED'};
  const db=memory(reserved);
  assert.equal((await persistGovernedFinalSnapshot(payload(),{repository:db.repository})).error,'FINAL_DELIVERY_RECEIPT_ALREADY_EXISTS');
  assert.equal(db.writes(),0);
});
test('failed audit, forged markdown and malformed artifact cannot be persisted',async()=>{
  const db=memory();
  for(const inp of [
    payload({final_audit_json:'{"audit_status":"FAIL","violations":[]}'}),
    payload({final_audit_json:'{"audit_status":"PASS","repair_required":true,"violations":[]}'}),
    payload({final_brief_markdown:'placeholder'}),
    payload({final_stage_output_json:'{garbage'}),
    payload({status:'PREPARE'}),
    payload({final_stage:'PREPARE'})
  ]) {
    const r=await persistGovernedFinalSnapshot(inp,{repository:db.repository});
    assert.equal(r.status,'BLOCKED');
  }
  assert.equal(db.writes(),0);
});
test('unadmitted public source or unbound reported PROS reference is not trusted',async()=>{
  const tainted=structuredClone(artifact);
  tainted.claris_final_brief.intelligence_lineage.push({source_id:'FAC-001',authority:'PUBLIC',usage:'unadmitted data'});
  const db=memory();
  assert.equal((await persistGovernedFinalSnapshot(payload({
    final_stage_output_json:JSON.stringify(tainted),
    final_brief_markdown:renderFinalBrief(tainted).brief_markdown
  }),{repository:db.repository})).error,'FINALIZE_PROVENANCE_UNRESOLVED');
  tainted.claris_final_brief.intelligence_lineage.pop();
  tainted.claris_final_brief.intelligence_lineage.push({source_id:'PROS-001',authority:'PROSPECT_REPORTED',usage:'unbound claim'});
  assert.equal((await persistGovernedFinalSnapshot(payload({
    final_stage_output_json:JSON.stringify(tainted),
    final_brief_markdown:renderFinalBrief(tainted).brief_markdown
  }),{repository:db.repository})).error,'FINALIZE_PROVENANCE_UNRESOLVED');
  assert.equal(db.writes(),0);
});
test('unknown service source is rejected until persisted consultant SoT declares it',async()=>{
  const e=envelope();
  e.finalize_context.consultant_sot_json=JSON.stringify({services:[]});
  const db=memory(e);
  const r=await persistGovernedFinalSnapshot(payload(),{repository:db.repository});
  assert.equal(r.error,'FINALIZE_PROVENANCE_UNRESOLVED');
});
test('tampering with stored snapshot hashes or booking binding is detected',async()=>{
  const db=memory();
  await persistGovernedFinalSnapshot(payload(),{repository:db.repository});
  const snapshot=db.read().final_intelligence;
  assert.equal(verifyFinalSnapshot({...snapshot,artifact_sha256:'0'.repeat(64)},id,{bookingText:booking}).ok,false);
  assert.equal(verifyFinalSnapshot(snapshot,id,{bookingText:booking+' changed'}).error,'FINAL_SNAPSHOT_BOOKING_MISMATCH');
  assert.equal(verifyFinalSnapshot({...snapshot,integrity_version:null},id,{bookingText:booking}).error,'FINAL_SNAPSHOT_INTEGRITY_REQUIRED');
});
test('unknown persistence result reports uncertainty and never retries',async()=>{
  let calls=0;const db=memory();
  db.repository.saveEnvelopeWithMeta=async()=>{calls++;throw new Error('opaque-private-write-error');};
  const r=await persistGovernedFinalSnapshot(payload(),{repository:db.repository});
  assert.equal(r.error,'FINAL_SNAPSHOT_WRITE_UNCERTAIN');
  assert.equal(calls,1);
  assert.doesNotMatch(JSON.stringify(r),/opaque-private-write-error/);
});
