import { normalizeFinalArtifact } from './final-brief-renderer.mjs';
import { deriveAcceptedProspectManifest } from './accepted-prospect-evidence.mjs';

// Only tests an AI claim's specific service-selection label against the
// persisted accepted answer and the meaning of its form prompt.
// It does NOT certify prospect intent, scope exclusions, other claims,
// or the adequacy of an entire commercial brief. No provider calls or writes.
const SERVICES=Object.freeze({
  SOC2:/\bSOC\s*2\b/i,
  ISO27001:/\bISO[\s-]*27001\b/i,
  VCISO:/\b(?:vCISO|virtual\s+CISO)\b/i
});
const QUESTION_INTENT=/\b(interested|interest|need|needs|looking for|explor(?:e|ing)|want|wants|consider(?:ing)?|request(?:ing)?)\b/i;
const NEGATIVE_PROMPT=/\b(already (?:own|owns|owned|purchased|pays for)|currently (?:use|uses|using|own)|not interested|no interest|not needed|do not need|don't need)\b/i;
const NEGATIVE_ANSWER=/\b(?:not interested|no interest|don't want|do not want|not needed|no need|not looking for|decline|none of the above)\b/i;
const SERVICE_CLAIM=/\b(?:interest|interested|need|requested|request|seeking|looking for|expressed|wants|considering)\b/i;

function identifiedServices(text) {
  return Object.entries(SERVICES)
    .filter(([,expression])=>expression.test(String(text||'')))
    .map(([id])=>id);
}
function resolvedSelectedOption(envelope,entry) {
  const q=envelope.package.questions.find(q=>q.question_id===entry.question_id);
  const opts=Array.isArray(q?.options)?q.options:[];
  if(entry.answer_kind!=='OPTION' || typeof entry.value!=='string' ||
      typeof entry.selected_option_id!=='string') return false;
  return opts.some(o=>typeof o==='object' &&
    o.option_id===entry.selected_option_id && o.label===entry.value);
}

export function inspectProspectClaimConsistency(artifact,envelope) {
  const manifest=deriveAcceptedProspectManifest(envelope);
  if(!manifest.ok) return {
    status:'PROSPECT_MANIFEST_UNVERIFIED',
    source_claim_count:0,aligned_count:0,conflict_count:0,manual_review_count:0,
    checks:[],scope_assurance:'NOT_EVALUATED',semantic_assurance:'NOT_CERTIFIED'
  };
  const byId=new Map(manifest.entries.map(entry=>[entry.evidence_id,entry]));
  let lineage;
  try{lineage=normalizeFinalArtifact(artifact).intelligence_lineage;}
  catch{return {
    status:'CANDIDATE_UNREADABLE',
    source_claim_count:0,aligned_count:0,conflict_count:0,manual_review_count:0,
    checks:[],scope_assurance:'NOT_EVALUATED',semantic_assurance:'NOT_CERTIFIED'
  };}
  const claims=lineage.filter(item=>/^PROS-[0-9]{3,}$/.test(item.source_id||''));
  const checks=claims.map(item=>{
    const id=item.source_id;
    const entry=byId.get(id);
    const claim=String(item.usage||'');
    let outcome='MANUAL_REVIEW_REQUIRED';
    let reason='CLAIM_NOT_NARROW_SERVICE_SELECTION';
    if(!entry){
      outcome='CONFLICT';
      reason='NO_ACCEPTED_SOURCE_FOR_CLAIM';
    }else{
      const named=identifiedServices(claim);
      if(!claim || named.length!==1 || !SERVICE_CLAIM.test(claim)){
        reason='CLAIM_NOT_NARROW_SERVICE_SELECTION';
      }else if(entry.answer_kind!=='OPTION' ||
               !resolvedSelectedOption(envelope,entry)){
        reason='NO_VERIFIED_SELECTED_OPTION_LABEL';
      }else if(NEGATIVE_ANSWER.test(entry.value)){
        outcome='CONFLICT';
        reason='ACCEPTED_ANSWER_NEGATES_INTEREST';
      }else{
        const selected=identifiedServices(entry.value);
        if(selected.length===1 && selected[0]!==named[0]){
          outcome='CONFLICT';
          reason='ACCEPTED_SERVICE_LABEL_MISMATCH';
        }else if(selected.length!==1){
          reason='ACCEPTED_SERVICE_LABEL_AMBIGUOUS';
        }else if(!QUESTION_INTENT.test(entry.prompt)||NEGATIVE_PROMPT.test(entry.prompt)){
          reason='FORM_PROMPT_DOES_NOT_ESTABLISH_INTEREST';
        }else{
          outcome='LABEL_ALIGNED_REVIEW_REQUIRED';
          reason='SELECTED_OPTION_AND_PROMPT_COMPATIBLE';
        }
      }
    }
    return {source_id:id,outcome,reason};
  });
  const aligned_count=checks.filter(c=>c.outcome==='LABEL_ALIGNED_REVIEW_REQUIRED').length;
  const conflict_count=checks.filter(c=>c.outcome==='CONFLICT').length;
  const manual_review_count=checks.length-aligned_count-conflict_count;
  return {
    status:conflict_count?'PROSPECT_CLAIM_CONFLICT_DETECTED':
      !checks.length?'NO_PROSPECT_CLAIMS':
      manual_review_count?'MANUAL_REVIEW_REQUIRED':
      'NARROW_LABEL_ALIGNMENT_ONLY',
    source_claim_count:checks.length,aligned_count,conflict_count,
    manual_review_count,checks,
    scope_assurance:'NOT_EVALUATED',
    semantic_assurance:'NOT_CERTIFIED',
    note:'Only a selected service label and its prompt can be checked; this does not validate additional AI claims, buyer intent, or booking scope.'
  };
}
