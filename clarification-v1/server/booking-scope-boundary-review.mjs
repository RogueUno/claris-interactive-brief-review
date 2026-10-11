import { parseFinalArtifact, normalizeFinalArtifact } from './final-brief-renderer.mjs';
import { extractPersistedBookingContext } from './persisted-booking-discovery-gate.mjs';

// Negative scope guard, not semantic certification or delivery authorization.
// Text is inspected transiently; only field paths and reason codes are returned.
const REHEARSAL=/\b(?:synthetic|rehearsal|simulat(?:ion|ed)|internal test|test research)\b/i;
const NO_CONTACT=/\b(?:do not|don't|never|must not|no)\s+(?:(?:direct|actual|external|outbound)\s+)?(?:contact|email|message|reach out|approach)\b|\bwithout\s+(?:any\s+)?(?:prospect\s+)?contact\b/i;
const SENTINEL_SERVICE=/^(?:NONE_APPLICABLE|NOT_APPLICABLE|NONE|UNKNOWN|N\/A|NOT_CLASSIFIED)$/i;
const POSITIVE_QUALIFIED=/^(?:QUALIFIED|SALES_READY|READY_TO_BUY|COMMERCIAL_READY|QUALIFIED_LEAD|READY_FOR_OUTREACH)$/i;
const POSITIVE_CONTACT=/\b(?:contact|email|message|reach out to|follow up with|send (?:an? )?(?:email|message)|book (?:a |an )?(?:call|meeting)|schedule (?:a |an )?(?:call|meeting))\b.{0,85}\b(?:prospect|buyer|client|lead)\b/i;
const NEGATIVE_DIRECTIVE=/\b(?:do not|don't|never|must not|should not|avoid|bypass|exclude|forbid|without|no)\b.{0,48}\b(?:contact|email|message|reach out|follow up|schedule|book|pitch|sell|proposal)\b/i;
const SALES_DIRECTIVE=/\b(?:pitch|sell to|close (?:the )?(?:prospect|buyer)|convert (?:the )?(?:prospect|lead)|send (?:a |the )?proposal|launch (?:a |the )?(?:paid|commercial) engagement)\b/i;
const REHEARSAL_ACTION=/\b(?:rehearsal|synthetic|simulat(?:ion|ed)|test research|test(?:ing)? (?:scope|only|protocol))\b/i;
const UNSCOPED_SERVICE=/^(?:HIGH|DIRECT_MATCH|CONFIRMED_NEED|RECOMMENDED|ACTIVE|SELL|PROPOSE)$/i;
const SCOPE_EXCEPTION=/\b(?:scope conflict|out.of.scope|excluded|rehearsal boundary|not applicable|do not pursue|must be bypassed)\b/i;
const DECISION_FIELDS=new Set(['recommended_action','next_step','next_steps','proposed_action','action','call_to_action','engagement_recommendation','commercial_recommendation']);
const IGNORE_FIELDS=new Set(['evidence_id','source_id','source_execution','basis_ids','domain','url','source_url']);

function scanStrings(value,visit,path='',depth=0,budget={count:0}) {
  if(depth>18||budget.count>=4000) return;
  if(typeof value==='string') { budget.count++; visit(path,value); return; }
  if(Array.isArray(value)) {
    value.forEach((item,i)=>scanStrings(item,visit,path+'['+i+']',depth+1,budget));return;
  }
  if(!value||typeof value!=='object') return;
  for(const [key,item] of Object.entries(value)){
    if(IGNORE_FIELDS.has(key))continue;
    scanStrings(item,visit,path?path+'.'+key:key,depth+1,budget);
  }
}

export function inspectBookingScopeBoundary(artifact,envelope) {
  const deny=(status,reason)=>({
    status,booking_scope:'UNVERIFIED',conflict_count:0,conflicts:[],
    pilot_eligibility:'BLOCKED',semantic_assurance:'NOT_CERTIFIED',
    manual_review_required:true,reason
  });
  const source=extractPersistedBookingContext(envelope);
  if(!source.ok)return deny('BOOKING_CONTEXT_UNVERIFIED',source.reason);
  const booking=source.booking.verbatim_text;
  if(!REHEARSAL.test(booking)||!NO_CONTACT.test(booking)) {
    return deny('SCOPE_NOT_SYNTHETIC_NO_CONTACT_CONFIRMED',
      'THIS_GUARD_ONLY_EVALUATES_EXPLICIT_SYNTHETIC_NO_CONTACT_MANDATES');
  }
  let raw,normalized;
  try{
    const parsed=parseFinalArtifact(artifact);
    raw=Object.keys(parsed.claris_final_brief||{}).length?parsed.claris_final_brief:parsed;
    normalized=normalizeFinalArtifact(parsed);
  }catch{return deny('CANDIDATE_UNREADABLE','FINALIZE_ARTIFACT_INVALID');}
  const conflicts=[],seen=new Set();
  const add=(path,reason)=>{
    const key=path+'|'+reason;
    if(!seen.has(key)){seen.add(key);conflicts.push({field:path,reason});}
  };
  const service=String(normalized.primary_service_id||'').trim();
  if(service&&!SENTINEL_SERVICE.test(service))
    add('normalized.primary_service_id','LIVE_SERVICE_RECOMMENDATION_IN_SYNTHETIC_SCOPE');
  const qualification=String(normalized.qualification_status||'').trim();
  if(POSITIVE_QUALIFIED.test(qualification))
    add('normalized.qualification_status','COMMERCIAL_QUALIFICATION_IN_REHEARSAL');
  const action=String(normalized.recommended_action||'');
  if(action&&!REHEARSAL_ACTION.test(action)&&
      (SALES_DIRECTIVE.test(action)||POSITIVE_CONTACT.test(action)))
    add('normalized.recommended_action','UNAUTHORIZED_COMMERCIAL_ACTION');
  const services=Array.isArray(raw.potential_service_relevance)?raw.potential_service_relevance:[];
  services.forEach((item,i)=>{
    if(!item||typeof item!=='object')return;
    const relevance=String(item.relevance||item.status||'');
    const caution=[item.relevance_rationale,item.reason,item.scope_warning].filter(Boolean).join(' ');
    if(UNSCOPED_SERVICE.test(relevance)&&!SCOPE_EXCEPTION.test(caution))
      add('potential_service_relevance['+i+']','SERVICE_PROMOTED_WITHOUT_SCOPE_EXCEPTION');
  });
  let scanned_text_fields=0;
  scanStrings(raw,(path,text)=>{
    scanned_text_fields++;
    const leaf=String(path.split('.').at(-1)||'').replace(/\[\d+\]/g,'');
    // A negative instruction earlier in a long markdown field must not
    // suppress a later positive outreach command in the same field.
    const clauses=text.split(/(?:[.!?;]\s+|\r?\n+|,\s*but\s+|\bhowever,?\s+)/i);
    for(const clause of clauses){
      if(POSITIVE_CONTACT.test(clause)&&!NEGATIVE_DIRECTIVE.test(clause))
        add(path,'PROSPECT_CONTACT_DIRECTIVE_IN_NO_CONTACT_SCOPE');
      if(SALES_DIRECTIVE.test(clause)&&!NEGATIVE_DIRECTIVE.test(clause)&&
         (DECISION_FIELDS.has(leaf)||/\b(?:recommend|should|next step|proceed to)\b/i.test(clause)))
        add(path,'UNAUTHORIZED_SALES_DIRECTIVE_IN_REHEARSAL');
    }
  });
  return {
    status:conflicts.length?'SYNTHETIC_SCOPE_CONFLICT_DETECTED':'SYNTHETIC_SCOPE_NOT_CONTRADICTED',
    booking_scope:'SYNTHETIC_NO_CONTACT',
    conflict_count:conflicts.length,
    conflicts:conflicts.slice(0,30),
    scanned_text_fields,
    pilot_eligibility:'BLOCKED_SYNTHETIC_NO_CONTACT',
    semantic_assurance:'NOT_CERTIFIED',
    manual_review_required:true,
    note:'Negative scope guard only; no flagged directive does not certify the candidate or permit a commercial snapshot or delivery.'
  };
}
