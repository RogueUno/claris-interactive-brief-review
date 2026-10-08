import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryAttestationEnabled } from '../../../api/delivery/package.mjs';
import { createDirectFinalOutbox } from '../../../calibration-v3/server/direct-final-outbox.mjs';

test('strict recovery flag defaults off and only recognizes explicit on values', () => {
  assert.equal(recoveryAttestationEnabled({}), false);
  assert.equal(recoveryAttestationEnabled({CLARIS_RECOVERY_ATTESTATION_V1:'true'}), true);
  assert.equal(recoveryAttestationEnabled({CLARIS_RECOVERY_ATTESTATION_V1:'false'}), false);
});

test('strict recovery requires server attestor even with caller-provided approval', async () => {
  const records=new Map(); let revision=0;
  const storage={
    async getJsonWithMeta(path) {
      const x=records.get(path); return x?{value:structuredClone(x.value),etag:x.etag}:{value:null,etag:null};
    },
    async putJsonIfAbsent(path,value){
      if(records.has(path))throw Error('BLOB_ALREADY_EXISTS');
      records.set(path,{value:structuredClone(value),etag:'e'+(++revision)});
    },
    async putJson(path,value,{ifMatch}){
      const x=records.get(path);if(!x||x.etag!==ifMatch)throw Error('BLOB_PRECONDITION_FAILED');
      records.set(path,{value:structuredClone(value),etag:'e'+(++revision)});
    }
  };
  const sot={consultant:{consultant_name:'QA Person',firm:'QA Advisory'},services:[]};
  const consultantRepository={
    async loadIdentity(){return {consultant_id:'consultant_qa',delivery_email:'owner@qa.example.com'};},
    async loadProfileEnvelopeWithMeta(){return {etag:'locked',envelope:{consultant_id:'consultant_qa',lifecycle_record:{consultant_id:'consultant_qa',status:'LOCKED',runtime_v3:{status:'READY',consultant_sot_json:sot,report:{errors:[],warnings:[]}}}}};}
  };
  const outbox=createDirectFinalOutbox({storage,consultantRepository,requireRecoveryAttestation:true});
  const input={opportunity_id:'qa_strict_recovery_001',consultant_id:'consultant_qa',
    consultant_delivery_email:'owner@qa.example.com',consultant_sot_json:sot,
    company:'Acme',prospect_first_name:'Robin',prospect_email:'robin@acme.com',
    meeting_time:'2026-10-09T15:00:00Z',domain:'https://acme.com/'};
  assert.equal((await outbox.begin(input)).status,'REGISTERED');
  const attempt=await outbox.recoverRegistered({...input,recovery_reason:'PROVIDER_TRANSIENT_503',
    authorized:true,operator_approved:true,terminal_provider_503:true});
  assert.equal(attempt.status,'BLOCKED');
  assert.equal(attempt.error,'DIRECT_FINAL_RECOVERY_ATTESTOR_UNAVAILABLE');
  assert.equal([...records.values()][0].value.recovery_count,0);
});
