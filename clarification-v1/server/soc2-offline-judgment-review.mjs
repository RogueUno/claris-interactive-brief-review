import { normalizeFinalArtifact } from './final-brief-renderer.mjs';
import { extractPersistedBookingContext } from './persisted-booking-discovery-gate.mjs';
import { deriveAcceptedProspectManifest } from './accepted-prospect-evidence.mjs';
import { inspectProspectClaimConsistency } from './prospect-claim-consistency.mjs';

// Read-only, deliberately narrow offline judgment aid for the fictional SOC 2
// booking rehearsal. It is NOT semantic certification, factual verification,
// provider audit, authorization to persist, or authorization to contact anyone.
// Findings identify review work; silence never proves a statement is true.
const SOC2=/\bSOC\s*2\b/i;
// An isolated questionnaire keyword does not establish that the consultant
// distinguished a customer questionnaire from a formal SOC 2 report.
export function asksSoc2AssuranceDeliverable(question) {
  const q=String(question||'');
  const form=/\b(?:security\s+|vendor\s+|customer\s+)?questionnaire\b/i.test(q);
  const report=/\b(?:SOC\s*2|audit|attestation|assurance|report|Type\s*I(?:I)?\b)\b/i.test(q);
  const explicit=/\b(?:what|which|whether|does|did|request(?:ed)?|require(?:d)?|need|expect|versus|instead|deliverable)\b/i.test(q);
  return form && report && explicit;
}
const REHEARSAL=/\b(fictional|rehearsal|synthetic|simulated|test.only)\b/i;
const ASSERT_BUDGET=/\b(?:budget|funding)\s+(?:is|was|has\s+been)\s+(?:approved|secured|allocated|confirmed)\b|\b(?:approved|secured|allocated|confirmed)\s+(?:advisory\s+|project\s+)?budget\b/i;
const ASSERT_DATE=/\b(?:deadline|date|timeline|timing)\s+(?:is|was|has\s+been)\s+(?:confirmed|fixed|agreed|set)\b|\bconfirmed\s+(?:deadline|date|timeline)\b/i;
const ASSERT_FAILURE=/\b(?:identified|confirmed|detected|observed)\s+(?:(?:major|material|critical|significant|specific)\s+)?(?:control\s+gaps?|control\s+failures?|compliance\s+gaps?|deficienc(?:y|ies))\b|\b(?:access|change|security)\s+controls?\s+(?:have\s+)?failed\b/i;
const ASSERT_AUTHORITY=/\b(?:decision\s*maker|budget\s*owner|economic\s*buyer|approver)\s+(?:is|has\s+been|was)\s+(?:confirmed|verified|identified)\b/i;

const result=(status,checks=[],context={})=>({
  status,
  review_only:true,
  factual_assurance:'NOT_INDEPENDENTLY_VERIFIED',
  semantic_assurance:'NOT_CERTIFIED',
  commercial_readiness:'NOT_CERTIFIED',
  write_authorized:false,
  delivery_authorized:false,
  ...context,
  checks,
  review_required: status!=='NOT_EVALUATED_OUTSIDE_SCOPE'
});

// Scan ONLY text offered as diagnosis/assessment, not questions, risks,
// quoted answers, disclaimers, or a proposed conditional next step.
function assertionFields(input) {
  const raw=input?.claris_final_brief && typeof input.claris_final_brief==='object'
    ? input.claris_final_brief : input;
  const textFields=[
    ['match_score_explanation.overall_assessment',raw?.match_score_explanation?.overall_assessment],
    ['strategic_guidance.rationale',raw?.strategic_guidance?.rationale],
    ['preliminary_brief_markdown',raw?.preliminary_brief_markdown]
  ];
  return textFields.filter(([,value])=>typeof value==='string');
}

function asserted(value,pattern) {
  // Excludes explicit negations adjacent to a positive claim. Never scans
  // interrogatives or hypothetical content as affirmed facts.
  return String(value).split(/(?:[.!?]\s+|\n+)/).some(clause=>
    pattern.test(clause) && !/\b(?:not|never|no\s+verified|without|unconfirmed|unverified|hypothetical|if|whether|before|do\s+not)\b/i.test(clause)
    && !clause.includes('?'));
}

