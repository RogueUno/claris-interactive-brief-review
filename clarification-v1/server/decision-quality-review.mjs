import { assessCommercialBrief } from './commercial-brief-readiness.mjs';
import { normalizeFinalArtifact } from './final-brief-renderer.mjs';
import { asksSoc2AssuranceDeliverable } from './soc2-offline-judgment-review.mjs';

// Post-FINALIZE, zero-provider-cost advisory. It must never authorize send,
// reclassify buyer evidence, or fabricate new model-generated questions.
const hasDualScope=booking=>/\bSOC\s*2\b/i.test(booking)
  && /\b(questionnaire|security documentation|assurance materials)\b/i.test(booking)
  && /\b(readiness|formal|audit|attestation)\b/i.test(booking);

export function reviewDecisionQuality(artifact,{trustedBookingText=''}={}){
  const base=assessCommercialBrief(artifact);
  const normalized=normalizeFinalArtifact(artifact);
  const text=String(trustedBookingText||'').trim();
  const groundedBooking=Boolean(text)
    && normalized.intelligence_lineage.some(x=>x.source_id==='BOOK-001');
  const forkRequired=groundedBooking && hasDualScope(text);
  const forkAddressed=normalized.discovery_questions.some(q=>asksSoc2AssuranceDeliverable(q.question));
  const forkOpen=forkRequired&&!forkAddressed;
  const missing=[
    ...base.missing,
    ...(forkOpen?['buyer_assurance_deliverable_fork']:[])
  ];
  const reviewQuestion=forkOpen?{
    origin:'DETERMINISTIC_REVIEW_SUGGESTION',
    consultant_review_required:true,
    question:'What precise assurance deliverable is the enterprise buyer willing to accept: a completed questionnaire, an existing SOC 2 Type II report, an expanded assessment scope, or a new readiness engagement?',
    rationale:'The canonical booking names materially different ways to unblock procurement; the FINALIZE question plan did not distinguish the requested artifact.',
    basis_ids:['BOOK-001'],
    source_claims_verified:false
  }:null;
  return {
    schema_version:'claris_decision_quality_review_v1',
    status:!groundedBooking?'BOOKING_AUTHORITY_REQUIRED':missing.length?'HOLD_FOR_COMMERCIAL_REVIEW':'STRUCTURAL_DEPTH_CANDIDATE',
    provider_audit_is_not_quality_certification:true,
    consultant_review_required:true,
    auto_send_allowed:false,
    production_delivery_authorized:false,
    mandatory_ai_reexecution:false,
    baseline:base.status,
    missing,
    question_count:normalized.discovery_questions.length,
    covered_topics:base.discovery_strategy.covered,
    buyer_deliverable_fork:{
      required:forkRequired,
      addressed_by_original_final_questions:forkAddressed,
      open:forkOpen,
      basis_ids:forkRequired?['BOOK-001']:[],
      reviewer_question:reviewQuestion
    },
    limitations:'Deterministic structural audit only. Reviewer must verify buyer evidence, commercial interpretation and actual service relevance; no generative inference, publication or contact permission.'
  };
}
