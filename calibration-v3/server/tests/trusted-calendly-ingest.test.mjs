import test from "node:test";
import assert from "node:assert/strict";
import { createTrustedCalendlyIngest } from "../trusted-calendly-ingest.mjs";

const input=()=>({
 consultant_id:"consultant_qa_001",require_company_website_answer:true,
 event:{uri:"https://api.calendly.com/scheduled_events/event-ingest-001",start_time:"2026-10-10T12:00:00Z"},
 invitee:{uri:"https://api.calendly.com/scheduled_events/event-ingest-001/invitees/invitee-ingest-001",
  name:"Robin",email:"robin@example.org",questions_and_answers:[]}
});
const normalized=()=>({ok:true,booking:{
 opportunity_id:"calendly_invitee-ingest-001",consultant_id:"consultant_qa_001",
 domain:"https://acme-security.com",company:"Acme Security",
 calendly_event_uri:"https://api.calendly.com/scheduled_events/event-ingest-001",
 calendly_invitee_uri:"https://api.calendly.com/scheduled_events/event-ingest-001/invitees/invitee-ingest-001"
},provenance:{domain:"QUESTION_DOMAIN"}});
const envelope=()=>({
 ok:true,schema_version:"claris_trusted_booking_facts_v1",issuer:"SERVER_CALENDLY_FACT_COMPILER_V1",
 opportunity_id:"calendly_invitee-ingest-001",consultant_id:"consultant_qa_001",
 source:{kind:"CALENDLY",event_uri:"https://api.calendly.com/scheduled_events/event-ingest-001",
  invitee_uri:"https://api.calendly.com/scheduled_events/event-ingest-001/invitees/invitee-ingest-001"},
 facts:[{fact_key:"company_website",established:true,value:"https://acme-security.com"}]
});
const compiled=(status="ESTABLISHED")=>({ok:true,booking_fact_envelope:envelope(),qualification_status:status,
 qualification_fact:{ok:true,established:status==="ESTABLISHED"}});
function harness({norm=()=>normalized(),comp=async()=>compiled(),persist=async()=>({ok:true,status:"CREATED"})}={}){
 return createTrustedCalendlyIngest({
  normalizeBooking:norm,
  bookingFactService:{compile:comp},
  bookingFactRepository:{create:persist}
 });
}
test("happy path persists bound private fact envelope and returns only receipt",async()=>{
 let saved;const r=await harness({persist:async e=>{saved=e;return {ok:true,status:"CREATED"}}}).ingest(input());
 assert.equal(r.ok,true);assert.equal(r.trusted_booking_fact_receipt.persisted,true);
 assert.equal(r.trusted_booking_fact_receipt.repository_status,"CREATED");
 assert.equal(saved.opportunity_id,"calendly_invitee-ingest-001");
 assert.equal("booking_fact_envelope" in r,false);assert.equal("qualification_fact" in r,false);
});
test("exact replay repository status remains successful",async()=>{
 const r=await harness({persist:async()=>({ok:true,status:"EXISTS_IDENTICAL"})}).ingest(input());
 assert.equal(r.ok,true);assert.equal(r.trusted_booking_fact_receipt.repository_status,"EXISTS_IDENTICAL");
});
test("uncertain service choice stays a successful booking with governed receipt",async()=>{
 const r=await harness({comp:async()=>compiled("REQUIRES_CLARIFICATION")}).ingest(input());
 assert.equal(r.ok,true);assert.equal(r.trusted_booking_fact_receipt.qualification_status,"REQUIRES_CLARIFICATION");
});
test("normalizer failure returns before trusted compiler and persistence",async()=>{
 let compiledCalls=0,writes=0;
 const r=await harness({norm:()=>({ok:false,error:"NORMALIZE_REJECTED"}),
  comp:async()=>{compiledCalls++;return compiled()},persist:async()=>{writes++;return {ok:true}}}).ingest(input());
 assert.equal(r.error,"NORMALIZE_REJECTED");assert.equal(compiledCalls,0);assert.equal(writes,0);
});
test("normalizer exception fails closed",async()=>{
 assert.equal((await harness({norm:()=>{throw Error("bad")}}).ingest(input())).error,"CALENDLY_NORMALIZATION_FAILED");
});
test("fact compiler failure fails closed before persistence",async()=>{
 let writes=0;const r=await harness({comp:async()=>({ok:false,error:"PROFILE_NOT_LOCKED"}),
  persist:async()=>{writes++;return {ok:true}}}).ingest(input());
 assert.equal(r.error,"PROFILE_NOT_LOCKED");assert.equal(writes,0);
});
test("fact compiler exception fails closed",async()=>{
 assert.equal((await harness({comp:async()=>{throw Error("bad")}}).ingest(input())).error,"TRUSTED_BOOKING_FACT_COMPILE_FAILED");
});
test("every normalized/trusted identity binding must match",async()=>{
 const mutations=[
  e=>{e.opportunity_id="calendly_other-001"},
  e=>{e.consultant_id="consultant_other"},
  e=>{e.source.event_uri="https://api.calendly.com/scheduled_events/other"},
  e=>{e.source.invitee_uri="https://api.calendly.com/scheduled_events/event-ingest-001/invitees/other"},
  e=>{e.facts[0].value="https://other.example.com"}
 ];
 for(const mutate of mutations){
  let writes=0,e=envelope();mutate(e);
  const r=await harness({comp:async()=>({...compiled(),booking_fact_envelope:e}),
   persist:async()=>{writes++;return {ok:true}}}).ingest(input());
  assert.equal(r.error,"NORMALIZED_BOOKING_FACT_BINDING_MISMATCH");assert.equal(writes,0);
 }
});
test("missing trusted company website fact blocks binding",async()=>{
 const e=envelope();e.facts=[];
 assert.equal((await harness({comp:async()=>({...compiled(),booking_fact_envelope:e})}).ingest(input())).error,
  "NORMALIZED_BOOKING_FACT_BINDING_MISMATCH");
});
test("repository immutable conflict stops booking handoff",async()=>{
 const r=await harness({persist:async()=>({ok:false,error:"BOOKING_FACT_IMMUTABLE_CONFLICT"})}).ingest(input());
 assert.equal(r.ok,false);assert.equal(r.error,"BOOKING_FACT_IMMUTABLE_CONFLICT");
});
test("repository uncertain create stays fail closed",async()=>{
 const r=await harness({persist:async()=>({ok:false,error:"BOOKING_FACT_CREATE_UNCERTAIN"})}).ingest(input());
 assert.equal(r.error,"BOOKING_FACT_CREATE_UNCERTAIN");
});
test("repository exception stays fail closed",async()=>{
 const r=await harness({persist:async()=>{throw Error("offline")}}).ingest(input());
 assert.equal(r.error,"TRUSTED_BOOKING_FACT_PERSIST_FAILED");
});
test("same input object reaches both normalizer and trusted service",async()=>{
 const v=input();let a,b;
 await harness({norm:x=>{a=x;return normalized()},comp:async x=>{b=x;return compiled()}}).ingest(v);
 assert.equal(a,v);assert.equal(b,v);
});
test("invalid dependencies are rejected during construction",()=>{
 assert.throws(()=>createTrustedCalendlyIngest(),/DEPENDENCY_REQUIRED/);
});
