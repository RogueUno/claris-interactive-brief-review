import { createHash } from 'node:crypto';
import { parseFinalArtifact, normalizeFinalArtifact, renderFinalBrief } from './final-brief-renderer.mjs';
import { extractPersistedBookingContext } from './persisted-booking-discovery-gate.mjs';
import { deriveAcceptedProspectManifest } from './accepted-prospect-evidence.mjs';

export const FINAL_SNAPSHOT_VERSION = 'claris_final_intelligence_snapshot_v1';
const ID = /^[A-Za-z0-9_-]{3,100}$/;
const MAX_ARTIFACT_BYTES = 180000;
const MAX_MARKDOWN_BYTES = 220000;
const MAX_AUDIT_BYTES = 25000;
const sha256 = value => createHash('sha256').update(value,'utf8').digest('hex');
const result = (status, extra={}) => ({
  ok: status === 'STORED' || status === 'ALREADY_STORED',
  status, ...extra
});
const isCollision = e => e?.code === 'BLOB_PRECONDITION_FAILED' ||
  e?.message === 'BLOB_PRECONDITION_FAILED';
function bounded(value, max) {
  return typeof value === 'string' && value.length > 0 &&
    Buffer.byteLength(value,'utf8') <= max;
}
function auditPass(raw) {
  try {
    if (!bounded(raw,MAX_AUDIT_BYTES)) return false;
    const audit = JSON.parse(raw);
    return audit && !Array.isArray(audit) &&
      audit.audit_status === 'PASS' && audit.repair_required === false &&
      Array.isArray(audit.violations) && audit.violations.length === 0;
  } catch { return false; }
}

export function verifyFinalSnapshot(snapshot, opportunityId, { bookingText = null, envelope = null } = {}) {
  if (!snapshot || snapshot.schema_version !== FINAL_SNAPSHOT_VERSION ||
    snapshot.opportunity_id !== opportunityId ||
    snapshot.source !== 'GOVERNED_FINALIZE' ||
    snapshot.status !== 'FINALIZED' || snapshot.final_stage !== 'FINALIZE' ||
    !bounded(snapshot.final_stage_output_json,MAX_ARTIFACT_BYTES) ||
    !bounded(snapshot.final_brief_markdown,MAX_MARKDOWN_BYTES) ||
    !auditPass(snapshot.final_audit_json)) {
    return { ok:false, error:'FINAL_SNAPSHOT_CONTRACT_INVALID' };
  }
  try {
    const rendered=renderFinalBrief(snapshot.final_stage_output_json);
    if (rendered.brief_markdown !== snapshot.final_brief_markdown.trim()) {
      return { ok:false, error:'FINAL_SNAPSHOT_RENDER_MISMATCH' };
    }
    if (snapshot.integrity_version === 'sha256-v1') {
      if (snapshot.artifact_sha256 !== sha256(snapshot.final_stage_output_json) ||
        snapshot.markdown_sha256 !== sha256(snapshot.final_brief_markdown) ||
        snapshot.audit_sha256 !== sha256(snapshot.final_audit_json) ||
        typeof snapshot.booking_sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(snapshot.booking_sha256)) {
        return { ok:false, error:'FINAL_SNAPSHOT_INTEGRITY_MISMATCH' };
      }
      if (bookingText !== null && snapshot.booking_sha256 !== sha256(bookingText)) {
        return { ok:false, error:'FINAL_SNAPSHOT_BOOKING_MISMATCH' };
      }
    } else {
      // Do not silently certify older unbound records as governed persistence.
      return { ok:false, error:'FINAL_SNAPSHOT_INTEGRITY_REQUIRED' };
    }
    // Re-check against the currently persisted accepted response at read time.
    // An answer changed since the immutable FINALIZE must invalidate preview.
    const accepted=deriveAcceptedProspectManifest(envelope);
    if(!accepted.ok || snapshot.prospect_binding_version!=='claris_accepted_prospect_manifest_v1' ||
      snapshot.accepted_prospect_binding_sha256!==accepted.binding_sha256) {
      return {ok:false,error:'FINAL_SNAPSHOT_PROSPECT_BINDING_INVALID'};
    }
    const normalized=normalizeFinalArtifact(snapshot.final_stage_output_json);
    if (!normalized.intelligence_lineage.some(item=>item.source_id==='BOOK-001') ||
        normalized.intelligence_lineage.some(item=>!item.source_id)) {
      return {ok:false,error:'FINAL_SNAPSHOT_BOOKING_LINEAGE_MISSING'};
    }
    return {ok:true,artifact:rendered.normalized};
  } catch {
    return {ok:false,error:'FINAL_SNAPSHOT_RENDER_INVALID'};
  }
}

