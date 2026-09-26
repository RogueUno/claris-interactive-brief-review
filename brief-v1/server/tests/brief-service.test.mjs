import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriefRepository } from '../repository.mjs';
import { createBriefService } from '../service.mjs';

function memoryStorage(){
  const data=new Map();
  return {
    data,
    async getJson(path){ const v=data.get(path); return v==null?null:JSON.parse(JSON.stringify(v)); },
    async putJson(path,value){ data.set(path,JSON.parse(JSON.stringify(value))); return {etag:'test'}; }
  };
}
const secret='x'.repeat(64);
const payload={prepare:{schema_version:'CLARIS_PREMIUM_PREPARE_V3_6',open_dimensions:[{dimension_id:'D1',max_questions:1}]},discovery:{schema_version:'CLARIS_DISCOVERY_INTELLIGENCE_V1_2',authorized_dimensions:[{dimension_id:'D1',authority:'PREPARE',policy_key:null}],commercial_target:[],primary_questions:[{question_id:'Q1',dimension_id:'D1',ask:'Which API surface is in scope?',linked_service_paths:[{service_id:'SVC_ADVISORY',condition:'guidance'}],conditional_probes:[]}],end_of_call_decision:{disqualify_or_deprioritize_if:['Requirement is outside all available services.']}}};
const validationContext={services:[{service_id:'SVC_ADVISORY',name:'Advisory vCISO'}],commercial_rules:{budget_required_before_first_call:false}};

test('creates opaque access without storing raw token', async()=>{
  const storage=memoryStorage(); const repo=createBriefRepository(storage); const service=createBriefService({repository:repo,sessionSecret:secret});
  const created=await service.create({consultantId:'consultant_test_1',company:'Acme',payload,validationContext},{now:1000});
  assert.ok(created.token.length>30);
  assert.equal(created.brief.status,'ACTIVE');
  const serialized=JSON.stringify([...storage.data.entries()]);
  assert.equal(serialized.includes(created.token),false);
  assert.equal(serialized.includes('Acme'),true);
});

test('resolves token, issues session, and loads payload', async()=>{
  const storage=memoryStorage(); const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const created=await service.create({consultantId:'consultant_test_1',company:'Acme',payload,validationContext,ttlMs:86400000},{now:1000});
  const resolved=await service.resolve(created.token,{now:2000});
  assert.equal(resolved.ok,true);
  assert.equal('payload' in resolved.brief,false);
  const loaded=await service.load(resolved.session_token,{now:3000});
  assert.equal(loaded.ok,true);
  assert.deepEqual(loaded.brief.payload,payload);
});

test('invalid and expired tokens fail closed', async()=>{
  const storage=memoryStorage(); const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const created=await service.create({consultantId:'consultant_test_1',company:'Acme',payload,validationContext,ttlMs:3600000},{now:1000});
  assert.equal((await service.resolve('wrong-token',{now:2000})).ok,false);
  const expired=await service.resolve(created.token,{now:1000+3600001});
  assert.equal(expired.error,'BRIEF_EXPIRED');
});

test('revocation invalidates existing sessions', async()=>{
  const storage=memoryStorage(); const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const created=await service.create({consultantId:'consultant_test_1',company:'Acme',payload,validationContext,ttlMs:86400000},{now:1000});
  const resolved=await service.resolve(created.token,{now:2000});
  assert.equal((await service.load(resolved.session_token,{now:3000})).ok,true);
  const revoked=await service.revoke(created.brief.brief_id,{now:4000});
  assert.equal(revoked.brief.status,'REVOKED');
  const after=await service.load(resolved.session_token,{now:5000});
  assert.equal(after.error,'BRIEF_REVOKED');
});

test('session expires no later than brief', async()=>{
  const storage=memoryStorage(); const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const created=await service.create({consultantId:'consultant_test_1',company:'Acme',payload,validationContext,ttlMs:3600000},{now:1000});
  const resolved=await service.resolve(created.token,{now:2000});
  assert.equal(resolved.session_expires_at,1000+3600000);
  const after=await service.load(resolved.session_token,{now:1000+3600001});
  assert.equal(after.ok,false);
});

