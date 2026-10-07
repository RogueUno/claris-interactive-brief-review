import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectFinalOutbox } from '../../../calibration-v3/server/direct-final-outbox.mjs';
import { renderFinalBrief } from '../final-brief-renderer.mjs';

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
  final_stage:'FINALIZE',
  requires_clarification:false,
  final_audit_json:JSON.stringify(finalAudit),
  final_brief_markdown:'# CLARIS final brief\nSensitive details should be cited.',
  consultant_first_name:'Casey'
};

function certifiedPrepareState(overrides={}) {
  return {
    prepare_advisory:{stage:'AWAITING_PROSPECT_INPUT'},
    p3_repair_applied:false,
    p3_semantic_status:'DUAL_CERTIFIED_PASS',
    p2_contract_gate_passed:true,
    artifact_contract_version:'V3_TRUTH_BOUNDARY_3',
    compiler_contract_version:'V3_CANONICAL_TRUTH_1',
    canonical_evidence_authority:'MODULE_85_DETERMINISTIC_CANONICAL_TRUTH_COMPILER',
    canonical_truth_json:JSON.stringify({
      company:'Acme Security',
      domain:'https://acme.com/',
      compiler_contract_version:'V3_CANONICAL_TRUTH_1',
      booking_evidence:[{
        evidence_id:'BOOK-001',authority:'BOOKING_TEXT',
        statement:'SOC 2 readiness is the stated booking need.',
        exact_basis:'SOC 2 readiness is the stated booking need.',
        resolvable:true
      }],
      canonical_evidence_registry:[{
        evidence_id:'FAC-001',admission_status:'ADMITTED',sensitivity:'STANDARD',
        channel:'IDENTITY_PRODUCT',authority:'VERIFIED_PUBLIC_FACT',
        strength:'HIGH',freshness:'CURRENT',source_date:'2026-10-01',
        source_url:'https://acme.com/security',
        source_excerpt:'Acme publishes a security and compliance page.'
      }]
    }),
    ...overrides
  };
}
const strictArtifact = {
  match_score:82,
  evidence_completeness_score:88,
  preliminary_brief_markdown:'Prepare around the stated SOC 2 readiness need.',
  intelligence_lineage:[
    {evidence_id:'BOOK-001',authority:'BOOKING_TEXT',usage:'Stated booking need'},
    {evidence_id:'FAC-001',authority:'VERIFIED_PUBLIC_FACT',usage:'Public security posture'}
  ]
};
function strictFinalized(overrides={}) {
  const rendered=renderFinalBrief(strictArtifact);
  return {
    ...finalized,
    prepare_case_state_json:JSON.stringify(certifiedPrepareState()),
    final_stage_output_json:JSON.stringify(strictArtifact),
    final_case_state_json:JSON.stringify(strictArtifact),
    final_brief_markdown:rendered.brief_markdown,
    ...overrides
  };
}

