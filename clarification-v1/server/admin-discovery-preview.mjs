import { renderFinalBrief } from './final-brief-renderer.mjs';
import { assessCommercialBrief, isExplicitSyntheticRehearsal } from './commercial-brief-readiness.mjs';
import { prioritizeDiscoveryQuestions } from './discovery-prioritizer.mjs';
import { draftFromPersistedBookingContext, extractPersistedBookingContext } from './persisted-booking-discovery-gate.mjs';
import { verifyFinalSnapshot } from './final-snapshot-persistence.mjs';

// Read only; persistence is handled separately by the append-once service.
const VALID_ID = /^[A-Za-z0-9_-]{3,100}$/;
const response = (status, http_status, extra={})=>({
  ok:status==='PREVIEW_READY'||status==='SCOPE_RESTRICTED',
  status,http_status,...extra
});

export async function previewPersistedOpportunityDiscovery(opportunityId, { repository } = {}) {
  if (typeof opportunityId !== 'string' || !VALID_ID.test(opportunityId)) {
    return response('BLOCKED',400,{error:'OPPORTUNITY_ID_INVALID'});
  }
  if (typeof repository?.loadEnvelopeWithMeta !== 'function') {
    return response('BLOCKED',500,{error:'PREVIEW_REPOSITORY_UNAVAILABLE'});
  }

  let loaded;
  try { loaded = await repository.loadEnvelopeWithMeta(opportunityId); }
  catch { return response('BLOCKED',500,{error:'PREVIEW_REPOSITORY_READ_FAILED'}); }

  const envelope = loaded?.envelope;
  if (!envelope || envelope.opportunity_id !== opportunityId ||
      envelope.schema_version !== 'claris_clarification_envelope_v1') {
    return response('NOT_FOUND',404,{error:'OPPORTUNITY_NOT_FOUND'});
  }

  if (envelope.package?.status !== 'SUBMITTED' || !envelope.response) {
    return response('SUBMISSION_NOT_ESTABLISHED',409,{
      opportunity_id:opportunityId,error:'PROSPECT_SUBMISSION_REQUIRED'
    });
  }

  const context = extractPersistedBookingContext(envelope);
  if (!context.ok) {
    return response('BOOKING_CONTEXT_UNVERIFIED',409,{
      opportunity_id:opportunityId,error:context.reason
    });
  }

  const snapshot = envelope.final_intelligence == null ? {ok:false,missing:true} :
    verifyFinalSnapshot(envelope.final_intelligence,opportunityId,{
      bookingText:context.booking.verbatim_text
    });
  if (!snapshot.ok) {
    return response(snapshot.missing ? 'FINAL_ARTIFACT_NOT_PERSISTED' :
      'FINAL_ARTIFACT_SNAPSHOT_INVALID',409,{
      opportunity_id:opportunityId,
      error:snapshot.missing ? 'GOVERNED_FINAL_SNAPSHOT_REQUIRED' :
        'GOVERNED_FINAL_SNAPSHOT_NOT_CERTIFIED',
      booking_assurance:context.assurance
    });
  }

  try {
    const readiness = assessCommercialBrief(envelope.final_intelligence.final_stage_output_json,{
      synthetic:isExplicitSyntheticRehearsal(envelope.final_intelligence.final_stage_output_json,{
        trustedBookingText:context.booking.verbatim_text
      })
    });
    const selected = prioritizeDiscoveryQuestions(envelope.final_intelligence.final_stage_output_json);
    const draft = draftFromPersistedBookingContext(envelope.final_intelligence.final_stage_output_json,envelope);
    const allowed = draft.status === 'DRAFTS_FOR_REVIEW' ||
      draft.status === 'NO_REMAINING_SLOTS' ||
      draft.status === 'INSUFFICIENT_GROUNDED_GAPS';
    if (!allowed && draft.status !== 'SCOPE_RESTRICTED') {
      return response('BLOCKED',409,{
        opportunity_id:opportunityId,error:'DRAFT_GATE_NOT_ELIGIBLE'
      });
    }
    const safe = {
      opportunity_id:opportunityId,
      booking_assurance:context.assurance,
      draft_status:draft.status,
      final_questions:selected.selected,
      review_drafts:allowed ? draft.drafts : [],
      unresolved_topics:selected.missing_topics,
      commercial_readiness_status:readiness.status,
      no_auto_send:true
    };
    return response(draft.status === 'SCOPE_RESTRICTED' ? 'SCOPE_RESTRICTED' :
      'PREVIEW_READY',200,safe);
  } catch {
    return response('BLOCKED',422,{
      opportunity_id:opportunityId,error:'DISCOVERY_PREVIEW_INVALID'
    });
  }
}