test('rejects unrecognized artifact schemas before persistence', async()=>{
  const storage=memoryStorage(); const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const result=await service.create({consultantId:'consultant_test_1',company:'Acme',validationContext,payload:{prepare:{schema_version:'OLD'},discovery:{schema_version:'CLARIS_DISCOVERY_INTELLIGENCE_V1_2',primary_questions:[{dimension_id:'D1'}]}}},{now:1000});
  assert.equal(result.ok,false);
  assert.equal(result.errors.some(e=>e.code==='PREPARE_SCHEMA'),true);
  assert.equal(storage.data.size,0);
});

test('refuses economics leakage before publishing', async()=>{
  const storage=memoryStorage(); const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const bad=structuredClone(payload); bad.discovery.commercial_target=['Collect budget if raised.'];
  const result=await service.create({consultantId:'consultant_test_1',company:'Acme',payload:bad,validationContext},{now:1000});
  assert.equal(result.ok,false);
  assert.equal(result.errors.some(e=>e.code==='ECON_TARGET_NONEMPTY'),true);
  assert.equal(storage.data.size,0);
});

test('refuses invalid service mapping before publishing', async()=>{
  const storage=memoryStorage(); const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const bad=structuredClone(payload); bad.discovery.primary_questions[0].linked_service_paths[0].service_id='SVC_FAKE';
  const result=await service.create({consultantId:'consultant_test_1',company:'Acme',payload:bad,validationContext},{now:1000});
  assert.equal(result.ok,false);
  assert.equal(result.errors.some(e=>e.code==='SERVICE_ID'),true);
  assert.equal(storage.data.size,0);
});


test('certified publication is idempotent for identical opportunity and artifacts', async()=>{
  const storage=memoryStorage();
  const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const input={opportunityId:'opp_same_1',consultantId:'consultant_test_1',company:'Acme',payload,validationContext,ttlMs:86400000};
  const first=await service.publish(input,{now:1000});
  const second=await service.publish(input,{now:2000});

  assert.equal(first.reused,false);
  assert.equal(second.reused,true);
  assert.equal(first.publication_id,second.publication_id);
  assert.equal(first.brief.brief_id,second.brief.brief_id);
  assert.equal(first.token,second.token);

  const serialized=JSON.stringify([...storage.data.entries()]);
  assert.equal(serialized.includes(first.token),false);
  const briefs=[...storage.data.values()].filter(v=>v?.schema_version==='claris_private_brief_v1');
  const accesses=[...storage.data.values()].filter(v=>v?.schema_version==='claris_private_brief_access_v1');
  assert.equal(briefs.length,1);
  assert.equal(accesses.length,1);
});

test('changed certified artifact creates a new publication for the same opportunity', async()=>{
  const storage=memoryStorage();
  const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const first=await service.publish({opportunityId:'opp_changed_1',consultantId:'consultant_test_1',company:'Acme',payload,validationContext,ttlMs:86400000},{now:1000});
  const changed=structuredClone(payload);
  changed.prepare.executive_readout='A materially updated certified readout.';
  const second=await service.publish({opportunityId:'opp_changed_1',consultantId:'consultant_test_1',company:'Acme',payload:changed,validationContext,ttlMs:86400000},{now:2000});

  assert.notEqual(first.publication_id,second.publication_id);
  assert.notEqual(first.token,second.token);
  const briefs=[...storage.data.values()].filter(v=>v?.schema_version==='claris_private_brief_v1');
  assert.equal(briefs.length,2);
});

test('revoked certified publication cannot be resurrected by retry', async()=>{
  const storage=memoryStorage();
  const service=createBriefService({repository:createBriefRepository(storage),sessionSecret:secret});
  const input={opportunityId:'opp_revoked_1',consultantId:'consultant_test_1',company:'Acme',payload,validationContext,ttlMs:86400000};
  const first=await service.publish(input,{now:1000});
  await service.revoke(first.brief.brief_id,{now:2000});
  const retry=await service.publish(input,{now:3000});

  assert.equal(retry.ok,false);
  assert.equal(retry.error,'BRIEF_PUBLICATION_REVOKED');
  assert.equal(retry.publication_id,first.publication_id);
  const stored=[...storage.data.values()].find(v=>v?.schema_version==='claris_private_brief_v1');
  assert.equal(stored.status,'REVOKED');
});
