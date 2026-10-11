import { normalizeFinalArtifact } from './final-brief-renderer.mjs';
import { prioritizeDiscoveryQuestions } from './discovery-prioritizer.mjs';

// Offline/advisory module. Caller MUST load booking.verbatim_text from persisted
// booking storage, not from AI output, HTTP request body, or prospect paraphrase.
// This module cannot itself authenticate the booking and is deliberately NOT
// connected to render, delivery claims, or emails.
const OPEN = new Set(['UNKNOWN','UNVERIFIED','PARTIAL','PARTIAL_MATCH','GAP','MISMATCH']);
const DIMENSIONS = Object.freeze({
  buyer_outcome: ['business_trigger','buyer_outcome','business_objective'],
  technical_scope: ['technical_scope','scope_alignment','service_need_alignment'],
  stakeholder_authority: ['buyer_stakeholder_fit','decision_authority','stakeholder_fit'],
  timing: ['timing_urgency','business_trigger','timeline'],
  commercial_feasibility: ['engagement_economics','budget_fit','commercial_fit'],
  existing_evidence: ['evidence_readiness','control_readiness','evidence_completeness']
});
const ORDER = Object.keys(DIMENSIONS);

const TEMPLATES = Object.freeze({
  SOC2_READINESS: {
    label: 'SOC 2 readiness',
    buyer_outcome: 'What specific customer or internal decision should the SOC 2 readiness work support?',
    technical_scope: 'Which products, systems, teams and vendors, if any, should be included in the SOC 2 readiness scope?',
    stakeholder_authority: 'Who is responsible for coordinating SOC 2 readiness, and who would approve the next step?',
    timing: 'Is there a confirmed deadline or external milestone for SOC 2 readiness, or is timing still flexible?',
    commercial_feasibility: 'Has a budget been approved for SOC 2 readiness support, and who would authorize an engagement?',
    existing_evidence: 'What policies, control evidence or previous assessments, if any, are already available for SOC 2 readiness?'
  },
  ISO27001_PREPARATION: {
    label: 'ISO 27001 preparation',
    buyer_outcome: 'What business decision or customer requirement is the ISO 27001 preparation intended to support?',
    technical_scope: 'Which teams, locations, systems and activities, if any, would be within the proposed ISO 27001 scope?',
    stakeholder_authority: 'Who will own the ISO 27001 preparation internally, and who can approve next steps?',
    timing: 'Is there a confirmed certification target date or external milestone, or is the timing flexible?',
    commercial_feasibility: 'Is funding allocated to ISO 27001 preparation, and who would approve external support?',
    existing_evidence: 'Which policies, risk assessments and ISMS records, if any, already exist for ISO 27001 preparation?'
  },
  VCISO_ADVISORY: {
    label: 'vCISO advisory',
    buyer_outcome: 'What business or security leadership decisions are you hoping vCISO advisory will support?',
    technical_scope: 'Which teams, business units and security responsibilities should vCISO advisory cover?',
    stakeholder_authority: 'Who would sponsor vCISO advisory internally, and who would approve the arrangement?',
    timing: 'Is there an actual start-date requirement or external milestone for vCISO advisory?',
    commercial_feasibility: 'Has a budget been considered for vCISO advisory, and who approves an external engagement?',
    existing_evidence: 'Which risk registers, security plans or prior assessments, if any, are available to inform vCISO advisory?'
  }
});

const SCOPE_SIGNALS = [
  {id:'SOC2_READINESS',match:/\bSOC\s*2\b/i,qualifier:/\b(readiness|preparation|assessment)\b/i,
    blocked:/\b(no|not|without|avoid)\b.{0,34}\bSOC\s*2\b|\bSOC\s*2\b.{0,34}\b(not needed|out of scope|not interested)\b/i},
  {id:'ISO27001_PREPARATION',match:/\bISO[ -]?27001\b/i,qualifier:/\b(preparation|readiness|certification|assessment)\b/i,
    blocked:/\b(no|not|without|avoid)\b.{0,34}\bISO[ -]?27001\b|\bISO[ -]?27001\b.{0,34}\b(not needed|out of scope|not interested)\b/i},
  {id:'VCISO_ADVISORY',match:/\b(vCISO|virtual CISO)\b/i,qualifier:/\b(advisory|support|engagement|service|help|need)\b/i,
    blocked:/\b(no|not|without|avoid)\b.{0,34}\b(vCISO|virtual CISO)\b|\b(vCISO|virtual CISO)\b.{0,34}\b(not needed|out of scope|not interested)\b/i}
];

const REHEARSAL_OR_CONTACT_HOLD = /\b(synthetic|fictional|rehearsal|simulation|simulated|demo|internal test|test research only)\b|\bdo not contact\b/i;