// The persisted evidence catalog is an allowed-reference list, not proof that
// any stated fact is correct. Unrecognized evidence is rejected, not repaired.
function declaredSourceIds(envelope, accepted) {
  let state, truth, sot;
  try {
    state=JSON.parse(envelope.finalize_context.case_state_json);
    truth=JSON.parse(state.canonical_truth_json);
    sot=JSON.parse(envelope.finalize_context.consultant_sot_json);
  } catch { return null; }
  if (!truth || typeof truth!=='object' || !sot || typeof sot!=='object') return null;
  const ids=new Set(['BOOK-001']);
  for (const item of Array.isArray(truth.canonical_evidence_registry) ?
      truth.canonical_evidence_registry : []) {
    if (item?.admission_status==='ADMITTED' &&
      /^[A-Z]{2,8}-[0-9]{3,}$/.test(String(item.evidence_id || ''))) {
      ids.add(item.evidence_id);
    }
  }
  // Service references must originate in the consultant's persisted SoT,
  // not in FINALIZE's self-reported recommendation.
  function serviceWalk(item, depth=0) {
    if (!item || typeof item!=='object' || depth>9) return;
    if (Array.isArray(item)) return item.forEach(value=>serviceWalk(value,depth+1));
    if (typeof item.service_id==='string' && /^SVC_[A-Za-z0-9_-]+$/.test(item.service_id)) {
      ids.add(item.service_id);
    }
    Object.values(item).forEach(value=>serviceWalk(value,depth+1));
  }
  serviceWalk(sot);
  // No source ID from model text can authorize itself. The accepted response
  // manifest supplies the PROS ordinals; no answer means no PROS references.
  for(const entry of accepted.entries) ids.add(entry.evidence_id);
  return ids;
}

function payloadValidation(input, envelope, bookingText) {
  if (input?.status !== 'FINALIZED' || input?.final_stage !== 'FINALIZE' ||
    !bounded(input.final_stage_output_json,MAX_ARTIFACT_BYTES) ||
    !bounded(input.final_brief_markdown,MAX_MARKDOWN_BYTES) ||
    !auditPass(input.final_audit_json)) {
    return {ok:false,error:'FINALIZE_CERTIFICATION_REQUIRED'};
  }
  let parsed;
  try { parsed=parseFinalArtifact(input.final_stage_output_json); }
  catch { return {ok:false,error:'FINALIZE_ARTIFACT_INVALID'}; }
  const normalized=normalizeFinalArtifact(parsed);
  if (!normalized.intelligence_lineage.length ||
    !normalized.intelligence_lineage.some(item=>item.source_id==='BOOK-001') ||
    normalized.intelligence_lineage.some(item=>!item.source_id)) {
    return {ok:false,error:'FINALIZE_PROVENANCE_REQUIRED'};
  }
  const accepted=deriveAcceptedProspectManifest(envelope);
  if (!accepted.ok) return {ok:false,error:accepted.error};
  const allowable=declaredSourceIds(envelope,accepted);
  if (!allowable || normalized.intelligence_lineage.some(item=>!allowable.has(item.source_id))) {
    return {ok:false,error:'FINALIZE_PROVENANCE_UNRESOLVED'};
  }
  // Match-dimension basis IDs cannot bypass the same persisted evidence catalog.
  for(const item of Object.values(normalized.match_classifications)) {
    if(!item || typeof item!=='object') continue;
    for(const ref of Array.isArray(item.basis_ids) ? item.basis_ids : []) {
      if(typeof ref!=='string' || !allowable.has(ref)) {
        return {ok:false,error:'FINALIZE_MATCH_BASIS_UNRESOLVED'};
      }
    }
  }
  // Require current renderer's exact output. No re-writing or accepting an old
  // markdown that differs after a renderer upgrade.
  try {
    if (renderFinalBrief(parsed).brief_markdown !== input.final_brief_markdown.trim()) {
      return {ok:false,error:'FINALIZE_RENDER_MISMATCH'};
    }
  } catch {return {ok:false,error:'FINALIZE_RENDER_INVALID'};}
  const record={
    schema_version:FINAL_SNAPSHOT_VERSION,
    opportunity_id:input.opportunity_id,
    source:'GOVERNED_FINALIZE',
    status:'FINALIZED',final_stage:'FINALIZE',
    final_stage_output_json:input.final_stage_output_json,
    final_brief_markdown:input.final_brief_markdown,
    final_audit_json:input.final_audit_json,
    integrity_version:'sha256-v1',
    artifact_sha256:sha256(input.final_stage_output_json),
    markdown_sha256:sha256(input.final_brief_markdown),
    audit_sha256:sha256(input.final_audit_json),
    booking_sha256:sha256(bookingText),
    prospect_binding_version:'claris_accepted_prospect_manifest_v1',
    accepted_prospect_binding_sha256:accepted.binding_sha256
  };
  return {ok:true,record};
}

