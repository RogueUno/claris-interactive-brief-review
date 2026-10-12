import { normalizeFinalArtifact } from './final-brief-renderer.mjs';
import { prioritizeDiscoveryQuestions } from './discovery-prioritizer.mjs';
import { assessDiscoveryCoverage } from './discovery-coverage.mjs';
import { extractPersistedBookingContext } from './persisted-booking-discovery-gate.mjs';
import { deriveAcceptedProspectManifest } from './accepted-prospect-evidence.mjs';
import { inspectProspectClaimConsistency } from './prospect-claim-consistency.mjs';
import { asksSoc2AssuranceDeliverable } from './soc2-offline-judgment-review.mjs';

// Deliberately advisory, never a mutation of FINALIZE or a live consultant
// preview. This can only recommend a question-plan edit for human review.
// The caller is responsible for loading the persisted envelope read-only.
const SOC2=/\bSOC\s*2\b/i;
const CONFLICTING_SERVICE=/\b(?:ISO[\s-]*27001|vCISO|virtual\s+CISO)\b/i;
const REHEARSAL=/\b(?:synthetic|fictional|rehearsal|simulat(?:ion|ed)|internal test|test research|do not contact|don't contact)\b/i;
const SOC2_SERVICE=/^SVC_SOC2(?:_|$)/i;
const QUESTION='What exactly did the enterprise customer request—a security questionnaire, a SOC 2 Type I or Type II report, or another assurance deliverable—what business decision does it affect, and what is the actual required date (if any)?';
const INTENT='Clarify the customer-required assurance deliverable and distinguish procurement timing from audit requirements without assuming either is confirmed.';
const FIELDS=Object.freeze({
  review_only:true,
  auto_applied:false,
  no_auto_send:true,
  write_authorized:false,
  delivery_authorized:false,
  semantic_assurance:'NOT_CERTIFIED',
  factual_assurance:'INTERNAL_CANONICAL_AGREEMENT_ONLY_NOT_EXTERNALLY_VERIFIED'
});

const fingerprint=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
function output(status,fields={}){
  return {status,...FIELDS,proposed_count:0,proposed_questions:[],...fields};
}

function acceptedSoc2Selection(manifest,envelope) {
  const interested=manifest.entries.filter(e=>/\b(?:service|advisory|interested|explor(?:e|ing))\b/i.test(e.prompt||''));
  if(interested.length!==1) return null;
  const entry=interested[0];
  if(entry.answer_kind!=='OPTION'||!SOC2.test(entry.value)||
    CONFLICTING_SERVICE.test(entry.value)) return null;
  const question=envelope.package.questions.find(q=>q.question_id===entry.question_id);
  const found=question?.options?.some(o=>o?.option_id===entry.selected_option_id&&o?.label===entry.value);
  return found?entry:null;
}

function coverage(questions){
  // Only actual questions count toward preserved topical coverage.
  // A model-provided "intent" field must not create phantom breadth.
  return assessDiscoveryCoverage({
    discovery_question_plan:questions.map(q=>({question:q.question}))
  });
}

function preserveCoverage(previous,proposed) {
  const before=coverage(previous),after=coverage(proposed);
  const lost=Object.keys(before.covered).filter(topic=>before.covered[topic]&&!after.covered[topic]);
  return {lost,before,after};
}

export function proposeSoc2AssuranceFirstCallPlan(artifact,{envelope}={}) {
  const booking=extractPersistedBookingContext(envelope);
  const accepted=deriveAcceptedProspectManifest(envelope);
  if(!booking.ok||!accepted.ok){
    return output('TRUSTED_BOOKING_AND_ACCEPTED_ANSWERS_REQUIRED',{
      reason:booking.ok?accepted.error:booking.reason
    });
  }
  const exact=booking.booking.verbatim_text;
  if(REHEARSAL.test(exact)){
    return output('REHEARSAL_OR_CONTACT_SCOPE_RESTRICTED');
  }
  if(!SOC2.test(exact)||CONFLICTING_SERVICE.test(exact)){
    return output('SOC2_BOOKING_SCOPE_NOT_UNAMBIGUOUS');
  }
  const service=acceptedSoc2Selection(accepted,envelope);
  if(!service){
    return output('ACCEPTED_SOC2_SERVICE_INTEREST_NOT_ESTABLISHED');
  }
  let normalized,prioritized;
  try{
    normalized=normalizeFinalArtifact(artifact);
    prioritized=prioritizeDiscoveryQuestions(artifact);
  }catch{
    return output('FINALIZE_CANDIDATE_UNREADABLE');
  }
  if(!SOC2_SERVICE.test(String(normalized.primary_service_id||'')) ||
    !normalized.intelligence_lineage.some(e=>e.source_id==='BOOK-001') ||
    !normalized.intelligence_lineage.some(e=>e.source_id===normalized.primary_service_id)) {
    return output('CONSULTANT_SERVICE_OR_BOOKING_LINEAGE_NOT_DECLARED');
  }
  const claim=inspectProspectClaimConsistency(artifact,envelope);
  if(claim.conflict_count>0||claim.status==='CANDIDATE_UNREADABLE'||
     claim.status==='PROSPECT_MANIFEST_UNVERIFIED') {
    return output('PROSPECT_SERVICE_CLAIM_CONFLICT');
  }
  if(!prioritized.selected_count){
    return output('NO_EXISTING_FINALIZE_QUESTIONS_TO_REVIEW');
  }
  const current=prioritized.selected.map(item=>({
    question:item.question,
    original_index:item.original_index,
    origin:'FINALIZE_QUESTION_PLAN',
    intent:item.intent||null
  }));
  const already=current.find(q=>asksSoc2AssuranceDeliverable(q.question));
  if(already) {
    return output('ALREADY_PRESENT_IN_SELECTED_QUESTIONS',{
      selected_count:current.length,existing_questions:current,
      booking_assurance:booking.assurance,
      prospect_service_source_id:service.evidence_id
    });
  }
  const fromFinal=normalized.discovery_questions.find(q=>
    asksSoc2AssuranceDeliverable(q.question) &&
    !current.some(c=>fingerprint(c.question)===fingerprint(q.question)));
  const addition={
    question:fromFinal?.question||QUESTION,
    intent:fromFinal?.intent||INTENT,
    original_index:fromFinal
      ? normalized.discovery_questions.findIndex(q=>q.question===fromFinal.question)+1
      : null,
    origin:fromFinal?'EXISTING_FINALIZE_QUESTION_NOT_SELECTED':'DETERMINISTIC_OFFLINE_SUGGESTION',
    review_required:true,
    basis_ids:['BOOK-001',service.evidence_id]
  };
  let best=null;
  if(current.length<5){
    const proposed=[addition,...current];
    const review=preserveCoverage(current,proposed);
    if(!review.lost.length) {
      best={proposed,replaced:null,coverage:review};
    }
  }else{
    // A full five-question plan requires a tradeoff. Replace exactly ONE item
    // and only if all dimensions covered by the original questions remain
    // covered by the actual proposed question text (not by LLM intents).
    for(let i=0;i<current.length;i++){
      const proposed=[addition,...current.filter((_,index)=>index!==i)];
      const review=preserveCoverage(current,proposed);
      if(review.lost.length) continue;
      const originalTopics=review.before.question_topics[i]?.topics||[];
      const newTopics=coverage([addition]).question_topics[0]?.topics||[];
      const overlap=originalTopics.filter(t=>newTopics.includes(t)).length;
      const score=overlap*10-originalTopics.length;
      if(!best||score>best.score||
          (score===best.score&&current[i].original_index<best.replaced.original_index)){
        best={proposed,replaced:current[i],coverage:review,score};
      }
    }
  }
  if(!best){
    return output('MANUAL_TRADEOFF_REQUIRED',{
      reason:'NO_ONE_QUESTION_REPLACEMENT_PRESERVES_ORIGINAL_TOPIC_COVERAGE',
      original_question_count:current.length,
      uncovered_assurance_requirement:true,
      booking_assurance:booking.assurance
    });
  }
  // No outside evidence, independently checked auditor facts, or purchases
  // are inferred. Source IDs bind ONLY the question's rationale.
  return output('QUESTION_PLAN_PROPOSAL_FOR_CONSULTANT_REVIEW',{
    proposed_count:best.proposed.length,
    proposed_questions:best.proposed,
    original_selected_count:current.length,
    replaced_question:best.replaced,
    replacement_reason:best.replaced
      ? 'FULL_FIVE_QUESTION_PLAN_ASSURANCE_GAP'
      : 'UNFILLED_QUESTION_SLOT',
    booking_assurance:booking.assurance,
    prospect_service_source_id:service.evidence_id,
    question_source: addition.origin,
    covered_topics_before:best.coverage.before.covered,
    covered_topics_after:best.coverage.after.covered,
    dropped_topics:best.coverage.lost,
    limitations:'Human review required: lexical topical retention does not certify relevance, source accuracy, economic readiness, or the quality of this proposed question.'
  });
}
