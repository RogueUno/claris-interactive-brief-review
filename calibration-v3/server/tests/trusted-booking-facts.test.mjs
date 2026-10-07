import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyTrustedCalendlyQuestionSchema,
  compileTrustedCalendlyBookingFacts,
  createTrustedBookingFactResolver,
  evaluateTrustedBookingQualification,
  trustedCalendlyQuestionContract
} from "../trusted-booking-facts.mjs";

const eventType=()=>({custom_questions:[
 {name:"Company website",type:"string",position:0,enabled:true,required:true,answer_choices:[],include_other:false},
 {name:"What would you like help with?",type:"single_select",position:1,enabled:true,required:true,
  answer_choices:["API Security Auditing","SOC 2 Readiness","Both API Security Auditing and SOC 2 Readiness","I'm not sure yet / something else"],include_other:false},
 {name:"Please share anything that will help prepare for our meeting.",type:"string",position:2,enabled:true,required:false,answer_choices:[],include_other:false}
]});
const event=()=>({uri:"https://api.calendly.com/scheduled_events/event-qa-001",start_time:"2026-10-10T12:00:00Z"});
const invitee=(alignment="SOC 2 Readiness",extra=[])=>({
 uri:event().uri+"/invitees/invitee-qa-001",name:"Robin Example",email:"robin@example.org",
 questions_and_answers:[
  {question:"Company website",answer:"https://www.acme-security.com/",position:0},
  {question:"What would you like help with?",answer:alignment,position:1},
  {question:"Please share anything that will help prepare for our meeting.",answer:"We want to prepare for enterprise security reviews.",position:2},
  ...extra
 ]
});
const compile=(over={})=>compileTrustedCalendlyBookingFacts({
 consultant_id:"consultant_qa_001",eventType:eventType(),event:event(),invitee:invitee(),
 active_service_ids:["SVC_API_AUDIT","SVC_SOC2"],...over
});
test("contract exactly matches intended one-question Calendly extension",()=>{
 assert.equal(trustedCalendlyQuestionContract.alignment_question,"What would you like help with?");
 assert.equal(trustedCalendlyQuestionContract.alignment_choices.length,4);
});
test("strict event schema passes with company website, alignment and optional prep",()=>{
 assert.equal(verifyTrustedCalendlyQuestionSchema(eventType()).ok,true);
});
test("current production-like two-question schema fails until alignment field exists",()=>{
 const t=eventType();t.custom_questions.splice(1,1);
 assert.equal(verifyTrustedCalendlyQuestionSchema(t).error,"ALIGNMENT_QUESTION_SCHEMA_INVALID");
});
test("alignment must be required single-select",()=>{
 for(const patch of [{required:false},{type:"string"}]){
  const t=eventType();Object.assign(t.custom_questions[1],patch);
  assert.equal(verifyTrustedCalendlyQuestionSchema(t).error,"ALIGNMENT_QUESTION_SCHEMA_INVALID");
 }
});
test("alignment choices and order are a versioned contract",()=>{
 const t=eventType();t.custom_questions[1].answer_choices.reverse();
 assert.equal(verifyTrustedCalendlyQuestionSchema(t).error,"ALIGNMENT_CHOICES_SCHEMA_INVALID");
});
test("Calendly Other input is disabled to keep fact values typed",()=>{
 const t=eventType();t.custom_questions[1].include_other=true;
 assert.equal(verifyTrustedCalendlyQuestionSchema(t).error,"ALIGNMENT_CHOICES_SCHEMA_INVALID");
});
test("unknown enabled questions fail schema instead of silently entering trust boundary",()=>{
 const t=eventType();t.custom_questions.push({name:"Budget?",type:"string",position:3,enabled:true,required:false});
 assert.equal(verifyTrustedCalendlyQuestionSchema(t).error,"UNRECOGNIZED_ENABLED_QUESTION");
});
test("single SOC2 choice emits direct alignment only",()=>{
 const r=compile();
 assert.equal(r.ok,true);
 assert.deepEqual(r.zero_question_fact_candidates,["documented service/problem alignment"]);
 assert.deepEqual(r.policy_derived_fact_candidates,["not affirmatively disqualified"]);
 const align=r.facts.find(x=>x.fact_key==="documented service/problem alignment");
 assert.deepEqual(align.service_ids,["SVC_SOC2"]);
 assert.equal(r.facts.some(x=>x.fact_key==="not affirmatively disqualified"),false);
 assert.equal(r.clarification_required_by_booking_facts,false);
});
test("API audit choice maps only to active API service",()=>{
 const r=compile({invitee:invitee("API Security Auditing")});
 assert.deepEqual(r.facts.find(x=>x.fact_key==="documented service/problem alignment").service_ids,["SVC_API_AUDIT"]);
});
test("Both maps to both active service IDs",()=>{
 const r=compile({invitee:invitee("Both API Security Auditing and SOC 2 Readiness")});
 assert.deepEqual(r.facts.find(x=>x.fact_key==="documented service/problem alignment").service_ids,["SVC_API_AUDIT","SVC_SOC2"]);
});
test("not-sure choice never fabricates alignment or policy-derived eligibility",()=>{
 const r=compile({invitee:invitee("I'm not sure yet / something else")});
 assert.equal(r.ok,true);
 assert.equal(r.facts.some(x=>x.fact_key==="documented service/problem alignment"),false);
 assert.deepEqual(r.policy_derived_fact_candidates,[]);
 assert.equal(r.clarification_required_by_booking_facts,true);
});
test("answer outside exact choice list blocks",()=>{
 const r=compile({invitee:invitee("General cybersecurity advice")});
 assert.equal(r.error,"ALIGNMENT_ANSWER_NOT_IN_SCHEMA");
});
test("selected service must still be active in current consultant policy",()=>{
 const r=compile({active_service_ids:["SVC_API_AUDIT"]});
 assert.equal(r.error,"ALIGNMENT_SERVICE_NOT_ACTIVE");
});
test("website normalized to https host",()=>{
 const r=compile();
 assert.equal(r.facts.find(x=>x.fact_key==="company_website").value,"https://acme-security.com");
});
test("private/local/credentialed company websites are rejected",()=>{
 for(const answer of ["https://localhost","https://private.internal","https://user:pw@acme.com","http://127.0.0.1/x"]){
  const inv=invitee();inv.questions_and_answers[0].answer=answer;
  assert.equal(compile({invitee:inv}).error,"COMPANY_WEBSITE_INVALID",answer);
 }
});
test("event and invitee URI must be cryptographically out of client control later; basic binding fails mismatches now",()=>{
 const inv=invitee();inv.uri="https://api.calendly.com/scheduled_events/other/invitees/x";
 assert.equal(compile({invitee:inv}).error,"CALENDLY_IDENTITY_BINDING_INVALID");
});
test("duplicate question labels are rejected",()=>{
 const inv=invitee();inv.questions_and_answers.push({question:"Company website",answer:"https://other.com",position:9});
 assert.equal(compile({invitee:inv}).error,"CALENDLY_ANSWERS_INVALID");
});
test("missing required answer is blocked",()=>{
 const inv=invitee();inv.questions_and_answers=inv.questions_and_answers.filter(x=>!x.question.includes("help with"));
 assert.equal(compile({invitee:inv}).error,"REQUIRED_CALENDLY_ANSWER_MISSING");
});
test("missing answer positions are blocked to preserve exact source provenance",()=>{
 const inv=invitee();delete inv.questions_and_answers[1].position;
 assert.equal(compile({invitee:inv}).error,"CALENDLY_ANSWERS_INVALID");
});
test("optional prep answer becomes supplemental context only",()=>{
 const r=compile();
 const p=r.facts.find(x=>x.fact_key==="booking_preparation_text");
 assert.equal(p.purpose,"SUPPLEMENTAL_CONTEXT");
 assert.equal(r.zero_question_fact_candidates.includes("booking_preparation_text"),false);
});
test("fact source never turns service selection into a direct no-disqualification claim",()=>{
 const r=compile();
 assert.equal(r.facts.some(z=>z.fact_key==="not affirmatively disqualified"),false);
 assert.equal(r.facts.find(z=>z.fact_key==="documented service/problem alignment").direct_prospect_statement,true);
});
test("resolver returns only requested matching-purpose first-call fact",()=>{
 const r=compile(),resolve=createTrustedBookingFactResolver(r);
 const f=resolve({name:"documented service/problem alignment",purpose:"FIRST_CALL_REQUIRED"});
 assert.equal(f.established,true);assert.equal(f.source_attestation.compiler,"SERVER_CALENDLY_FACT_COMPILER_V1");
 assert.equal(resolve({name:"documented service/problem alignment",purpose:"BUDGET_DIRECT"}),null);
});
test("resolver cannot resolve absent uncertain alignment",()=>{
 const r=compile({invitee:invitee("I'm not sure yet / something else")}),resolve=createTrustedBookingFactResolver(r);
 assert.equal(resolve({name:"documented service/problem alignment",purpose:"FIRST_CALL_REQUIRED"}),null);
});
test("resolver rejects malformed envelopes",()=>{
 assert.throws(()=>createTrustedBookingFactResolver({ok:true,schema_version:"bad",issuer:"SERVER_CALENDLY_FACT_COMPILER_V1"}),/INVALID/);
});

