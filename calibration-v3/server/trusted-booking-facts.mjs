// CLARIS PRIVATE REFERENCE — deterministic Calendly booking fact compiler.
// No network, storage, Make, model, or email calls. Intended future use is
// server-side immediately after authenticated Calendly normalization, before
// any Make workflow can alter booking facts.
const VERSION="claris_trusted_booking_facts_v1";
const ISSUER="SERVER_CALENDLY_FACT_COMPILER_V1";
const WEBSITE_Q="Company website";
const ALIGNMENT_Q="What would you like help with?";
const PREP_Q="Please share anything that will help prepare for our meeting.";
const CHOICES=Object.freeze({
  "API Security Auditing":["SVC_API_AUDIT"],
  "SOC 2 Readiness":["SVC_SOC2"],
  "Both API Security Auditing and SOC 2 Readiness":["SVC_API_AUDIT","SVC_SOC2"],
  "I'm not sure yet / something else":[]
});
const NONPUBLIC=new Set(["local","localhost","internal","invalid","test","example","lan","home","corp","onion"]);
const txt=x=>typeof x==="string"?x.trim():"";
const obj=x=>x&&typeof x==="object"&&!Array.isArray(x);
const deny=(code,extra={})=>({ok:false,error:code,schema_version:VERSION,...extra});
function site(value){
  const raw=txt(value).toLowerCase();
  // Mirror production's strict explicit website semantics without relying on
  // a URL parser: accept a URL/host, extract only its public DNS host, reject
  // credentials/ports/prose/private suffixes, and canonicalize to https.
  if(!/^(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?:\/[\S]*)?$/.test(raw)||
     raw.includes("@")||/\s/.test(raw))return null;
  const noScheme=raw.replace(/^https?:\/\//,"").replace(/^www\./,"");
  const host=noScheme.split(/[\/?#]/)[0].replace(/\.$/,"");
  const labels=host.split("."),last=labels.at(-1);
  if(host.includes(":")||host.length>253||labels.length<2||
     labels.some(x=>!x||x.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x))||
     !/^(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/.test(last)||NONPUBLIC.has(last))
    return null;
  return "https://"+host;
}
function enabledQuestions(eventType){
  return Array.isArray(eventType?.custom_questions)
    ? eventType.custom_questions.filter(q=>q?.enabled===true)
    : [];
}
function exactQuestion(q,name,type,required){
  return q?.name===name&&q?.type===type&&q?.required===required;
}
export function verifyTrustedCalendlyQuestionSchema(eventType){
  const q=enabledQuestions(eventType);
  const website=q.find(x=>x.name===WEBSITE_Q);
  const align=q.find(x=>x.name===ALIGNMENT_Q);
  const prep=q.find(x=>x.name===PREP_Q);
  if(!exactQuestion(website,WEBSITE_Q,"string",true))
    return deny("COMPANY_WEBSITE_QUESTION_SCHEMA_INVALID");
  if(!exactQuestion(align,ALIGNMENT_Q,"single_select",true))
    return deny("ALIGNMENT_QUESTION_SCHEMA_INVALID");
  if(!Array.isArray(align.answer_choices)||
     JSON.stringify(align.answer_choices)!==JSON.stringify(Object.keys(CHOICES))||
     align.include_other!==false)
    return deny("ALIGNMENT_CHOICES_SCHEMA_INVALID");
  if(prep && !exactQuestion(prep,PREP_Q,"string",false))
    return deny("PREPARATION_QUESTION_SCHEMA_INVALID");
  const allowed=new Set([WEBSITE_Q,ALIGNMENT_Q,PREP_Q]);
  if(q.some(x=>!allowed.has(x.name)))return deny("UNRECOGNIZED_ENABLED_QUESTION");
  return {ok:true,schema_version:VERSION,question_schema:"CLARIS_CALENDLY_Q_V1"};
}
function answers(invitee){
  if(!Array.isArray(invitee?.questions_and_answers))return null;
  const list=invitee.questions_and_answers.map(x=>({
    question:txt(x?.question),answer:txt(x?.answer),
    position:Number.isInteger(x?.position)?x.position:null
  }));
  if(list.some(x=>!x.question||!x.answer||x.position===null))return null;
  if(new Set(list.map(x=>x.question)).size!==list.length)return null;
  return list;
}
function directFact(key,value,source,extra={}){
  return {issuer:ISSUER,fact_key:key,established:true,
    source_class:"CALENDLY_DIRECT_ANSWER",direct_prospect_statement:true,
    source_question:source.question,source_position:source.position,
    source_answer:source.answer,...extra,value};
}
export function compileTrustedCalendlyBookingFacts({
  consultant_id,eventType,event,invitee,active_service_ids=[]
}={}){
  const schema=verifyTrustedCalendlyQuestionSchema(eventType);
  if(!schema.ok)return schema;
  const consultant=txt(consultant_id);
  const eventUri=txt(event?.uri),inviteeUri=txt(invitee?.uri);
  if(!/^[A-Za-z0-9_-]{3,80}$/.test(consultant)||
     !eventUri.startsWith("https://api.calendly.com/scheduled_events/")||
     !inviteeUri.startsWith(eventUri+"/invitees/"))
    return deny("CALENDLY_IDENTITY_BINDING_INVALID");
  const list=answers(invitee);
  if(!list)return deny("CALENDLY_ANSWERS_INVALID");
  const byName=new Map(list.map(x=>[x.question,x]));
  const website=byName.get(WEBSITE_Q),alignment=byName.get(ALIGNMENT_Q);
  if(!website||!alignment)return deny("REQUIRED_CALENDLY_ANSWER_MISSING");
  const normalizedSite=site(website.answer);
  if(!normalizedSite)return deny("COMPANY_WEBSITE_INVALID");
  if(!Object.prototype.hasOwnProperty.call(CHOICES,alignment.answer))
    return deny("ALIGNMENT_ANSWER_NOT_IN_SCHEMA");
  const selected=CHOICES[alignment.answer];
  const active=new Set(Array.isArray(active_service_ids)?active_service_ids:[]);
  if(selected.some(id=>!active.has(id)))
    return deny("ALIGNMENT_SERVICE_NOT_ACTIVE");
  const uncertain=selected.length===0;
  const facts=[
    directFact("company_website",normalizedSite,website,{purpose:"BOOKING_IDENTITY"})
  ];
  if(!uncertain){
    facts.push(directFact("documented service/problem alignment",
      selected,alignment,{purpose:"FIRST_CALL_REQUIRED",service_ids:[...selected]}));
  }
  const prep=byName.get(PREP_Q);
  if(prep)facts.push(directFact("booking_preparation_text",prep.answer,prep,{
    purpose:"SUPPLEMENTAL_CONTEXT"
  }));
  return {
    ok:true,schema_version:VERSION,issuer:ISSUER,
    opportunity_id:"calendly_"+inviteeUri.split("/").at(-1),
    consultant_id:consultant,
    source:{kind:"CALENDLY",event_uri:eventUri,invitee_uri:inviteeUri,
      question_schema:schema.question_schema},
    facts,
    zero_question_fact_candidates:uncertain?[]:
      ["documented service/problem alignment"],
    policy_derived_fact_candidates:uncertain?[]:["not affirmatively disqualified"],
    clarification_required_by_booking_facts:uncertain
  };
}

export function evaluateTrustedBookingQualification({envelope,policy}={}){
  if(!envelope?.ok||envelope.schema_version!==VERSION||envelope.issuer!==ISSUER)
    return deny("TRUSTED_BOOKING_FACT_ENVELOPE_INVALID");
  if(!obj(policy?.qualification_rules)||!obj(policy?.commercial_rules)||
     !obj(policy?.ideal_client_profile))
    return deny("QUALIFICATION_POLICY_INVALID");
  if(policy.qualification_rules.unknown_is_not_negative!==true||
     policy.ideal_client_profile.unknown_is_acceptable!==true)
    return deny("UNKNOWN_POLICY_NOT_PERMISSIVE");
  const alignment=(envelope.facts||[]).find(f=>
    f.fact_key==="documented service/problem alignment"&&
    f.established===true&&f.direct_prospect_statement===true&&
    Array.isArray(f.service_ids)&&f.service_ids.length>0);
  if(!alignment)return deny("SERVICE_ALIGNMENT_UNESTABLISHED");
  const budget=(envelope.facts||[]).find(f=>f.fact_key==="budget"&&f.established===true);
  const floor=policy.commercial_rules.minimum_viable_engagement_usd;
  if(budget){
    if(!Number.isFinite(budget.amount)||budget.amount<0||typeof budget.currency!=="string")
      return deny("KNOWN_BUDGET_INVALID");
    if(Number.isFinite(floor)&&floor>0){
      if(budget.currency!=="USD")return deny("KNOWN_BUDGET_CURRENCY_UNCOMPARABLE");
      if(budget.amount<floor)return {
        ok:true,schema_version:VERSION,issuer:"SERVER_BOOKING_POLICY_EVALUATOR_V1",
        established:false,fact_key:"not affirmatively disqualified",
        purpose:"FIRST_CALL_REQUIRED",reason:"KNOWN_BUDGET_BELOW_FLOOR"
      };
    }
  }
  return {
    ok:true,schema_version:VERSION,issuer:"SERVER_BOOKING_POLICY_EVALUATOR_V1",
    established:true,fact_key:"not affirmatively disqualified",
    purpose:"FIRST_CALL_REQUIRED",direct_prospect_statement:false,
    derivation:"NO_AFFIRMATIVE_DISQUALIFIER_IN_TRUSTED_BOOKING_FACTS",
    basis_fact_keys:["documented service/problem alignment"],
    unknown_is_not_negative:true,unknown_is_acceptable:true
  };
}
export function createTrustedBookingFactResolver(envelope){
  if(!envelope?.ok||envelope.schema_version!==VERSION||envelope.issuer!==ISSUER)
    throw Error("TRUSTED_BOOKING_FACT_ENVELOPE_INVALID");
  const map=new Map((envelope.facts||[]).map(f=>[f.fact_key,f]));
  return ({name,purpose})=>{
    const fact=map.get(name);
    if(!fact||fact.purpose!==purpose||fact.issuer!==ISSUER||
       fact.established!==true||fact.direct_prospect_statement!==true)return null;
    return {
      issuer:"SERVER_CANONICAL_COMPILER_V1",fact_key:name,purpose,
      established:true,direct_prospect_statement:true,
      source_attestation:{
        compiler:ISSUER,opportunity_id:envelope.opportunity_id,
        source_question:fact.source_question,source_position:fact.source_position,
        value:fact.value,service_ids:fact.service_ids||[]
      }
    };
  };
}
export const trustedCalendlyQuestionContract=Object.freeze({
  version:"CLARIS_CALENDLY_Q_V1",website_question:WEBSITE_Q,
  alignment_question:ALIGNMENT_Q,preparation_question:PREP_Q,
  alignment_choices:Object.keys(CHOICES)
});
