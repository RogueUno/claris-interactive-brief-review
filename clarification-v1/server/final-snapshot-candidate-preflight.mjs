import { inspectPersistedFinalSources } from './final-snapshot-source-preflight.mjs';
import { inspectFinalSnapshotCandidatePayload } from './final-snapshot-persistence.mjs';

const ID=/^[A-Za-z0-9_-]{3,100}$/;
const out=(status,http_status,rest={})=>({
  ok:status==='CANDIDATE_CONTRACT_PASSED',status,http_status,
  ...rest,preview_only:true,write_performed:false,delivery_authorized:false
});

/**
 * Read-only candidate preflight against a live submitted envelope and current
 * locked owner. The caller supplies an already-completed historical FINALIZE
 * payload; nothing starts FINALIZE, and no storage save method is invoked.
 * A success is a provenance/format contract check, NOT semantic validation.
 */
export async function inspectLiveFinalCandidate(input,{
  repository,consultantRepository,ownerVerifier
}={}) {
  if(!input || typeof input.opportunity_id!=='string' ||
      !ID.test(input.opportunity_id)) {
    return out('BLOCKED',400,{error:'OPPORTUNITY_ID_INVALID'});
  }
  if(typeof repository?.loadEnvelopeWithMeta!=='function') {
    return out('BLOCKED',500,{error:'CANDIDATE_READ_REPOSITORY_REQUIRED'});
  }
  const source=await inspectPersistedFinalSources(input.opportunity_id,{
    repository,consultantRepository,
    ...(ownerVerifier ? {ownerVerifier}: {})
  });
  if(!source.ok) return out('SOURCE_PREFLIGHT_NOT_PASSED',source.http_status,{
    error:source.error||source.status,
    source_status:source.status
  });
  if(source.snapshot_state!=='NOT_PERSISTED') {
    return out('CANDIDATE_ALREADY_PERSISTED',409,{
      error:'EXISTING_FINAL_SNAPSHOT_REQUIRES_RECONCILIATION'
    });
  }
  // Re-read instead of using a caller-provided object. We don't transfer a
  // previously checked envelope into a future write or authorize delivery.
  let loaded;
  try{loaded=await repository.loadEnvelopeWithMeta(input.opportunity_id);}
  catch{return out('BLOCKED',500,{error:'CANDIDATE_REPOSITORY_READ_FAILED'});}
  const envelope=loaded?.envelope;
  if(!loaded?.etag || !envelope || envelope.opportunity_id!==input.opportunity_id ||
      envelope.schema_version!=='claris_clarification_envelope_v1' ||
      envelope.final_intelligence!=null || envelope.final_delivery_receipt!=null) {
    return out('BLOCKED',409,{error:'CANDIDATE_LIVE_ENVELOPE_CHANGED'});
  }
  const check=inspectFinalSnapshotCandidatePayload(input,envelope);
  if(!check.ok) return out('CANDIDATE_CONTRACT_BLOCKED',422,{error:check.error});
  return out('CANDIDATE_CONTRACT_PASSED',200,{
    opportunity_id:input.opportunity_id,
    artifact_sha256:check.artifact_sha256,
    booking_binding:check.booking_binding,
    prospect_binding:'ACCEPTED_RESPONSE_MANIFEST_MATCH',
    source_reference_check:'DECLARED_REFERENCE_ALLOWLIST_PASSED',
    audit_assurance:check.audit_assurance,
    semantic_assurance:check.semantic_assurance,
    delivery_owner_status:source.owner_status,
    write_eligibility:'NOT_DETERMINED_REQUIRES_SEPARATE_EXPLICIT_PILOT'
  });
}
