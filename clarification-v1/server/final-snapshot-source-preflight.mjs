import { buildFinalizeBundle } from './finalize-handoff.mjs';
import { verifyLockedDeliveryOwner } from './verify-locked-delivery-owner.mjs';
import { extractPersistedBookingContext } from './persisted-booking-discovery-gate.mjs';
import { deriveAcceptedProspectManifest } from './accepted-prospect-evidence.mjs';
import { verifyFinalSnapshot } from './final-snapshot-persistence.mjs';

const ID=/^[A-Za-z0-9_-]{3,100}$/;
const output=(status,http_status,more={})=>({
  ok:status==='SOURCE_PREFLIGHT_PASSED',
  status,http_status,...more
});

// Read-only administrative preflight. Reports source completeness only:
// it cannot certify an as-yet-unavailable FINALIZE artifact, and must
// never include booking text, prospect answers, owner email or tokens.
export async function inspectPersistedFinalSources(opportunityId,{
  repository,consultantRepository,ownerVerifier=verifyLockedDeliveryOwner
}={}) {
  if(typeof opportunityId!=='string'||!ID.test(opportunityId)) {
    return output('BLOCKED',400,{error:'OPPORTUNITY_ID_INVALID'});
  }
  if(typeof repository?.loadEnvelopeWithMeta!=='function' ||
      typeof consultantRepository?.loadIdentity!=='function' ||
      typeof consultantRepository?.loadProfileEnvelopeWithMeta!=='function') {
    return output('BLOCKED',500,{error:'PREFLIGHT_READ_DEPENDENCIES_REQUIRED'});
  }
  let loaded;
  try {loaded=await repository.loadEnvelopeWithMeta(opportunityId);}
  catch {return output('BLOCKED',500,{error:'PREFLIGHT_ENVELOPE_READ_FAILED'});}
  const envelope=loaded?.envelope;
  if(!envelope || envelope.opportunity_id!==opportunityId ||
     envelope.schema_version!=='claris_clarification_envelope_v1') {
    return output('NOT_FOUND',404,{error:'OPPORTUNITY_NOT_FOUND'});
  }
  if(envelope.package?.status!=='SUBMITTED'||!envelope.response) {
    return output('SUBMISSION_NOT_ESTABLISHED',409,{error:'PROSPECT_SUBMISSION_REQUIRED'});
  }
  if(typeof loaded.etag!=='string'||!loaded.etag.trim()) {
    return output('BLOCKED',409,{error:'ATOMIC_OPPORTUNITY_VERSION_REQUIRED'});
  }
  const booking=extractPersistedBookingContext(envelope);
  if(!booking.ok) {
    return output('BOOKING_CONTEXT_UNVERIFIED',409,{error:booking.reason});
  }
  const accepted=deriveAcceptedProspectManifest(envelope);
  if(!accepted.ok) {
    return output('PROSPECT_BINDING_UNVERIFIED',409,{error:accepted.error});
  }
  let finalContext;
  try {finalContext=buildFinalizeBundle(envelope,loaded.etag);}
  catch {return output('BLOCKED',409,{error:'FINALIZE_HANDOFF_INVALID'});}
  if(!finalContext.ok||finalContext.status!=='SUBMITTED'||
      !finalContext.consultant_id||!finalContext.consultant_delivery_email) {
    return output('BLOCKED',409,{error:'FINALIZE_HANDOFF_NOT_CERTIFIED'});
  }
  let verifiedOwner;
  try {
    verifiedOwner=await ownerVerifier(finalContext,{repository:consultantRepository});
  } catch {
    return output('OWNER_UNVERIFIED',409,{error:'LOCKED_CONSULTANT_OWNER_NOT_VERIFIED'});
  }
  if(verifiedOwner?.consultant_id!==finalContext.consultant_id ||
     verifiedOwner?.consultant_delivery_email!==finalContext.consultant_delivery_email) {
    return output('OWNER_UNVERIFIED',409,{error:'LOCKED_CONSULTANT_OWNER_MISMATCH'});
  }
  let snapshotState='NOT_PERSISTED';
  if(envelope.final_intelligence!=null) {
    const valid=verifyFinalSnapshot(envelope.final_intelligence,opportunityId,{
      bookingText:booking.booking.verbatim_text,envelope
    });
    if(!valid.ok) return output('SNAPSHOT_INVALID',409,{
      error:'EXISTING_FINAL_SNAPSHOT_NOT_CERTIFIED'
    });
    snapshotState='PERSISTED_INTEGRITY_CHECK_PASSED';
  }
  if(envelope.final_delivery_receipt!=null) {
    // The source preflight never reconciles or changes an existing delivery receipt.
    return output('DELIVERY_ALREADY_RESERVED',409,{
      error:'DELIVERY_RECEIPT_REQUIRES_SEPARATE_RECONCILIATION'
    });
  }
  return output('SOURCE_PREFLIGHT_PASSED',200,{
    opportunity_id:opportunityId,
    booking_assurance:booking.assurance,
    prospect_binding:'ACCEPTED_RESPONSE_MANIFEST_DERIVED',
    accepted_answer_count:accepted.entries.length,
    accepted_source_ids:accepted.entries.map(item=>item.evidence_id),
    owner_status:'CURRENT_LOCKED_OWNER_VERIFIED',
    snapshot_state:snapshotState,
    artifact_certification:snapshotState==='NOT_PERSISTED'
      ? 'NOT_EVALUATED_NO_PERSISTED_ARTIFACT'
      : 'INTEGRITY_ONLY_NOT_SEMANTIC_CERTIFICATION',
    preview_only:true,write_performed:false,delivery_authorized:false,
    note:'Provenance IDs identify accepted answers; they do not independently verify factual assertions in FINALIZE.'
  });
}
