import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectFinalOutbox } from '../../../calibration-v3/server/direct-final-outbox.mjs';

const sot = {
  consultant: { consultant_name:'Casey Adviser', firm:'GRC Advisory' },
  services:[{service_id:'V_CISO', name:'vCISO'}],
  commercial_rules:{budget_required_before_first_call:false}
};
const booking = {
  opportunity_id: 'calendly_opp_001',
  consultant_id: 'consultant_alpha',
  consultant_delivery_email: 'consultant@example.com',
  consultant_sot_json: sot,
  company: 'Acme Security',
  prospect_first_name: 'Robin',
  prospect_email: 'robin@acme.com',
  meeting_time: '2026-10-09T15:00:00Z',
  domain: 'https://acme.com/'
};
const finalAudit = {
  audit_status:'PASS', violations:[], repair_required:false
};
const finalized = {
  ...booking,
  status:'FINALIZED',
  requires_clarification:false,
  final_audit_json:JSON.stringify(finalAudit),
  final_brief_markdown:'# CLARIS final brief\nSensitive details should be cited.',
  consultant_first_name:'Casey'
};

function fixture({ identity='consultant_alpha',
  delivery='consultant@example.com',
  locked=true, runtimeStatus='READY', officialSot=sot,
  storageOverride={} } = {}) {
  const blobs = new Map();
  let rev = 0;
  const storage = {
    async getJsonWithMeta(path) {
      const rec=blobs.get(path);
      return rec ? { value: structuredClone(rec.value), etag:rec.etag }
        : { value:null,etag:null };
    },
    async putJsonIfAbsent(path, value) {
      if(blobs.has(path)) throw new Error('BLOB_ALREADY_EXISTS');
      const etag='etag-'+(++rev);
      blobs.set(path,{value:structuredClone(value),etag});
      return {etag};
    },
    async putJson(path,value,{ifMatch=null}={}) {
      const prev=blobs.get(path);
      if(!prev||prev.etag!==ifMatch)throw new Error('BLOB_PRECONDITION_FAILED');
      const etag='etag-'+(++rev);
      blobs.set(path,{value:structuredClone(value),etag});
      return {etag};
    },
    ...storageOverride
  };
  const consultantRepository={
    async loadIdentity(){return {consultant_id:identity,delivery_email:delivery};},
    async loadProfileEnvelopeWithMeta(){
      return {
        etag:'locked-v3',
        envelope:{
          consultant_id:identity,
          lifecycle_record:{
            consultant_id:identity,
            status:locked?'LOCKED':'IN_PROGRESS',
            runtime_v3:{
              status:runtimeStatus,
              consultant_sot_json:officialSot,
              report:{errors:[],warnings:[]}
            }
          }
        }
      };
    }
  };
  return {
    storage,blobs,consultantRepository,
    outbox:createDirectFinalOutbox({storage,consultantRepository})
  };
}

test('registered booking → certified direct final → ACK; duplicate never sends',async()=>{
  const f=fixture();
  const begin=await f.outbox.begin(booking,{now:1000});
  assert.equal(begin.status,'REGISTERED');
  assert.match(begin.registration_token,/^[a-f0-9]{64}$/);
  const receipt=[...f.blobs.values()][0].value;
  assert.equal(receipt.status,'REGISTERED');
  assert.ok(!JSON.stringify(receipt).includes('robin@'));
  assert.ok(!JSON.stringify(receipt).includes('consultant@example.com'));
  assert.ok(!JSON.stringify(receipt).includes('Sensitive details'));

  const before=await f.outbox.begin(booking,{now:999999});
  assert.equal(before.status,'RECONCILIATION_REQUIRED');

  const claim=await f.outbox.claim({...finalized,registration_token:begin.registration_token},{now:1200});
  assert.equal(claim.status,'CLAIMED');
  assert.equal(claim.consultant_delivery_email,'consultant@example.com');
  assert.match(claim.subject,/CLARIS/);
  assert.match(claim.html_body,/CLARIS final brief/);
  assert.equal(claim.claim_token.length,64);
  const duplicate=await f.outbox.claim({...finalized,registration_token:begin.registration_token});
  assert.equal(duplicate.status,'RECONCILIATION_REQUIRED');

  const forged=await f.outbox.acknowledge({
    opportunity_id:booking.opportunity_id,
    claim_token:'f'.repeat(64),provider_message_id:'gmail-one'
  });
  assert.equal(forged.status,'BLOCKED');
  const ack=await f.outbox.acknowledge({
    opportunity_id:booking.opportunity_id,
    claim_token:claim.claim_token,provider_message_id:'gmail-one'
  },{now:1400});
  assert.equal(ack.status,'ACKNOWLEDGED');
  assert.equal(ack.reused,false);
  const repeated=await f.outbox.acknowledge({
    opportunity_id:booking.opportunity_id,
    claim_token:claim.claim_token,provider_message_id:'gmail-one'
  });
  assert.equal(repeated.status,'ACKNOWLEDGED');
  assert.equal(repeated.reused,true);
  assert.equal((await f.outbox.claim({...finalized,registration_token:begin.registration_token})).status,'SKIPPED_ALREADY_SENT');
});

