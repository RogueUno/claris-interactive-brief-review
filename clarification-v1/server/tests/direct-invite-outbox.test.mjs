import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectFinalOutbox } from '../../../calibration-v3/server/direct-final-outbox.mjs';
import { DIRECT_FINAL_FORM_FIELDS } from '../../../calibration-v3/server/make-delivery-transport.mjs';

const sot={consultant:{consultant_name:'Casey Advisor',firm:'Advisory Studio'}};
const booking={
  opportunity_id:'calendly_invite_1234',
  consultant_id:'consultant_alpha',
  consultant_delivery_email:'casey@example.org',
  consultant_sot_json:sot,
  company:'Acme Compliance',
  prospect_first_name:'Robin',
  prospect_email:'robin@acme.com',
  meeting_time:'2026-10-09T15:00:00Z',
  domain:'https://acme.com/'
};
const token='T'.repeat(43);
const url='https://claris-calibration.vercel.app/clarification-v1/#invite='+token;
const payload={...booking,status:'READY',requires_clarification:true,invite_url:url};

function fixture({forgedOwner=false,changedPackage=false,inactive=false}={}){
 const data=new Map();let seq=0;
 const copy=x=>structuredClone(x);
 const storage={
   async getJsonWithMeta(p){
     const v=data.get(p);
     return v?{value:copy(v.value),etag:v.etag}:{value:null,etag:null};
   },
   async putJsonIfAbsent(p,value){
     if(data.has(p))throw Error('BLOB_ALREADY_EXISTS');
     const etag='v-'+(++seq);data.set(p,{value:copy(value),etag});
     return{etag};
   },
   async putJson(p,value,{ifMatch}={}){
     const v=data.get(p);
     if(!v||v.etag!==ifMatch)throw Error('BLOB_PRECONDITION_FAILED');
     const etag='v-'+(++seq);data.set(p,{value:copy(value),etag});
     return{etag};
   }
 };
 const consultantRepository={
   async loadIdentity(){return{
     consultant_id:forgedOwner?'wrong_owner':booking.consultant_id,
     delivery_email:booking.consultant_delivery_email
   };},
   async loadProfileEnvelopeWithMeta(){return{
     etag:'ready-v3',
     envelope:{consultant_id:forgedOwner?'wrong_owner':booking.consultant_id,
       lifecycle_record:{
         consultant_id:forgedOwner?'wrong_owner':booking.consultant_id,
         status:'LOCKED',
         runtime_v3:{status:'READY',consultant_sot_json:sot,
           report:{errors:[],warnings:[]}}
       }}
   };}
 };
 const clarificationRepository={
   async resolveInvite(value){
     if(inactive||value!==token)return{ok:false,error:'INVITE_NOT_ACTIVE'};
     return{ok:true,invite:{expires_at:'2099-01-01T00:00:00Z'},
       envelope:{package:{
         status:'OPEN',opportunity_id:booking.opportunity_id,
         consultant:{consultant_id:booking.consultant_id,first_name:'Casey'},
         prospect:{first_name:booking.prospect_first_name,
           company:changedPackage?'Different Firm':booking.company},
         questions:[{question_id:'q1',prompt:'Is funding approved?'}]
       }}
     };
   }
 };
 return{data,outbox:createDirectFinalOutbox({
   storage,consultantRepository,clarificationRepository,
   inviteBaseUrl:'https://claris-calibration.vercel.app/clarification-v1/'
 })};
}

