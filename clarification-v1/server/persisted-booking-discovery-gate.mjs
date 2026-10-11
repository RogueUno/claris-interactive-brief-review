import { draftEvidenceConstrainedQuestions } from './evidence-constrained-question-drafts.mjs';

// Pure read-only adapter. The caller MUST first load the envelope from the
// CLARIS repository under admin authorization. This module checks internal
// canonical consistency only: it cannot independently verify Calendly's
// original booking event or the identity of the object passed by its caller.
export function extractPersistedBookingContext(envelope) {
  const blocked=(reason)=>({ok:false,status:'BOOKING_CONTEXT_UNVERIFIED',reason});
  if (!envelope || envelope.finalize_context?.schema_version !== 'claris_finalize_context_v1') {
    return blocked('PERSISTED_FINALIZE_CONTEXT_REQUIRED');
  }
  let caseState, canonical;
  try {
    if (typeof envelope.finalize_context.case_state_json !== 'string') {
      return blocked('PERSISTED_CASE_STATE_REQUIRED');
    }
    caseState=JSON.parse(envelope.finalize_context.case_state_json);
    canonical=JSON.parse(caseState?.canonical_truth_json);
  } catch {
    return blocked('PERSISTED_CASE_STATE_INVALID_JSON');
  }
  const original=caseState?.booking_text_exact;
  if (typeof original !== 'string' || original.trim() !== original || !original ||
      original.length > 20000) {
    return blocked('BOOKING_TEXT_NOT_CANONICAL');
  }
  const entries=Array.isArray(canonical?.booking_evidence) ? canonical.booking_evidence : [];
  const exact=entries.filter(item => item?.evidence_id === 'BOOK-001');
  if (exact.length !== 1 || exact[0]?.authority !== 'BOOKING_TEXT' ||
      exact[0]?.resolvable !== true ||
      exact[0]?.statement !== original || exact[0]?.exact_basis !== original) {
    return blocked('BOOKING_EVIDENCE_MISMATCH');
  }
  return {
    ok:true,
    status:'PERSISTED_CASE_STATE_CORROBORATED',
    assurance:'INTERNAL_CANONICAL_AGREEMENT_ONLY',
    booking:{
      origin:'PERSISTED_BOOKING',
      source_id:'BOOK-001',
      verbatim_text:original
    }
  };
}

export function draftFromPersistedBookingContext(artifact, envelope) {
  const context=extractPersistedBookingContext(envelope);
  if (!context.ok) {
    return {
      status:'BOOKING_CONTEXT_UNVERIFIED',
      mode:'OFFLINE_ADVISORY_ONLY',
      draft_count:0,
      drafts:[],
      reason:context.reason
    };
  }
  const result=draftEvidenceConstrainedQuestions(artifact,{booking:context.booking});
  return {
    ...result,
    booking_assurance:context.assurance,
    booking_status:context.status
  };
}