test('race at registration permits one expensive PREPARE start only',async()=>{
  const f=fixture();
  const results=await Promise.all(Array.from({length:16},()=>f.outbox.begin(booking)));
  assert.equal(results.filter(x=>x.status==='REGISTERED').length,1);
  assert.equal(results.filter(x=>x.status!=='REGISTERED').length,15);
});

test('race at finalized claim permits one Gmail attempt only',async()=>{
  const f=fixture();
  const begin=await f.outbox.begin(booking);
  const results=await Promise.all(Array.from({length:16},
    ()=>f.outbox.claim({...finalized,registration_token:begin.registration_token})));
  assert.equal(results.filter(x=>x.status==='CLAIMED').length,1);
  assert.equal(results.filter(x=>x.status!=='CLAIMED').length,15);
});

test('old, wrong tenant, wrong email, blocked profile and tampered SOT cannot register',async()=>{
  for(const options of [
    {identity:'consultant_other'},
    {delivery:'wrong@example.com'},
    {locked:false},
    {runtimeStatus:'BLOCKED'},
    {officialSot:{consultant:{consultant_name:'Another adviser'}}}
  ]){
    const f=fixture(options);
    const result=await f.outbox.begin(booking);
    assert.equal(result.status,'BLOCKED',JSON.stringify(options));
    assert.equal(f.blobs.size,0);
  }
});

test('claim requires verified certification, no clarification, unchanged booking and owner',async()=>{
  const f=fixture();
  const begin=await f.outbox.begin(booking);
  const base={...finalized,registration_token:begin.registration_token};
  for(const altered of [
    {status:'READY'},
    {requires_clarification:true},
    {requires_clarification:undefined},
    {final_brief_markdown:' '},
    {final_audit_json:JSON.stringify({...finalAudit,violations:['X']})},
    {final_audit_json:JSON.stringify({...finalAudit,repair_required:true})},
    {final_audit_json:'broken'},
    {company:'Different Company'},
    {meeting_time:'2026-10-10T15:00:00Z'},
    {prospect_email:'attacker@example.org'},
    {registration_token:'0'.repeat(64)},
    {consultant_sot_json:{consultant:{consultant_name:'Wrong'}}}
  ]){
    const result=await f.outbox.claim({...base,...altered});
    assert.equal(result.status,'BLOCKED',JSON.stringify(Object.keys(altered)));
  }
  const valid=await f.outbox.claim(base);
  assert.equal(valid.status,'CLAIMED');
});

test('unsafe model HTML is escaped before reaching Gmail rawHtml module',async()=>{
  const f=fixture();
  const begin=await f.outbox.begin(booking);
  const value='<script>alert(1)</script> <img src=x onerror=evil()>';
  const c=await f.outbox.claim({
    ...finalized,registration_token:begin.registration_token,
    final_brief_markdown:'# Review\n'+value
  });
  assert.equal(c.status,'CLAIMED');
  assert.match(c.html_body,/&lt;script&gt;/);
  assert.match(c.html_body,/&lt;img/);
  assert.doesNotMatch(c.html_body,/<script|<img/i);
});

test('lost registration response, lost Gmail acknowledgment and write races stay fail closed',async()=>{
  const uncertain=fixture({
    storageOverride:{ async putJsonIfAbsent(){throw Error('NETWORK_TIMEOUT');} }
  });
  assert.equal((await uncertain.outbox.begin(booking)).status,'BLOCKED');

  const f=fixture();
  const begin=await f.outbox.begin(booking);
  f.storage.putJson=async()=>{throw Error('UNCONFIRMED');};
  const attempted=await f.outbox.claim({...finalized,registration_token:begin.registration_token});
  assert.equal(attempted.status,'RECONCILIATION_REQUIRED');
  assert.equal(attempted.ok,false);

  const g=fixture();
  const b=await g.outbox.begin(booking);
  const sent=await g.outbox.claim({...finalized,registration_token:b.registration_token});
  g.storage.putJson=async()=>{throw Error('NETWORK_TIMEOUT');};
  const ack=await g.outbox.acknowledge({
    opportunity_id:booking.opportunity_id,
    claim_token:sent.claim_token,provider_message_id:'gmail-one'
  });
  assert.equal(ack.status,'RECONCILIATION_REQUIRED');
  assert.equal((await g.outbox.claim({...finalized,registration_token:b.registration_token})).status,'RECONCILIATION_REQUIRED');
});
