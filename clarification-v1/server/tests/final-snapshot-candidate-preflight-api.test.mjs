import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/clarification/admin/package.mjs';

const URL='https://claris-calibration.vercel.app/api/clarification/admin/package';
const op='FINAL_SNAPSHOT_CANDIDATE_PREFLIGHT_READ_ONLY';
const adm='candidate-preflight-admin';
const make='candidate-preflight-make';
function request(token,body,options={}) {
 const headers=new Headers({authorization:'Bearer '+token,
   'x-claris-operation':op,'content-type':'application/json'});
 if(options.length) headers.set('content-length',String(options.length));
 return new Request(URL,{method:'POST',headers,body:JSON.stringify(body)});
}
test('candidate endpoint is admin-only, never accepts caller-injected envelope or storage state',async()=>{
 const backup={admin:process.env.CLARIS_ADMIN_KEY,make:process.env.CLARIS_MAKE_KEY};
 try{
  process.env.CLARIS_ADMIN_KEY=adm;process.env.CLARIS_MAKE_KEY=make;
  let r=await handler.fetch(request(make,{opportunity_id:'test_opp'}));
  assert.equal(r.status,401);
  assert.equal((await r.json()).error,'FINAL_CANDIDATE_ADMIN_ONLY');
  r=await handler.fetch(request(adm,{opportunity_id:'test_opp',envelope:{fake:true}}));
  assert.equal(r.status,400);
  assert.equal((await r.json()).error,'FINAL_CANDIDATE_INPUT_INVALID');
  r=await handler.fetch(request(adm,{opportunity_id:'../../bad'}));
  assert.equal(r.status,400);
  assert.equal((await r.json()).error,'OPPORTUNITY_ID_INVALID');
  r=await handler.fetch(request(adm,{opportunity_id:'test_opp'},{length:470000}));
  assert.equal(r.status,413);
  assert.equal((await r.json()).error,'FINAL_CANDIDATE_INPUT_TOO_LARGE');
  process.env.CLARIS_MAKE_KEY=adm;
  r=await handler.fetch(request(adm,{opportunity_id:'test_opp'}));
  assert.equal(r.status,401);
  assert.equal((await r.json()).error,'FINAL_CANDIDATE_ADMIN_ONLY');
  assert.equal(r.headers.get('cache-control'),'no-store');
 }finally{
  for(const [key,value] of [['CLARIS_ADMIN_KEY',backup.admin],['CLARIS_MAKE_KEY',backup.make]]){
   if(value===undefined) delete process.env[key];else process.env[key]=value;
  }
 }
});
