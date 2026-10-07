// Candidate-only zero-question governance overlay.
// Pure dependency injection: no storage, provider, Make or email calls here.
const text=x=>typeof x==="string"?x.trim():"";
const obj=x=>x&&typeof x==="object"&&!Array.isArray(x);
const parse=x=>{
  if(obj(x))return x;
  if(typeof x!=="string"||!x.trim())return null;
  try{const v=JSON.parse(x);return obj(v)?v:null}catch{return null}
};
const cleanPass=v=>obj(v)&&v.verdict==="PASS"&&Array.isArray(v.issues)&&v.issues.length===0;
const action=x=>text(x).toUpperCase();
const blocked=reason=>({ok:false,status:"BLOCKED",next_action:"BLOCKED",
 error:"TRUSTED_FIRST_CALL_PROOF_UNAVAILABLE",
 policy_gate:{version:"claris_first_call_fact_gate_v1",status:"BLOCKED",reason}});
function exactBookingEvidence(evidence,answer){
  const target=text(answer);
  if(!target)return null;
  const matches=(Array.isArray(evidence)?evidence:[]).filter(e=>{
    if(e?.source_type!=="BOOKING"||e?.visibility!=="PROSPECT_SAFE"||
       !["BOOKING_TEXT","CALENDLY_REQUIRED_FIELD"].includes(e?.channel))return false;
    const lines=String(e?.statement||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    return lines.includes(target)||text(e?.statement)===target;
  });
  return matches.length===1?matches[0]:null;
}
function directFactBound(envelope,evidence,name,purpose){
  const fact=(envelope?.facts||[]).find(x=>x?.fact_key===name&&x?.purpose===purpose&&
    x?.established===true&&x?.direct_prospect_statement===true);
  if(!fact)return null;
  const source=exactBookingEvidence(evidence,fact.source_answer);
  if(!source)return null;
  return {name,evidence_id:source.evidence_id,fact};
}
function requiredRules(policy){
  const rules=policy?.qualification_rules?.required_for_first_call;
  if(!Array.isArray(rules)||!rules.length||rules.length>20||
     rules.some(x=>!text(x)||text(x).length>200))return null;
  const unique=[...new Set(rules.map(text))];
  if(policy?.commercial_rules?.budget_required_before_first_call===true&&
     !unique.some(x=>x.toLowerCase()==="budget"))unique.push("budget");
  return unique;
}
function budgetValid(bound,policy){
  const fact=bound?.fact;
  if(!fact||!Number.isFinite(fact.amount)||fact.amount<0||
     !/^[A-Z]{3}$/.test(fact.currency||""))return false;
  const floor=policy?.commercial_rules?.minimum_viable_engagement_usd;
  if(floor==null||floor===0)return true;
  if(!Number.isFinite(floor)||floor<0||fact.currency!=="USD")return false;
  return fact.amount>=floor;
}
export function createTrustedFirstCallGovernance({
  runProtocolStep,adaptPrepare,normalizePolicy,evaluateQualification,
  loadBookingFacts,loadProfileEnvelope
}={}){
  if([runProtocolStep,adaptPrepare,normalizePolicy,evaluateQualification,
      loadBookingFacts,loadProfileEnvelope].some(x=>typeof x!=="function"))
    throw Error("TRUSTED_FIRST_CALL_GOVERNANCE_DEPENDENCY_REQUIRED");
  return {async apply(input,baseResult){
    const step=action(input?.action);
    if(!["VERIFICATION","REPAIRED_VERIFICATION"].includes(step))return baseResult;
    const proposal=parse(input?.proposal??input?.proposal_json);
    const verifier=parse(input?.verification??input?.verification_json);
    if(action(proposal?.decision)!=="SKIP"||!cleanPass(verifier))return baseResult;
    if(baseResult?.status!=="NO_CLARIFICATION")return baseResult;

    const opportunityId=text(input?.opportunity_id);
    let loaded,profile,bundle,policy;
    try{
      loaded=await loadBookingFacts(opportunityId);
      if(!loaded?.ok||!loaded.envelope||!loaded.etag) return blocked("BOOKING_FACTS_NOT_AVAILABLE");
      profile=await loadProfileEnvelope(loaded.envelope.consultant_id);
      if(!profile||profile.lifecycle_record?.status!=="LOCKED"||
         profile.lifecycle_record?.consultant_id!==loaded.envelope.consultant_id||
         profile.lifecycle_record?.runtime_v3?.status!=="READY"||
         !profile.lifecycle_record.runtime_v3.consultant_sot_json)
        return blocked("LOCKED_RUNTIME_NOT_AVAILABLE");
      if(text(input?.consultant?.consultant_id)!==loaded.envelope.consultant_id)
        return blocked("CONSULTANT_BINDING_MISMATCH");
      bundle=adaptPrepare(input);
      if(bundle?.opportunity_id!==opportunityId||
         bundle?.consultant?.consultant_id!==loaded.envelope.consultant_id)
        return blocked("PREPARE_BINDING_MISMATCH");
      policy=normalizePolicy(profile.lifecycle_record.runtime_v3.consultant_sot_json);
    }catch{return blocked("TRUSTED_PROOF_READ_FAILED")}

    const rules=requiredRules(policy);
    if(!rules)return blocked("FIRST_CALL_POLICY_INVALID");
    const missing=[];
    const alignment=directFactBound(
      loaded.envelope,bundle.evidence,
      "documented service/problem alignment","FIRST_CALL_REQUIRED"
    );

    for(const rule of rules){
      const lower=rule.toLowerCase();
      if(rule==="documented service/problem alignment"){
        if(!alignment)missing.push(rule);
        continue;
      }
      if(rule==="not affirmatively disqualified"){
        let qualification;
        try{qualification=evaluateQualification({envelope:loaded.envelope,policy})}
        catch{qualification=null}
        if(!alignment||qualification?.ok!==true||qualification?.established!==true||
           qualification?.fact_key!=="not affirmatively disqualified")
          missing.push(rule);
        continue;
      }
      const purpose=lower==="budget"?"BUDGET_DIRECT":"FIRST_CALL_REQUIRED";
      const bound=directFactBound(loaded.envelope,bundle.evidence,rule,purpose);
      if(!bound||(lower==="budget"&&!budgetValid(bound,policy)))missing.push(rule);
    }

    if(!missing.length){
      return {...baseResult,policy_gate:{
        version:"claris_first_call_fact_gate_v1",
        status:"ATTESTED_ZERO_QUESTION_ELIGIBLE",
        final_delivery_authorized:false
      }};
    }

    const governed=runProtocolStep({
      ...input,
      verification:{
        verdict:"FAIL",
        issues:[{code:"REQUIRED_FIRST_CALL_PROOF_MISSING",path:"decision",
          detail:"One or more consultant-required first-call facts are not independently established. Repair with the minimum low-friction DISCOVER question(s); do not infer missing facts.",
          evidence_ids:[]}]
      },
      verification_json:undefined
    });
    return {...governed,policy_gate:{
      version:"claris_first_call_fact_gate_v1",status:"SKIP_DENIED",
      missing_count:missing.length,final_delivery_authorized:false
    }};
  }};
}
