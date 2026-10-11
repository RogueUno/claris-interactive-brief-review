import { renderFinalBrief } from './final-brief-renderer.mjs';
import { assessCommercialBrief, isExplicitSyntheticRehearsal } from './commercial-brief-readiness.mjs';
import { prioritizeDiscoveryQuestions } from './discovery-prioritizer.mjs';
import { draftFromPersistedBookingContext, extractPersistedBookingContext } from './persisted-booking-discovery-gate.mjs';

// READ-ONLY. This intentionally has no way to persist a FINALIZE artifact.
// The snapshot format is a future, explicitly governed storage contract.
// Existing submitted envelopes do not yet contain this record.
const VERSION = 'claris_final_intelligence_snapshot_v1';
const VALID_ID = /^[A-Za-z0-9_-]{3,100}$/;

const response = (status, http_status, extra = {}) => ({
  ok: status === 'PREVIEW_READY' || status === 'SCOPE_RESTRICTED',
  status, http_status, ...extra
});

function auditPass(value) {
  try {
    const v = typeof value === 'string' ? JSON.parse(value) : value;
    return v?.audit_status === 'PASS' && v.repair_required === false &&
      Array.isArray(v.violations) && v.violations.length === 0;
  } catch { return false; }
}

function validatedSnapshot(envelope, opportunityId) {
  const snapshot = envelope?.final_intelligence;
  if (snapshot == null) return { ok: false, missing: true };
  if (snapshot.schema_version !== VERSION ||
      snapshot.opportunity_id !== opportunityId ||
      snapshot.status !== 'FINALIZED' || snapshot.final_stage !== 'FINALIZE' ||
      snapshot.source !== 'GOVERNED_FINALIZE' ||
      !auditPass(snapshot.final_audit_json) ||
      typeof snapshot.final_stage_output_json !== 'string' ||
      typeof snapshot.final_brief_markdown !== 'string') {
    return { ok: false, missing: false };
  }

  try {
    // These are strict content-integrity checks, not an independent audit of
    // the AI's factual assertions or third-party evidence.
    const rendered = renderFinalBrief(snapshot.final_stage_output_json);
    if (rendered.brief_markdown !== snapshot.final_brief_markdown.trim()) {
      return { ok: false, missing: false };
    }
    return { ok: true, artifact: snapshot.final_stage_output_json };
  } catch {
    return { ok: false, missing: false };
  }
}

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

  const context = extractPersistedBookingContext(envelope);
  if (!context.ok) {
    return response('BOOKING_CONTEXT_UNVERIFIED',409,{
      opportunity_id:opportunityId,error:context.reason
    });
  }

  const snapshot = validatedSnapshot(envelope,opportunityId);
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
    const readiness = assessCommercialBrief(snapshot.artifact,{
      synthetic:isExplicitSyntheticRehearsal(snapshot.artifact,{
        trustedBookingText:context.booking.verbatim_text
      })
    });
    const selected = prioritizeDiscoveryQuestions(snapshot.artifact);
    const draft = draftFromPersistedBookingContext(snapshot.artifact,envelope);
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
