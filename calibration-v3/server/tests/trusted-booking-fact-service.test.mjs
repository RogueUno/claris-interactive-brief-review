import test from "node:test";
import assert from "node:assert/strict";
import { createTrustedBookingFactService } from "../trusted-booking-fact-service.mjs";
import { compileTrustedCalendlyBookingFacts, evaluateTrustedBookingQualification } from "../trusted-booking-facts.mjs";

const sot=()=>({
 sot_version:"runtime_v3_test",
 services:[
  {service_id:"SVC_API_AUDIT",name:"API Security Auditing"},
  {service_id:"SVC_SOC2",name:"SOC 2 Readiness"}
 ],
 qualification_rules:{
  required_for_first_call:["documented service/problem alignment","not affirmatively disqualified"],
  unknown_is_not_negative:true
 },
 commercial_rules:{
  minimum_viable_engagement_usd:7500,budget_required_before_first_call:false,
  budget_rule:"Direct evidence only; never infer budget."
 },
 ideal_client_profile:{preferred_company_types:["B2B SaaS","Software"],unknown_is_acceptable:true}
});
const profile=(patch={})=>({
 schema_version:"claris_persisted_profile_v1",consultant_id:"consultant_qa_001",
 lifecycle_record:{status:"LOCKED",consultant_id:"consultant_qa_001",
  runtime_v3:{status:"READY",consultant_sot_json:sot()}},...patch
});
const event=()=>({uri:"https://api.calendly.com/scheduled_events/event-service-001",start_time:"2026-10-10T12:00:00Z"});
const invitee=(answer="SOC 2 Readiness")=>({
 uri:event().uri+"/invitees/invitee-service-001",name:"Robin Example",email:"robin@example.org",
 questions_and_answers:[
  {question:"Company website",answer:"https://acme-security.com",position:0},
  {question:"What would you like help with?",answer,position:1},
  {question:"Please share anything that will help prepare for our meeting.",answer:"Preparing for enterprise customer security requirements.",position:2}
 ]
});
function service({load=async()=>profile(),compile=compileTrustedCalendlyBookingFacts,evaluate=evaluateTrustedBookingQualification}={}){
 return createTrustedBookingFactService({loadProfileEnvelope:load,compileFacts:compile,evaluateQualification:evaluate});
}
const call=(svc=service(),over={})=>svc.compile({consultant_id:"consultant_qa_001",event:event(),invitee:invitee(),...over});

test("locked Runtime services, not Make, define accepted service IDs",async()=>{
 const r=await call();assert.equal(r.ok,true);
 assert.deepEqual(r.booking_fact_envelope.facts.find(x=>x.fact_key==="documented service/problem alignment").service_ids,["SVC_SOC2"]);
});
test("service returns policy-derived no-disqualification separately from direct facts",async()=>{
 const r=await call();assert.equal(r.qualification_fact.established,true);
 assert.equal(r.qualification_fact.direct_prospect_statement,false);
 assert.equal(r.booking_fact_envelope.facts.some(x=>x.fact_key==="not affirmatively disqualified"),false);
});
test("full consultant SOT is not returned",async()=>{
 const r=await call();assert.equal("consultant_sot_json" in r,false);
 assert.equal("services" in r,false);
 assert.equal(r.runtime_policy_version,"runtime_v3_test");
});
test("unknown service answer requires clarification but does not invent alignment",async()=>{
 const r=await call(service(),{invitee:invitee("I'm not sure yet / something else")});
 assert.equal(r.ok,false);assert.equal(r.error,"SERVICE_ALIGNMENT_UNESTABLISHED");
});
test("inactive selected service is rejected using locked Runtime",async()=>{
 const p=profile();p.lifecycle_record.runtime_v3.consultant_sot_json.services=[{service_id:"SVC_API_AUDIT",name:"API Security Auditing"}];
 const r=await call(service({load:async()=>p}));
 assert.equal(r.error,"ALIGNMENT_SERVICE_NOT_ACTIVE");
});
test("profile must exist for exact consultant",async()=>{
 assert.equal((await call(service({load:async()=>null}))).error,"PROFILE_NOT_FOUND");
 const p=profile();p.consultant_id="consultant_other";
 assert.equal((await call(service({load:async()=>p}))).error,"PROFILE_NOT_FOUND");
});
test("profile must be locked",async()=>{
 const p=profile();p.lifecycle_record.status="IN_PROGRESS";
 assert.equal((await call(service({load:async()=>p}))).error,"PROFILE_NOT_LOCKED");
});
test("lifecycle consultant id must match request",async()=>{
 const p=profile();p.lifecycle_record.consultant_id="consultant_other";
 assert.equal((await call(service({load:async()=>p}))).error,"PROFILE_NOT_LOCKED");
});
test("Runtime must be READY with SOT",async()=>{
 for(const runtime of [{status:"BLOCKED",consultant_sot_json:sot()},{status:"READY",consultant_sot_json:null},null]){
  const p=profile();p.lifecycle_record.runtime_v3=runtime;
  assert.equal((await call(service({load:async()=>p}))).error,"RUNTIME_V3_NOT_READY");
 }
});
test("profile read failures fail closed",async()=>{
 assert.equal((await call(service({load:async()=>{throw Error("offline")}}))).error,"PROFILE_READ_FAILED");
});
test("empty or duplicate active service IDs fail closed",async()=>{
 let p=profile();p.lifecycle_record.runtime_v3.consultant_sot_json.services=[];
 assert.equal((await call(service({load:async()=>p}))).error,"ACTIVE_SERVICES_MISSING");
 p=profile();p.lifecycle_record.runtime_v3.consultant_sot_json.services=[{service_id:"SVC_SOC2"},{service_id:"SVC_SOC2"}];
 assert.equal((await call(service({load:async()=>p}))).error,"ACTIVE_SERVICES_INVALID");
});
test("Make cannot supply its own active service list",async()=>{
 const r=await call(service(),{active_service_ids:["SVC_FAKE"]});
 assert.equal(r.ok,true);
 assert.equal(r.booking_fact_envelope.facts.some(x=>JSON.stringify(x).includes("SVC_FAKE")),false);
});
test("invalid consultant id fails before profile read",async()=>{
 let reads=0;const svc=service({load:async()=>{reads++;return profile()}});
 const r=await svc.compile({consultant_id:"x",event:event(),invitee:invitee()});
 assert.equal(r.error,"CONSULTANT_ID_INVALID");assert.equal(reads,0);
});
test("fact compiler errors are preserved with locked runtime status",async()=>{
 const r=await call(service({compile:()=>({ok:false,error:"SCHEMA_DRIFT"})}));
 assert.equal(r.error,"SCHEMA_DRIFT");assert.equal(r.profile_status,"LOCKED");assert.equal(r.runtime_status,"READY");
});
test("qualification evaluator errors fail closed",async()=>{
 const r=await call(service({evaluate:()=>({ok:false,error:"QUALIFICATION_UNCERTAIN"})}));
 assert.equal(r.error,"QUALIFICATION_UNCERTAIN");
});
test("dependencies are mandatory",()=>{
 assert.throws(()=>createTrustedBookingFactService(),/DEPENDENCY_REQUIRED/);
});
