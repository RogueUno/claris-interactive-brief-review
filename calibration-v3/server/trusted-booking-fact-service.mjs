// CLARIS PRIVATE REFERENCE — server-side booking fact service candidate.
// Pure dependency injection: does not call Blob, Make, Calendly or a model by itself.
const EXPECTED_EVENT_TYPE=Object.freeze({custom_questions:[
 {name:"Company website",type:"string",position:0,enabled:true,required:true,answer_choices:[],include_other:false},
 {name:"What would you like help with?",type:"single_select",position:1,enabled:true,required:true,
  answer_choices:["API Security Auditing","SOC 2 Readiness","Both API Security Auditing and SOC 2 Readiness","I'm not sure yet / something else"],include_other:false},
 {name:"Please share anything that will help prepare for our meeting.",type:"string",position:2,enabled:true,required:false,answer_choices:[],include_other:false}
]});
const txt=x=>typeof x==="string"?x.trim():"";
const block=(error)=>({ok:false,error});
const CLARIFY=new Set(["SERVICE_ALIGNMENT_UNESTABLISHED","UNKNOWN_POLICY_NOT_PERMISSIVE","KNOWN_BUDGET_CURRENCY_UNCOMPARABLE"]);
export function createTrustedBookingFactService({
 loadProfileEnvelope,compileFacts,evaluateQualification
}={}){
 if(typeof loadProfileEnvelope!=="function"||typeof compileFacts!=="function"||
    typeof evaluateQualification!=="function")
   throw Error("TRUSTED_BOOKING_FACT_SERVICE_DEPENDENCY_REQUIRED");
 return {async compile({consultant_id,event,invitee}={}){
   const id=txt(consultant_id);
   if(!/^[A-Za-z0-9_-]{3,80}$/.test(id))return block("CONSULTANT_ID_INVALID");
   let envelope;
   try{envelope=await loadProfileEnvelope(id)}catch{return block("PROFILE_READ_FAILED")}
   if(!envelope||envelope.consultant_id!==id)return block("PROFILE_NOT_FOUND");
   const lifecycle=envelope.lifecycle_record;
   if(!lifecycle||lifecycle.status!=="LOCKED"||lifecycle.consultant_id!==id)
     return block("PROFILE_NOT_LOCKED");
   const runtime=lifecycle.runtime_v3;
   if(!runtime||runtime.status!=="READY"||!runtime.consultant_sot_json)
     return block("RUNTIME_V3_NOT_READY");
   const sot=runtime.consultant_sot_json;
   if(!Array.isArray(sot.services)||!sot.services.length)
     return block("ACTIVE_SERVICES_MISSING");
   const active=sot.services.map(x=>txt(x?.service_id)).filter(Boolean);
   if(!active.length||new Set(active).size!==active.length)
     return block("ACTIVE_SERVICES_INVALID");
   const facts=compileFacts({
     consultant_id:id,eventType:EXPECTED_EVENT_TYPE,event,invitee,
     active_service_ids:active
   });
   if(!facts?.ok)return {...facts,profile_status:"LOCKED",runtime_status:"READY"};
   const policy={
     qualification_rules:sot.qualification_rules,
     commercial_rules:sot.commercial_rules,
     ideal_client_profile:sot.ideal_client_profile
   };
   const qualification=evaluateQualification({envelope:facts,policy});
   if(!qualification?.ok&&!CLARIFY.has(qualification?.error))
     return {
       ok:false,error:qualification?.error||"BOOKING_QUALIFICATION_EVALUATION_FAILED",
       profile_status:"LOCKED",runtime_status:"READY"
     };
   const qualificationStatus=!qualification?.ok
     ?"REQUIRES_CLARIFICATION"
     :qualification.established===true
       ?"ESTABLISHED"
       :"AFFIRMATIVE_DISQUALIFIER";
   return {
     ok:true,schema_version:"claris_trusted_booking_fact_service_v1",
     consultant_id:id,opportunity_id:facts.opportunity_id,
     profile_status:"LOCKED",runtime_status:"READY",
     booking_fact_envelope:facts,
     qualification_fact:qualification,
     qualification_status:qualificationStatus,
     // Never export the entire private consultant SOT through this boundary.
     runtime_policy_version:txt(sot.sot_version)||null
   };
 }};
}
export const trustedBookingFactServiceQuestionSchema=EXPECTED_EVENT_TYPE;