function fixture({ identity='consultant_alpha',
  delivery='consultant@example.com',
  locked=true, runtimeStatus='READY', officialSot=sot,
  storageOverride={}, requireFinalProvenance=false } = {}) {
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
    outbox:createDirectFinalOutbox({storage,consultantRepository,requireFinalProvenance})
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
    {final_stage:'PREPARE'},
    {final_stage:null},
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


test('private and malformed company sites cannot register expensive PREPARE work',async()=>{
  for(const site of [
    'http://acme.com/','https://127.0.0.1/',
    'https://169.254.169.254/','https://localhost/',
    'https://backend.local/','https://internal.test/',
    'https://acme.com:8443/','https://acme.com/private',
    'https://user:password@acme.com/'
  ]){
    const f=fixture();
    const result=await f.outbox.begin({...booking,domain:site});
    assert.equal(result.status,'BLOCKED',site);
    assert.equal(f.blobs.size,0,site);
  }
});


test('unbounded or multiline booking labels cannot reach Gmail',async()=>{
  for(const input of [
    {company:'A'.repeat(161)},
    {company:'Acme\nBcc:target@example.org'},
    {prospect_first_name:'R'.repeat(121)},
    {prospect_first_name:'Alex\rOther'},
    {meeting_time:'T'.repeat(81)},
    {prospect_email:'p'.repeat(250)+'@example.org'}
  ]){
    const f=fixture();
    const response=await f.outbox.begin({...booking,...input});
    assert.equal(response.status,'BLOCKED',Object.keys(input)[0]);
    assert.equal(f.blobs.size,0);
  }
});


test('registered transient-provider recovery rotates the token exactly once',async()=>{
  const f=fixture();
  const begin=await f.outbox.begin(booking,{now:1000});
  const recovered=await f.outbox.recoverRegistered({
    ...booking,recovery_reason:'PROVIDER_TRANSIENT_503'
  },{now:2000});
  assert.equal(recovered.status,'RECOVERY_AUTHORIZED');
  assert.equal(recovered.ok,true);
  assert.equal(recovered.recovery_count,1);
  assert.match(recovered.registration_token,/^[a-f0-9]{64}$/);
  assert.notEqual(recovered.registration_token,begin.registration_token);

  const stale=await f.outbox.claim({
    ...finalized,registration_token:begin.registration_token
  });
  assert.equal(stale.status,'BLOCKED');
  assert.equal(stale.error,'DIRECT_FINAL_REGISTRATION_MISMATCH');

  const fresh=await f.outbox.claim({
    ...finalized,registration_token:recovered.registration_token
  });
  assert.equal(fresh.status,'CLAIMED');
});

test('a registered booking receives at most one recovery authorization',async()=>{
  const f=fixture();
  await f.outbox.begin(booking);
  const first=await f.outbox.recoverRegistered({
    ...booking,recovery_reason:'PROVIDER_TRANSIENT_503'
  });
  assert.equal(first.status,'RECOVERY_AUTHORIZED');
  const second=await f.outbox.recoverRegistered({
    ...booking,recovery_reason:'PROVIDER_TRANSIENT_503'
  });
  assert.equal(second.status,'BLOCKED');
  assert.equal(second.error,'DIRECT_FINAL_RECOVERY_LIMIT_REACHED');
});

test('recovery requires exact registered booking, locked owner, SOT and explicit transient reason',async()=>{
  const f=fixture();
  await f.outbox.begin(booking);
  for(const patch of [
    {recovery_reason:'AUTOMATIC_RETRY'},
    {company:'Different Company',recovery_reason:'PROVIDER_TRANSIENT_503'},
    {consultant_sot_json:{consultant:{consultant_name:'Wrong'}},recovery_reason:'PROVIDER_TRANSIENT_503'}
  ]){
    const r=await f.outbox.recoverRegistered({...booking,...patch});
    assert.equal(r.status,'BLOCKED',JSON.stringify(patch));
  }

  const wrongOwner=fixture({delivery:'other@example.com'});
  await wrongOwner.outbox.begin({...booking,consultant_delivery_email:'other@example.com'});
  const denied=await wrongOwner.outbox.recoverRegistered({
    ...booking,recovery_reason:'PROVIDER_TRANSIENT_503'
  });
  assert.equal(denied.status,'BLOCKED');
});

test('concurrent recovery permits one token rotation only',async()=>{
  const f=fixture();
  await f.outbox.begin(booking);
  const results=await Promise.all(Array.from({length:12},()=>f.outbox.recoverRegistered({
    ...booking,recovery_reason:'PROVIDER_TRANSIENT_503'
  })));
  assert.equal(results.filter(x=>x.status==='RECOVERY_AUTHORIZED').length,1);
  assert.equal(results.filter(x=>x.status==='RECONCILIATION_REQUIRED').length,11);
});

test('recovery cannot reopen a reserved or sent delivery',async()=>{
  const f=fixture();
  const begin=await f.outbox.begin(booking);
  const claim=await f.outbox.claim({...finalized,registration_token:begin.registration_token});
  assert.equal(claim.status,'CLAIMED');

  const reserved=await f.outbox.recoverRegistered({
    ...booking,recovery_reason:'PROVIDER_TRANSIENT_503'
  });
  assert.equal(reserved.status,'RECONCILIATION_REQUIRED');
  assert.equal(reserved.error,'DIRECT_FINAL_SEND_OUTCOME_UNKNOWN');

  await f.outbox.acknowledge({
    opportunity_id:booking.opportunity_id,
    claim_token:claim.claim_token,provider_message_id:'gmail-one'
  });
  const sent=await f.outbox.recoverRegistered({
    ...booking,recovery_reason:'PROVIDER_TRANSIENT_503'
  });
  assert.equal(sent.status,'SKIPPED_ALREADY_SENT');
});

test('uncertain recovery CAS result never returns a new usable token',async()=>{
  const f=fixture();
  await f.outbox.begin(booking);
  f.storage.putJson=async()=>{throw Error('NETWORK_TIMEOUT');};
  const result=await f.outbox.recoverRegistered({
    ...booking,recovery_reason:'PROVIDER_TRANSIENT_503'
  });
  assert.equal(result.status,'RECONCILIATION_REQUIRED');
  assert.equal(result.error,'DIRECT_FINAL_RECOVERY_UNCERTAIN');
  assert.equal('registration_token' in result,false);
});

test('strict direct-final provenance requires PREPARE seal before claim',async()=>{
  const f=fixture({requireFinalProvenance:true});
  const begin=await f.outbox.begin(booking);
  const denied=await f.outbox.claim({...strictFinalized(),registration_token:begin.registration_token});
  assert.equal(denied.status,'BLOCKED');
  assert.equal(denied.error,'DIRECT_FINAL_PREPARE_NOT_SEALED');

  const sealed=await f.outbox.sealPrepare({
    ...booking,
    registration_token:begin.registration_token,
    prepare_case_state_json:JSON.stringify(certifiedPrepareState())
  },{now:1100});
  assert.equal(sealed.status,'PREPARE_SEALED');
  assert.equal(sealed.reused,false);
  assert.equal(sealed.evidence_count,2);

  const claim=await f.outbox.claim({
    ...strictFinalized(),registration_token:begin.registration_token
  },{now:1200});
  assert.equal(claim.status,'CLAIMED');
  const rec=[...f.blobs.values()][0].value;
  assert.match(rec.provenance_prepare_hash,/^[a-f0-9]{64}$/);
  assert.match(rec.provenance_stage_output_hash,/^[a-f0-9]{64}$/);
  assert.match(rec.provenance_audit_hash,/^[a-f0-9]{64}$/);
});

test('PREPARE seal is idempotent only for the exact certified PREPARE state',async()=>{
  const f=fixture({requireFinalProvenance:true});
  const begin=await f.outbox.begin(booking);
  const base={
    ...booking,registration_token:begin.registration_token,
    prepare_case_state_json:JSON.stringify(certifiedPrepareState())
  };
  const first=await f.outbox.sealPrepare(base);
  assert.equal(first.status,'PREPARE_SEALED');
  const second=await f.outbox.sealPrepare(base);
  assert.equal(second.status,'PREPARE_SEALED');
  assert.equal(second.reused,true);

  const changed=certifiedPrepareState();
  const truth=JSON.parse(changed.canonical_truth_json);
  truth.booking_evidence[0].statement='Changed after seal';
  changed.canonical_truth_json=JSON.stringify(truth);
  const mismatch=await f.outbox.sealPrepare({
    ...booking,registration_token:begin.registration_token,
    prepare_case_state_json:JSON.stringify(changed)
  });
  assert.equal(mismatch.status,'BLOCKED');
  assert.equal(mismatch.error,'DIRECT_FINAL_PREPARE_SEAL_MISMATCH');
});

test('uncertified PREPARE cannot be sealed for direct-final delivery',async()=>{
  const f=fixture({requireFinalProvenance:true});
  const begin=await f.outbox.begin(booking);
  const bad=certifiedPrepareState({p3_semantic_status:'FAILED'});
  const result=await f.outbox.sealPrepare({
    ...booking,registration_token:begin.registration_token,
    prepare_case_state_json:JSON.stringify(bad)
  });
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.error,'DIRECT_FINAL_PREPARE_NOT_CERTIFIED');
});

