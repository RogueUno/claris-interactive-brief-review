import test from "node:test";
import assert from "node:assert/strict";
import { createBookingFactRepository } from "../booking-fact-repository.mjs";

const envelope=()=>({
 ok:true,schema_version:"claris_trusted_booking_facts_v1",issuer:"SERVER_CALENDLY_FACT_COMPILER_V1",
 opportunity_id:"calendly_invitee_001",consultant_id:"consultant_qa_001",
 source:{kind:"CALENDLY",event_uri:"https://api.calendly.com/scheduled_events/e1",invitee_uri:"https://api.calendly.com/scheduled_events/e1/invitees/i1",question_schema:"CLARIS_CALENDLY_Q_V1"},
 facts:[{issuer:"SERVER_CALENDLY_FACT_COMPILER_V1",fact_key:"company_website",established:true}],
 zero_question_fact_candidates:["documented service/problem alignment"],
 policy_derived_fact_candidates:["not affirmatively disqualified"],
 clarification_required_by_booking_facts:false
});
function memory(){
 const map=new Map(),etags=new Map();let writes=0;
 return {
  map,etags,get writes(){return writes},
  async getJsonWithMeta(path){return {value:map.get(path)||null,etag:etags.get(path)||null}},
  async putJsonIfAbsent(path,value){
   writes++;
   if(map.has(path))throw Error("already exists");
   map.set(path,JSON.parse(JSON.stringify(value)));etags.set(path,"etag_mock_001");
   return {etag:"etag_mock_001"};
  }
 };
}
test("repository requires atomic create and metadata read",()=>{
 assert.throws(()=>createBookingFactRepository({}),/ATOMIC_CREATE_REQUIRED/);
});
test("valid envelope creates exactly once",async()=>{
 const s=memory(),r=createBookingFactRepository(s),out=await r.create(envelope(),{now:Date.parse("2026-10-07T12:00:00Z")});
 assert.equal(out.ok,true);assert.equal(out.status,"CREATED");assert.equal(s.writes,1);
});
test("persisted record is immutable and time stamped",async()=>{
 const s=memory(),r=createBookingFactRepository(s);await r.create(envelope(),{now:Date.parse("2026-10-07T12:00:00Z")});
 const raw=[...s.map.values()][0];
 assert.equal(raw.immutable,true);assert.equal(raw.persisted_at,"2026-10-07T12:00:00.000Z");
 assert.equal(raw.repository_version,"claris_booking_fact_repository_v1");
});
test("exact duplicate webhook replay is idempotent",async()=>{
 const s=memory(),r=createBookingFactRepository(s),first=envelope();await r.create(first);
 const out=await r.create(envelope());
 assert.equal(out.ok,true);assert.equal(out.status,"EXISTS_IDENTICAL");
 assert.equal(out.etag,"etag_mock_001");assert.equal(s.writes,2);
});
test("changed duplicate facts never overwrite immutable first record",async()=>{
 const s=memory(),r=createBookingFactRepository(s),first=envelope();await r.create(first);
 const second=envelope();second.facts=[{fact_key:"tampered"}];
 const out=await r.create(second);
 assert.equal(out.ok,false);assert.equal(out.error,"BOOKING_FACT_IMMUTABLE_CONFLICT");
 assert.equal([...s.map.values()][0].facts[0].fact_key,"company_website");assert.equal(s.writes,2);
});
test("uncertain create that actually persisted exact facts is confirmed safely",async()=>{
 const s=memory(),r=createBookingFactRepository(s),e=envelope(),path=r.pathFor(e.opportunity_id);
 s.putJsonIfAbsent=async(_path,value)=>{
   s.map.set(path,JSON.parse(JSON.stringify(value)));s.etags.set(path,"etag_after_timeout");
   throw Error("network timeout");
 };
 const out=await r.create(e);
 assert.equal(out.ok,true);assert.equal(out.status,"EXISTS_IDENTICAL");
 assert.equal(out.etag,"etag_after_timeout");
});
test("uncertain create with no readable record stays uncertain",async()=>{
 const s=memory();s.putJsonIfAbsent=async()=>{throw Error("network timeout")};
 const out=await createBookingFactRepository(s).create(envelope());
 assert.equal(out.ok,false);assert.equal(out.error,"BOOKING_FACT_CREATE_UNCERTAIN");
});
test("successful write without returned ETag is independently confirmed as fresh create",async()=>{
 const s=memory(),r=createBookingFactRepository(s),e=envelope(),path=r.pathFor(e.opportunity_id);
 s.putJsonIfAbsent=async(_path,value)=>{
   s.map.set(path,JSON.parse(JSON.stringify(value)));s.etags.set(path,"etag_readback");
   return {};
 };
 const out=await r.create(e);
 assert.equal(out.ok,true);assert.equal(out.status,"CREATED_CONFIRMED");
 assert.equal(out.etag,"etag_readback");
});
test("load returns exact persisted envelope and ETag",async()=>{
 const s=memory(),r=createBookingFactRepository(s);await r.create(envelope());
 const out=await r.load("calendly_invitee_001");
 assert.equal(out.ok,true);assert.equal(out.etag,"etag_mock_001");
 assert.equal(out.envelope.opportunity_id,"calendly_invitee_001");
});
test("missing record fails closed",async()=>{
 const out=await createBookingFactRepository(memory()).load("calendly_missing_001");
 assert.equal(out.error,"BOOKING_FACT_NOT_FOUND");
});
test("read errors do not become not-found guesses",async()=>{
 const s=memory();s.getJsonWithMeta=async()=>{throw Error("offline")};
 assert.equal((await createBookingFactRepository(s).load("calendly_invitee_001")).error,"BOOKING_FACT_READ_FAILED");
});
test("missing ETag makes loaded record unusable for trusted downstream read",async()=>{
 const s=memory(),r=createBookingFactRepository(s);await r.create(envelope());s.etags.clear();
 assert.equal((await r.load("calendly_invitee_001")).error,"BOOKING_FACT_ETAG_MISSING");
});
test("schema version mismatch is rejected at create",async()=>{
 const e=envelope();e.schema_version="bad";
 assert.equal((await createBookingFactRepository(memory()).create(e)).error,"BOOKING_FACT_ENVELOPE_INVALID");
});
test("wrong issuer is rejected",async()=>{
 const e=envelope();e.issuer="MAKE_OR_MODEL";
 assert.equal((await createBookingFactRepository(memory()).create(e)).error,"BOOKING_FACT_ENVELOPE_INVALID");
});
test("invalid consultant or opportunity ids are rejected",async()=>{
 for(const patch of [{opportunity_id:"x"},{consultant_id:"!"}]){
  const e={...envelope(),...patch};
  assert.equal((await createBookingFactRepository(memory()).create(e)).error,"BOOKING_FACT_ENVELOPE_INVALID");
 }
});
test("load detects tampered stored opportunity id",async()=>{
 const s=memory(),r=createBookingFactRepository(s),e=envelope();await r.create(e);
 const path=r.pathFor(e.opportunity_id);s.map.set(path,{...s.map.get(path),opportunity_id:"calendly_other_001"});
 assert.equal((await r.load(e.opportunity_id)).error,"BOOKING_FACT_RECORD_INVALID");
});
test("invalid or absent source/facts cannot be persisted",async()=>{
 for(const patch of [{source:null},{facts:null},{source:{kind:"OTHER"}}]){
  const e={...envelope(),...patch};
  assert.equal((await createBookingFactRepository(memory()).create(e)).error,"BOOKING_FACT_ENVELOPE_INVALID");
 }
});
test("invalid clock fails before storage write",async()=>{
 const s=memory(),r=createBookingFactRepository(s),out=await r.create(envelope(),{now:NaN});
 assert.equal(out.error,"BOOKING_FACT_ENVELOPE_INVALID");assert.equal(s.writes,0);
});
test("path is deterministic and private-opportunity scoped",()=>{
 const r=createBookingFactRepository(memory());
 assert.equal(r.pathFor("calendly_invitee_001"),"claris/opportunities/calendly_invitee_001/booking-facts.json");
 assert.throws(()=>r.pathFor("../escape"),/OPPORTUNITY_INVALID/);
});