// Admin-attested final output only; does not independently re-run the frozen
// intelligence/audit engine. This function never sends email or claims delivery.
export async function persistGovernedFinalSnapshot(input, {repository}={}) {
  if (typeof input?.opportunity_id!=='string' || !ID.test(input.opportunity_id)) {
    return result('BLOCKED',{error:'OPPORTUNITY_ID_INVALID'});
  }
  if (typeof repository?.loadEnvelopeWithMeta!=='function' ||
      typeof repository?.saveEnvelopeWithMeta!=='function') {
    return result('BLOCKED',{error:'FINAL_SNAPSHOT_REPOSITORY_REQUIRED'});
  }
  let loaded;
  try { loaded=await repository.loadEnvelopeWithMeta(input.opportunity_id); }
  catch { return result('BLOCKED',{error:'FINAL_SNAPSHOT_READ_FAILED'}); }
  const envelope=loaded?.envelope;
  if (!envelope || envelope.opportunity_id!==input.opportunity_id ||
      envelope.schema_version!=='claris_clarification_envelope_v1') {
    return result('BLOCKED',{error:'OPPORTUNITY_NOT_FOUND'});
  }
  if (envelope.package?.status!=='SUBMITTED' || !envelope.response) {
    return result('BLOCKED',{error:'PROSPECT_SUBMISSION_REQUIRED'});
  }
  const booking=extractPersistedBookingContext(envelope);
  if (!booking.ok) return result('BLOCKED',{error:'BOOKING_CONTEXT_UNVERIFIED'});
  const candidate=payloadValidation(input,envelope,booking.booking.verbatim_text);
  if (!candidate.ok) return result('BLOCKED',{error:candidate.error});
  const existing=envelope.final_intelligence;
  if (existing != null) {
    const old=verifyFinalSnapshot(existing,input.opportunity_id,{bookingText:booking.booking.verbatim_text,envelope});
    if (!old.ok) return result('BLOCKED',{error:'EXISTING_FINAL_SNAPSHOT_INVALID'});
    const equivalent=['artifact_sha256','markdown_sha256','audit_sha256','booking_sha256','accepted_prospect_binding_sha256']
      .every(key=>existing[key]===candidate.record[key]);
    return equivalent ? result('ALREADY_STORED',{opportunity_id:input.opportunity_id}) :
      result('CONFLICT',{error:'DIFFERENT_FINAL_SNAPSHOT_EXISTS'});
  }
  if (envelope.final_delivery_receipt != null) {
    return result('BLOCKED',{error:'FINAL_DELIVERY_RECEIPT_ALREADY_EXISTS'});
  }
  if (typeof loaded.etag!=='string' || !loaded.etag.trim()) {
    return result('BLOCKED',{error:'FINAL_SNAPSHOT_ETAG_REQUIRED'});
  }
  if (input.expected_opportunity_version !== loaded.etag) {
    return result('CONFLICT',{error:'FINAL_SNAPSHOT_VERSION_MISMATCH'});
  }
  try {
    await repository.saveEnvelopeWithMeta(input.opportunity_id,{
      ...envelope,
      final_intelligence:candidate.record
    },{ifMatch:loaded.etag});
  } catch(error) {
    return result(isCollision(error)?'CONFLICT':'BLOCKED',{
      error:isCollision(error)?'FINAL_SNAPSHOT_CONCURRENT_WRITE':'FINAL_SNAPSHOT_WRITE_UNCERTAIN'
    });
  }
  return result('STORED',{opportunity_id:input.opportunity_id,
    artifact_sha256:candidate.record.artifact_sha256});
}