test('strict claim rejects changed PREPARE, final-state mismatch and arbitrary brief text',async()=>{
  for(const mutation of ['prepare','state','brief']){
    const f=fixture({requireFinalProvenance:true});
    const begin=await f.outbox.begin(booking);
    const prepare=certifiedPrepareState();
    await f.outbox.sealPrepare({
      ...booking,registration_token:begin.registration_token,
      prepare_case_state_json:JSON.stringify(prepare)
    });
    const payload=strictFinalized();
    if(mutation==='prepare'){
      const changed=certifiedPrepareState();
      const truth=JSON.parse(changed.canonical_truth_json);
      truth.canonical_evidence_registry[0].source_excerpt='Changed public fact';
      changed.canonical_truth_json=JSON.stringify(truth);
      payload.prepare_case_state_json=JSON.stringify(changed);
    }
    if(mutation==='state') payload.final_case_state_json=JSON.stringify({...strictArtifact,match_score:81});
    if(mutation==='brief') payload.final_brief_markdown='Arbitrary caller text';
    const result=await f.outbox.claim({...payload,registration_token:begin.registration_token});
    assert.equal(result.status,'BLOCKED',mutation);
    assert.equal(result.error,
      mutation==='prepare'?'DIRECT_FINAL_PREPARE_PROVENANCE_MISMATCH':
      mutation==='state'?'DIRECT_FINAL_FINAL_STATE_MISMATCH':
      'DIRECT_FINAL_RENDER_MISMATCH');
  }
});

test('zero-question FINALIZE lineage cannot introduce PROS or unsealed evidence IDs',async()=>{
  for(const badId of ['PROS-001','FAC-999']){
    const f=fixture({requireFinalProvenance:true});
    const begin=await f.outbox.begin(booking);
    await f.outbox.sealPrepare({
      ...booking,registration_token:begin.registration_token,
      prepare_case_state_json:JSON.stringify(certifiedPrepareState())
    });
    const artifact={...strictArtifact,intelligence_lineage:[
      ...strictArtifact.intelligence_lineage,{evidence_id:badId,usage:'Injected lineage'}
    ]};
    const rendered=renderFinalBrief(artifact);
    const result=await f.outbox.claim({
      ...strictFinalized(),
      final_stage_output_json:JSON.stringify(artifact),
      final_case_state_json:JSON.stringify(artifact),
      final_brief_markdown:rendered.brief_markdown,
      registration_token:begin.registration_token
    });
    assert.equal(result.status,'BLOCKED',badId);
    assert.equal(result.error,'DIRECT_FINAL_LINEAGE_INVALID');
  }
});
