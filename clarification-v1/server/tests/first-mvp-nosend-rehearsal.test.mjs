import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCalendlyBooking} from '../../../calibration-v3/server/calendly-booking-normalizer.mjs';
import {buildRuntimeV3Export} from '../../../calibration-v3/server/runtime-export.mjs';
import {createDirectFinalOutbox} from '../../../calibration-v3/server/direct-final-outbox.mjs';

// Strict dry-run. Synthetic calendar event, in-memory storage, no model,
// HTTP, Make execution or email receipt.
test('Calendly -> locked runtime -> one BEGIN -> unsealed FINAL blocked, no send',async()=>{
 const id='consultant_demo_001',mail='consultant@example.org';
 const sot={consultant:{consultant_name:'Alex Consultant',firm:'Demo GRC'},
  services:[{service_id:'ADVISORY',name:'GRC'}]};
 const envelope={consultant_id:id,lifecycle_record:{consultant_id:id,status:'LOCKED',
  runtime_v3:{status:'READY',consultant_sot_json:sot,report:{errors:[],warnings:[]}}}};
 const normalized=normalizeCalendlyBooking({
  consultant_id:id,require_company_website_answer:true,
  event:{uri:'https://api.calendly.com/scheduled_events/mock-001',
   start_time:'2026-10-12T15:00:00Z'},
  invitee:{uri:'https://api.calendly.com/scheduled_events/mock-001/invitees/mock-01',
   name:'Robin Test',email:'robin@trust-audit.io',
   questions_and_answers:[{question:'Company website',answer:'https://trust-audit.io'}]}
 });
 assert.equal(normalized.ok,true);
 assert.equal(normalized.provenance.domain,'QUESTION_DOMAIN');
 const runtime=buildRuntimeV3Export(envelope,'etag-lock');
 assert.equal(runtime.ok,true);
 const booking={...normalized.booking,consultant_id:id,consultant_delivery_email:mail,
  consultant_sot_json:runtime.runtime_v3.consultant_sot_json};
 const db=new Map();let version=0,claims=0;
 const storage={
  async getJsonWithMeta(p){const r=db.get(p);return r?structuredClone(r):{value:null,etag:null};},
  async putJsonIfAbsent(p,v){if(db.has(p))throw Error('EXISTS');
   const etag='etag-'+(++version);db.set(p,{value:structuredClone(v),etag});return {etag};},
  async putJson(p,v,{ifMatch}={}){const old=db.get(p);if(old?.etag!==ifMatch)throw Error('CAS');
   claims++;const etag='etag-'+(++version);db.set(p,{value:structuredClone(v),etag});return {etag};}
 };
 const repository={
  async loadIdentity(){return {consultant_id:id,delivery_email:mail};},
  async loadProfileEnvelopeWithMeta(){return {envelope,etag:'etag-lock'};}
 };
 const outbox=createDirectFinalOutbox({storage,consultantRepository:repository,
  requireFinalProvenance:true,requireRecoveryAttestation:true});
 const initial=await outbox.begin(booking);
 assert.equal(initial.status,'REGISTERED');
 const duplicate=await outbox.begin(booking);
 assert.notEqual(duplicate.status,'REGISTERED');
 const fake={...booking,registration_token:initial.registration_token,status:'FINALIZED',
  final_stage:'FINALIZE',requires_clarification:false,
  final_audit_json:JSON.stringify({audit_status:'PASS',repair_required:false,violations:[]}),
  final_brief_markdown:'# Synthetic final brief'};
 const claim=await outbox.claim(fake);
 assert.equal(claim.status,'BLOCKED');
 assert.equal(claims,0);
 assert.equal(db.size,1);
 assert.equal([...db.values()][0].value.status,'REGISTERED');
});