function uniqueOpenDimensions(normalized) {
  return Object.entries(normalized.match_classifications)
    .filter(([, item]) => item && OPEN.has(String(item.status || '').toUpperCase()))
    .map(([dimension,item])=>({dimension,status:String(item.status).toUpperCase()}));
}

function reasonFor(topic, opened, bookingText) {
  const matches = opened.filter(item=>DIMENSIONS[topic].includes(item.dimension));
  // A booking-stated need to define scope or readiness evidence is itself a
  // question-plan gap, but not proof that a technical failure exists.
  const bookingScope = topic === 'technical_scope' && /\b(scope|system boundary|in.scope)\b/i.test(bookingText);
  const bookingEvidence = topic === 'existing_evidence' && /\b(evidence|readiness|policies|assessment)\b/i.test(bookingText);
  if (!matches.length && !bookingScope && !bookingEvidence) return null;
  return {
    unresolved_dimensions:matches,
    justification:matches.length ? 'OPEN_FINALIZE_DIMENSION' : 'BOOKING_STATED_TOPIC'
  };
}

export function draftEvidenceConstrainedQuestions(artifact, {booking} = {}) {
  const prioritized = prioritizeDiscoveryQuestions(artifact);
  const empty = (status, extra={})=>({
    status, mode:'OFFLINE_ADVISORY_ONLY', draft_count:0, drafts:[],
    existing_selected_count:prioritized.selected_count,
    unfilled_topics:prioritized.missing_topics,
    ...extra
  });

  // A caller-supplied string is not sufficient. The authoritative adapter
  // must provide source attribution and verify the persisted booking itself.
  if (!booking || booking.origin !== 'PERSISTED_BOOKING' ||
      booking.source_id !== 'BOOK-001' ||
      typeof booking.verbatim_text !== 'string' || !booking.verbatim_text.trim()) {
    return empty('TRUSTED_BOOKING_REQUIRED');
  }
  const bookingText=booking.verbatim_text.trim();
  if (REHEARSAL_OR_CONTACT_HOLD.test(bookingText)) {
    return empty('SCOPE_RESTRICTED');
  }
  const scopeMatches=SCOPE_SIGNALS.filter(x=>x.match.test(bookingText));
  if (scopeMatches.some(x=>x.blocked.test(bookingText))) return empty('NEGATED_SCOPE');
  const supported=scopeMatches.filter(x=>x.qualifier.test(bookingText));
  if (scopeMatches.length !== 1 || supported.length !== 1) {
    return empty('SCOPE_UNSUPPORTED_OR_AMBIGUOUS');
  }
  const scope=supported[0].id;
  const normalized=normalizeFinalArtifact(artifact);
  if (!normalized.intelligence_lineage.some(x=>x.source_id === booking.source_id)) {
    return empty('BOOKING_REFERENCE_NOT_DECLARED');
  }
  const opened=uniqueOpenDimensions(normalized);
  if (!opened.length && !normalized.remaining_unknowns.length) {
    return empty('NO_DOCUMENTED_OPEN_GAPS',{scope});
  }
  const slots=Math.max(0,5-prioritized.selected_count);
  if (!slots) return empty('NO_REMAINING_SLOTS',{scope});

  const templates=TEMPLATES[scope];
  const drafts=[];
  for (const topic of ORDER) {
    if (drafts.length>=slots) break;
    if (!prioritized.missing_topics.includes(topic)) continue;
    const rationale=reasonFor(topic,opened,bookingText);
    if (!rationale) continue;
    drafts.push({
      origin:'DETERMINISTIC_QUESTION_DRAFT',
      status:'CONSULTANT_REVIEW_REQUIRED',
      topic,
      question:templates[topic],
      scope_label:templates.label,
      basis:{
        booking_source_id:booking.source_id,
        booking_origin:'CALLER_ASSERTED_PERSISTED_BOOKING',
        // This identifier is a cross-reference, NOT independent verification.
        verified_by_module:false,
        ...rationale
      }
    });
  }
  return {
    status:drafts.length ? 'DRAFTS_FOR_REVIEW' : 'INSUFFICIENT_GROUNDED_GAPS',
    mode:'OFFLINE_ADVISORY_ONLY',scope,
    existing_selected_count:prioritized.selected_count,
    draft_count:drafts.length,drafts,
    unfilled_topics:prioritized.missing_topics.filter(topic=>!drafts.some(q=>q.topic===topic)),
    limitations:'No drafted question is a finding or a verified buyer fact. Validate persisted booking authority, relevance, and consultant scope before use. Never auto-send.'
  };
}