const qualificationPolicy=()=>({
 qualification_rules:{required_for_first_call:["documented service/problem alignment","not affirmatively disqualified"],unknown_is_not_negative:true},
 commercial_rules:{minimum_viable_engagement_usd:7500,budget_required_before_first_call:false,budget_rule:"Direct evidence only; never infer budget."},
 ideal_client_profile:{preferred_company_types:["B2B SaaS","Software"],unknown_is_acceptable:true}
});
test("policy evaluator derives no affirmative disqualifier only after direct alignment",()=>{
 const r=evaluateTrustedBookingQualification({envelope:compile(),policy:qualificationPolicy()});
 assert.equal(r.ok,true);assert.equal(r.established,true);
 assert.equal(r.fact_key,"not affirmatively disqualified");
 assert.equal(r.direct_prospect_statement,false);
});
test("unknown alignment cannot be promoted into not-disqualified",()=>{
 const e=compile({invitee:invitee("I'm not sure yet / something else")});
 const r=evaluateTrustedBookingQualification({envelope:e,policy:qualificationPolicy()});
 assert.equal(r.error,"SERVICE_ALIGNMENT_UNESTABLISHED");
});
test("non-permissive unknown policy blocks policy-derived no-disqualification",()=>{
 const p=qualificationPolicy();p.qualification_rules.unknown_is_not_negative=false;
 assert.equal(evaluateTrustedBookingQualification({envelope:compile(),policy:p}).error,"UNKNOWN_POLICY_NOT_PERMISSIVE");
});
test("known below-floor USD budget is an affirmative disqualifier",()=>{
 const e=compile();e.facts.push({fact_key:"budget",established:true,amount:5000,currency:"USD"});
 const r=evaluateTrustedBookingQualification({envelope:e,policy:qualificationPolicy()});
 assert.equal(r.ok,true);assert.equal(r.established,false);assert.equal(r.reason,"KNOWN_BUDGET_BELOW_FLOOR");
});
test("known non-USD budget with positive USD floor fails closed rather than converts",()=>{
 const e=compile();e.facts.push({fact_key:"budget",established:true,amount:9000,currency:"EUR"});
 assert.equal(evaluateTrustedBookingQualification({envelope:e,policy:qualificationPolicy()}).error,"KNOWN_BUDGET_CURRENCY_UNCOMPARABLE");
});