export function reviewOfflineSoc2ConsultantJudgment(input,{envelope}={}) {
  let n;
  try { n=normalizeFinalArtifact(input); }
  catch {
    return result('REVIEW_INPUT_INVALID',[{
      code:'FINAL_ARTIFACT_UNREADABLE',category:'input',severity:'critical',
      path:'artifact',action:'Provide the actual FINALIZE output in a readable schema.'
    }]);
  }
  const source=extractPersistedBookingContext(envelope);
  const accepted=deriveAcceptedProspectManifest(envelope);
  if(!source.ok || !accepted.ok) {
    return result('SOURCE_BINDING_REQUIRED',[{
      code:'PERSISTED_BOOKING_AND_ACCEPTED_MANIFEST_REQUIRED',
      category:'evidence',severity:'critical',path:'clarification.envelope',
      action:'Evaluate against a submitted, persisted booking and normalized accepted answers; do not infer facts from the artifact.'
    }],{booking_assurance:source.ok?source.assurance:'NOT_VERIFIED',
      accepted_answer_count:accepted.ok?accepted.entries.length:0});
  }
  if(!SOC2.test(source.booking.verbatim_text)) {
    return result('NOT_EVALUATED_OUTSIDE_SCOPE',[],{
      booking_assurance:source.assurance,accepted_answer_count:accepted.entries.length
    });
  }
  const checks=[];
  const add=(code,category,severity,path,action,evidence_refs=[])=>{
    checks.push({code,category,severity,path,evidence_refs,action});
  };
  const byPrompt=(regex)=>accepted.entries.find(e=>regex.test(e.prompt||''));
  const budget=byPrompt(/\b(?:budget|funding|spend)\b/i);
  const timing=byPrompt(/\b(?:timing|date|deadline|when)\b/i);
  const authority=byPrompt(/\b(?:authority|approve|decision.maker|decision\s+owner)\b/i);
  const budgetUnknown=budget?.answer_kind==='UNSURE' ||
    (budget && /\b(not\s+sure|unknown|not\s+confirmed|not\s+approved)\b/i.test(String(budget.value)));
  const timingUnknown=timing?.answer_kind==='UNSURE' ||
    (timing && /\b(not\s+sure|unknown|not\s+confirmed|unconfirmed|not\s+established)\b/i.test(String(timing.value)));
  const authorityKnown=authority && authority.answer_kind!=='UNSURE' &&
    !/\b(not\s+sure|unknown|not\s+confirmed|unverified)\b/i.test(String(authority.value));
  const fields=assertionFields(input);

  for(const [path,value] of fields) {
    if(budgetUnknown && asserted(value,ASSERT_BUDGET)) {
      add('BUDGET_ASSERTED_AGAINST_UNKNOWN_ANSWER','claim','critical',path,
        'Keep budget unconfirmed until the buyer establishes approval and authority.',[budget.evidence_id]);
    }
    if(timingUnknown && asserted(value,ASSERT_DATE)) {
      add('DEADLINE_ASSERTED_AGAINST_UNCONFIRMED_ANSWER','claim','critical',path,
        'Distinguish the customer event from an actual dated requirement.',[timing.evidence_id]);
    }
    if(!authorityKnown && asserted(value,ASSERT_AUTHORITY)) {
      add('DECISION_AUTHORITY_ASSERTED_WITHOUT_ACCEPTED_BASIS','claim','critical',path,
        'Ask who authorizes scope and commercial terms; avoid declaring a confirmed buyer.');
    }
    if(asserted(value,ASSERT_FAILURE)) {
      add('CONTROL_FAILURE_ASSESSED_WITHOUT_VERIFIED_FINDING','claim','critical',path,
        'Recast control weaknesses as evidence-review questions until independently supported.');
    }
  }

  // Check the actual questions rather than their self-described intents:
  // intent-only lexical coverage can manufacture apparent discovery depth.
  const questions=n.discovery_questions.map(q=>String(q.question||''));
  if(!questions.some(asksSoc2AssuranceDeliverable)) {
    add('SOC2_DELIVERABLE_DISAMBIGUATION_NOT_ASKED','first_call','important',
      'discovery_question_plan',
      'Ask what the enterprise actually requires: a questionnaire, a Type I/II report, or another form of assurance; distinguish this from an audit deadline.',
      ['BOOK-001']);
  }
  if(!questions.some(q=>/\b(scope|system\s+boundary|systems?|infrastructure|products?|cloud\s+accounts)\b/i.test(q))) {
    add('SYSTEM_BOUNDARY_NOT_ASKED','first_call','important','discovery_question_plan',
      'Identify the product, system boundary, supporting teams, and third parties in scope.');
  }
  if(!questions.some(q=>/\b(evidence|controls?|polic(?:y|ies)|access\s+reviews?|change\s+management)\b/i.test(q))) {
    add('EVIDENCE_MATURITY_NOT_ASKED','first_call','important','discovery_question_plan',
      'Identify existing controls and evidence owners before asserting gaps.');
  }
  if(!questions.some(q=>/\b(budget|approv|funding|investment)\b/i.test(q))) {
    add('COMMERCIAL_DECISION_NOT_ASKED','first_call','important','discovery_question_plan',
      'Ask the economic buyer and engagement-approval path; do not invent purchasing intent.');
  }

  if(REHEARSAL.test(String(n.preliminary_brief_markdown||'')) &&
    !REHEARSAL.test(source.booking.verbatim_text)) {
    add('REHEARSAL_LANGUAGE_LEAKS_INTO_COMMERCIAL_BRIEF','presentation','important',
      'preliminary_brief_markdown',
      'Keep the fictional disclaimer in the test harness, never a purported real prospect brief.');
  }
  if(Object.values(n.metrics).some(value=>value!==null)) {
    add('NUMERIC_METRICS_METHODOLOGY_NOT_INDEPENDENTLY_AUDITED',
      'score', 'review','deterministic_metrics',
      'Do not sell the numeric match/evidence scores as independently verified; inspect the deterministic calculation and evidence coverage.');
  }
  if(budgetUnknown && String(n.qualification_status||'').toUpperCase().startsWith('QUALIFIED')) {
    add('QUALIFICATION_LABEL_REQUIRES_ECONOMIC_CAVEAT','positioning','review',
      'strategic_guidance.qualification_status',
      'Clearly distinguish suitable for exploratory discovery from commercially qualified or ready to purchase.',
      [budget.evidence_id]);
  }
  const claim=inspectProspectClaimConsistency(input,envelope);
  if(claim.conflict_count>0) {
    add('ACCEPTED_SERVICE_LABEL_CONFLICT','evidence','critical',
      'intelligence_lineage','Correct the prospect service claim against its accepted selected option.',
      claim.checks.filter(c=>c.outcome==='CONFLICT').map(c=>c.source_id));
  }
  return result('MANUAL_COMMERCIAL_REVIEW_REQUIRED',checks,{
    booking_assurance:source.assurance,
    accepted_answer_count:accepted.entries.length,
    supported_evidence_ids:accepted.entries.map(e=>e.evidence_id),
    open_commercial_unknowns:{
      budget:budgetUnknown?'UNCONFIRMED':'NOT_DETERMINED_BY_THIS_REVIEW',
      timing:timingUnknown?'UNCONFIRMED':'NOT_DETERMINED_BY_THIS_REVIEW',
      authority:authorityKnown?'ANSWER_PRESENT_NOT_INDEPENDENTLY_VERIFIED':'NOT_ESTABLISHED'
    },
    prospect_service_claim_check:claim.status,
    question_count:questions.length,
    // Diagnostics do not confer a positive pass or permission to act.
    limitations:'Rules target narrow SOC 2 risks, not exhaustive semantics or real-world consultant value; human evidence review remains necessary.'
  });
}