test('clarification invite: single claimant, owner email, provider ACK and safe replay',async()=>{
 const {outbox,data}=fixture();
 const begin=await outbox.begin(booking);
 assert.equal(begin.status,'REGISTERED');
 const claim=await outbox.claimInvite({...payload,registration_token:begin.registration_token});
 assert.equal(claim.status,'CLAIMED');
 assert.equal(claim.prospect_email,booking.prospect_email);
 assert.match(claim.html_body,/1 quick detail/);
 assert.match(claim.subject,/Casey/);
 assert.match(claim.html_body,/<a href="https:\/\/claris-calibration\.vercel\.app\/clarification-v1\/#invite=/);
 assert.match(claim.html_body,/Answer the quick questions<\/a>/);
 assert.doesNotMatch(claim.html_body,/<script|onerror=/i);
 const persisted=[...data.values()][0].value;
 assert.equal(persisted.status,'INVITE_RESERVED');
 assert.ok(!JSON.stringify(persisted).includes(url));
 assert.ok(!JSON.stringify(persisted).includes(booking.prospect_email));

 assert.equal((await outbox.claimInvite({...payload,registration_token:begin.registration_token})).status,
   'RECONCILIATION_REQUIRED');
 assert.equal((await outbox.acknowledge({
   opportunity_id:booking.opportunity_id,
   claim_token:claim.claim_token,provider_message_id:'gmail-1'
 })).status,'BLOCKED');
 const receipt=await outbox.acknowledgeInvite({
   opportunity_id:booking.opportunity_id,claim_token:claim.claim_token,
   provider_message_id:'gmail-1'
 });
 assert.equal(receipt.status,'ACKNOWLEDGED');
 const repeat=await outbox.acknowledgeInvite({
   opportunity_id:booking.opportunity_id,claim_token:claim.claim_token,
   provider_message_id:'gmail-1'
 });
 assert.equal(repeat.reused,true);
 assert.equal((await outbox.begin(booking)).status,'SKIPPED_ALREADY_SENT');
 assert.equal((await outbox.claimInvite({...payload,registration_token:begin.registration_token})).status,
   'SKIPPED_ALREADY_SENT');
});
test('changed tenant/package and expired or forged invite never authorizes email',async()=>{
 for(const configuration of [{changedPackage:true},{inactive:true},{forgedOwner:true}]){
   const {outbox}=fixture(configuration);
   const begin=await outbox.begin(booking);
   if(configuration.forgedOwner){assert.equal(begin.status,'BLOCKED');continue;}
   const claim=await outbox.claimInvite({...payload,registration_token:begin.registration_token});
   assert.equal(claim.status,'BLOCKED');
 }
 for(const changed of [
   {invite_url:'https://attacker.example/clarification-v1/#invite='+token},
   {invite_url:url+'&unsafe=1'},
   {invite_url:url.replace(token,'wrong')},
   {status:'FINALIZED'},
   {requires_clarification:false},
   {company:'Attacker LLC'},
   {prospect_email:'attacker@example.org'},
   {consultant_sot_json:{consultant:{consultant_name:'Wrong'}}}
 ]){
   const {outbox}=fixture();
   const begin=await outbox.begin(booking);
   const claim=await outbox.claimInvite({
     ...payload,...changed,registration_token:begin.registration_token
   });
   assert.equal(claim.status,'BLOCKED',Object.keys(changed)[0]);
 }
});
test('16 racing requests permit one invitation send attempt only',async()=>{
 const {outbox}=fixture();
 const begin=await outbox.begin(booking);
 const runs=await Promise.all(Array.from({length:16},
   ()=>outbox.claimInvite({...payload,registration_token:begin.registration_token})));
 assert.equal(runs.filter(x=>x.status==='CLAIMED').length,1);
 assert.equal(runs.filter(x=>x.status!=='CLAIMED').length,15);
});
test('only explicitly accepted form fields may authorize an invitation',()=>{
 const names=DIRECT_FINAL_FORM_FIELDS.direct_clarification_claim;
 assert.ok(names.includes('invite_url'));
 assert.ok(names.includes('requires_clarification'));
 assert.equal(names.includes('final_brief_markdown'),false);
 assert.deepEqual(DIRECT_FINAL_FORM_FIELDS.direct_clarification_ack,
  ['opportunity_id','claim_token','provider_message_id']);
});
