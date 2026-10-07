import test from "node:test";
import assert from "node:assert/strict";
import { createTrustedFirstCallGovernance } from "../trusted-first-call-governance.mjs";

const base={ok:true,status:"NO_CLARIFICATION",next_action:"RETURN"};
const pass={verdict:"PASS",issues:[]};
const skip={decision:"SKIP",decision_basis_ids:["BOOK_01"],questions:[]};
const input=(over={})=>({
 action:"VERIFICATION",opportunity_id:"calendly_invitee_001",
 consultant:{consultant_id:"consultant_qa_001",first_name:"QA",firm:"QA Firm"},
 prospect:{first_name:"Robin",company:"Acme"},
 proposal:skip,verification:pass,...over
});
const envelope=()=>({
 ok:true,schema_version:"claris_trusted_booking_facts_v1",issuer:"SERVER_CALENDLY_FACT_COMPILER_V1",
 opportunity_id:"calendly_invitee_001",consultant_id:"consultant_qa_001",
 facts:[{issuer:"SERVER_CALENDLY_FACT_COMPILER_V1",fact_key:"documented service/problem alignment",
  purpose:"FIRST_CALL_REQUIRED",established:true,direct_prospect_statement:true,
  source_answer:"SOC 2 Readiness",service_ids:["SVC_SOC2"]}]
});
const policy=(rules=["documented service/problem alignment","not affirmatively disqualified"],budget=false)=>({
 qualification_rules:{required_for_first_call:rules,unknown_is_not_negative:true},
 commercial_rules:{budget_required_before_first_call:budget,minimum_viable_engagement_usd:7500},
 ideal_client_profile:{unknown_is_acceptable:true}
});
const evidence=(statement="https://acme.com\nSOC 2 Readiness\nPreparing for enterprise reviews")=>[
 {evidence_id:"BOOK_01",source_type:"BOOKING",visibility:"PROSPECT_SAFE",channel:"BOOKING_TEXT",statement}
];
const profile=()=>({consultant_id:"consultant_qa_001",lifecycle_record:{
 status:"LOCKED",consultant_id:"consultant_qa_001",
 runtime_v3:{status:"READY",consultant_sot_json:{locked:true}}
}});
function protocol(x){
 if(x.verification?.verdict==="FAIL")
  return x.action==="REPAIRED_VERIFICATION"
   ?{ok:false,status:"BLOCKED",next_action:"BLOCKED",semantic_issues:x.verification.issues}
   :{ok:true,status:"NEEDS_REPAIR",next_action:"REPAIR",semantic_issues:x.verification.issues};
 return base;
}
function gov({
 loadFacts=async()=>({ok:true,etag:"etag_001",envelope:envelope()}),
 loadProfile=async()=>profile(),
 adapt=()=>({opportunity_id:"calendly_invitee_001",consultant:{consultant_id:"consultant_qa_001"},evidence:evidence()}),
 normalize=()=>policy(),
 evaluate=()=>({ok:true,established:true,fact_key:"not affirmatively disqualified"})
}={}){
 return createTrustedFirstCallGovernance({
  runProtocolStep:protocol,adaptPrepare:adapt,normalizePolicy:normalize,
  evaluateQualification:evaluate,loadBookingFacts:loadFacts,loadProfileEnvelope:loadProfile
 });
}
test("fully attested current policy allows original zero-question branch preliminarily",async()=>{
 const r=await gov().apply(input(),base);
 assert.equal(r.status,"NO_CLARIFICATION");
 assert.equal(r.policy_gate.status,"ATTESTED_ZERO_QUESTION_ELIGIBLE");
 assert.equal(r.policy_gate.final_delivery_authorized,false);
});
test("missing direct alignment enters controlled repair",async()=>{
 const e=envelope();e.facts=[];
 const r=await gov({loadFacts:async()=>({ok:true,etag:"etag",envelope:e})}).apply(input(),base);
 assert.equal(r.status,"NEEDS_REPAIR");assert.equal(r.next_action,"REPAIR");
 assert.equal(r.policy_gate.status,"SKIP_DENIED");assert.equal(r.policy_gate.missing_count,2);
});
test("still missing after repaired verification becomes BLOCKED",async()=>{
 const e=envelope();e.facts=[];
 const r=await gov({loadFacts:async()=>({ok:true,etag:"etag",envelope:e})})
  .apply(input({action:"REPAIRED_VERIFICATION"}),base);
 assert.equal(r.status,"BLOCKED");assert.equal(r.policy_gate.status,"SKIP_DENIED");
});
test("booking fact storage absence is infrastructure BLOCKED, not prospect repair",async()=>{
 const r=await gov({loadFacts:async()=>({ok:false,error:"BOOKING_FACT_NOT_FOUND"})}).apply(input(),base);
 assert.equal(r.status,"BLOCKED");assert.equal(r.error,"TRUSTED_FIRST_CALL_PROOF_UNAVAILABLE");
 assert.equal(r.policy_gate.reason,"BOOKING_FACTS_NOT_AVAILABLE");
});
test("missing ETag is not accepted as trusted proof",async()=>{
 const r=await gov({loadFacts:async()=>({ok:true,etag:null,envelope:envelope()})}).apply(input(),base);
 assert.equal(r.status,"BLOCKED");assert.equal(r.policy_gate.reason,"BOOKING_FACTS_NOT_AVAILABLE");
});
test("unlocked or wrong Runtime profile blocks without repair",async()=>{
 for(const mutate of [
  p=>{p.lifecycle_record.status="IN_PROGRESS"},
  p=>{p.lifecycle_record.consultant_id="other"},
  p=>{p.lifecycle_record.runtime_v3.status="BLOCKED"},
  p=>{p.lifecycle_record.runtime_v3.consultant_sot_json=null}
 ]){
  const p=profile();mutate(p);
  const r=await gov({loadProfile:async()=>p}).apply(input(),base);
  assert.equal(r.status,"BLOCKED");assert.equal(r.policy_gate.reason,"LOCKED_RUNTIME_NOT_AVAILABLE");
 }
});
test("consultant binding mismatch blocks",async()=>{
 const r=await gov().apply(input({consultant:{consultant_id:"other"}}),base);
 assert.equal(r.status,"BLOCKED");assert.equal(r.policy_gate.reason,"CONSULTANT_BINDING_MISMATCH");
});
test("PREPARE opportunity or consultant mismatch blocks",async()=>{
 for(const b of [
  {opportunity_id:"other",consultant:{consultant_id:"consultant_qa_001"},evidence:evidence()},
  {opportunity_id:"calendly_invitee_001",consultant:{consultant_id:"other"},evidence:evidence()}
 ]){
  const r=await gov({adapt:()=>b}).apply(input(),base);
  assert.equal(r.status,"BLOCKED");assert.equal(r.policy_gate.reason,"PREPARE_BINDING_MISMATCH");
 }
});
test("exact booking answer must survive into canonical evidence",async()=>{
 const r=await gov({adapt:()=>({opportunity_id:"calendly_invitee_001",
  consultant:{consultant_id:"consultant_qa_001"},evidence:evidence("Prospect wants compliance help")})}).apply(input(),base);
 assert.equal(r.status,"NEEDS_REPAIR");assert.equal(r.policy_gate.status,"SKIP_DENIED");
});
test("ambiguous duplicate exact evidence cannot establish direct fact",async()=>{
 const e=evidence();e.push({...e[0],evidence_id:"BOOK_02"});
 const r=await gov({adapt:()=>({opportunity_id:"calendly_invitee_001",
  consultant:{consultant_id:"consultant_qa_001"},evidence:e})}).apply(input(),base);
 assert.equal(r.status,"NEEDS_REPAIR");
});
test("policy-derived not-disqualified cannot pass when evaluator rejects",async()=>{
 const r=await gov({evaluate:()=>({ok:true,established:false,fact_key:"not affirmatively disqualified"})}).apply(input(),base);
 assert.equal(r.status,"NEEDS_REPAIR");assert.equal(r.policy_gate.missing_count,1);
});
test("unsupported extra first-call rule remains missing",async()=>{
 const r=await gov({normalize:()=>policy(["documented service/problem alignment","not affirmatively disqualified","decision authority"])}).apply(input(),base);
 assert.equal(r.status,"NEEDS_REPAIR");assert.equal(r.policy_gate.missing_count,1);
});
test("budget-required policy without direct budget fact enters repair",async()=>{
 const r=await gov({normalize:()=>policy(undefined,true)}).apply(input(),base);
 assert.equal(r.status,"NEEDS_REPAIR");assert.equal(r.policy_gate.missing_count,1);
});
test("direct USD budget at or above floor can establish required budget",async()=>{
 const e=envelope();e.facts.push({issuer:"SERVER_CALENDLY_FACT_COMPILER_V1",fact_key:"budget",
  purpose:"BUDGET_DIRECT",established:true,direct_prospect_statement:true,
  source_answer:"Budget USD 10000",amount:10000,currency:"USD"});
 const ev=evidence();ev.push({evidence_id:"BOOK_02",source_type:"BOOKING",visibility:"PROSPECT_SAFE",
  channel:"BOOKING_TEXT",statement:"Budget USD 10000"});
 const r=await gov({
  loadFacts:async()=>({ok:true,etag:"etag",envelope:e}),
  adapt:()=>({opportunity_id:"calendly_invitee_001",consultant:{consultant_id:"consultant_qa_001"},evidence:ev}),
  normalize:()=>policy(undefined,true)
 }).apply(input(),base);
 assert.equal(r.status,"NO_CLARIFICATION");assert.equal(r.policy_gate.status,"ATTESTED_ZERO_QUESTION_ELIGIBLE");
});
test("below-floor or non-USD budget cannot qualify against positive USD floor",async()=>{
 for(const fact of [{amount:5000,currency:"USD"},{amount:10000,currency:"EUR"}]){
  const e=envelope();e.facts.push({issuer:"SERVER_CALENDLY_FACT_COMPILER_V1",fact_key:"budget",
   purpose:"BUDGET_DIRECT",established:true,direct_prospect_statement:true,
   source_answer:"Budget direct",...fact});
  const ev=evidence();ev.push({evidence_id:"BOOK_02",source_type:"BOOKING",visibility:"PROSPECT_SAFE",
   channel:"BOOKING_TEXT",statement:"Budget direct"});
  const r=await gov({loadFacts:async()=>({ok:true,etag:"etag",envelope:e}),
   adapt:()=>({opportunity_id:"calendly_invitee_001",consultant:{consultant_id:"consultant_qa_001"},evidence:ev}),
   normalize:()=>policy(undefined,true)}).apply(input(),base);
  assert.equal(r.status,"NEEDS_REPAIR");
 }
});
test("ASK decision preserves original result and does not read storage",async()=>{
 let reads=0;const r=await gov({loadFacts:async()=>{reads++;return null}})
  .apply(input({proposal:{decision:"ASK",questions:[{prompt:"x"}]}}),base);
 assert.equal(r,base);assert.equal(reads,0);
});
test("existing independent verifier FAIL is preserved without trusted reads",async()=>{
 let reads=0;const r=await gov({loadFacts:async()=>{reads++;return null}})
  .apply(input({verification:{verdict:"FAIL",issues:[{code:"ORIGINAL"}]}}),{ok:true,status:"NEEDS_REPAIR"});
 assert.equal(r.status,"NEEDS_REPAIR");assert.equal(reads,0);
});
test("non-verification actions pass through unchanged",async()=>{
 const r=await gov().apply(input({action:"PROPOSAL"}),{ok:true,status:"READY_TO_VERIFY"});
 assert.equal(r.status,"READY_TO_VERIFY");
});
test("unexpected original protocol state is never promoted by overlay",async()=>{
 const r=await gov().apply(input(),{ok:true,status:"READY"});
 assert.equal(r.status,"READY");assert.equal(r.policy_gate,undefined);
});
test("invalid policy shape blocks rather than guessing",async()=>{
 const r=await gov({normalize:()=>({qualification_rules:{required_for_first_call:[]},commercial_rules:{}})}).apply(input(),base);
 assert.equal(r.status,"BLOCKED");assert.equal(r.policy_gate.reason,"FIRST_CALL_POLICY_INVALID");
});
test("dependency set is mandatory",()=>{
 assert.throws(()=>createTrustedFirstCallGovernance(),/DEPENDENCY_REQUIRED/);
});
