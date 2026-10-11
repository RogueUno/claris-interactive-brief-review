import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/clarification/admin/package.mjs';

const URL='https://claris-calibration.vercel.app/api/clarification/admin/package';
const operation='FINAL_SNAPSHOT_SOURCE_PREFLIGHT_READ_ONLY';
function request(token,body,method='POST') {
 return new Request(URL,{
   method,
   headers:{authorization:'Bearer '+token,'x-claris-operation':operation,
     'content-type':'application/json'},
   ...(method==='POST'?{body:JSON.stringify(body)}:{})
 });
}
test('source preflight is admin-only; Make token cannot read prospective answers',async()=>{
 const backup={admin:process.env.CLARIS_ADMIN_KEY,make:process.env.CLARIS_MAKE_KEY};
 try {
   process.env.CLARIS_ADMIN_KEY='source-preflight-admin-fixture';
   process.env.CLARIS_MAKE_KEY='source-preflight-make-fixture';
   let res=await handler.fetch(request('source-preflight-make-fixture',{opportunity_id:'valid_test'}));
   assert.equal(res.status,401);
   assert.equal((await res.json()).error,'SOURCE_PREFLIGHT_ADMIN_ONLY');
   res=await handler.fetch(request('source-preflight-admin-fixture',{
     opportunity_id:'valid_test',artifact:{pretend:true}
   }));
   assert.equal(res.status,400);
   assert.equal((await res.json()).error,'SOURCE_PREFLIGHT_ONLY_OPPORTUNITY_ID_ALLOWED');
   res=await handler.fetch(request('source-preflight-admin-fixture',{opportunity_id:'../../secrets'}));
   assert.equal(res.status,400);
   assert.equal((await res.json()).error,'OPPORTUNITY_ID_INVALID');
   assert.equal(res.headers.get('cache-control'),'no-store');
   res=await handler.fetch(request('source-preflight-admin-fixture',{opportunity_id:'valid_test'},'GET'));
   assert.equal(res.status,405);
   process.env.CLARIS_MAKE_KEY=process.env.CLARIS_ADMIN_KEY;
   res=await handler.fetch(request('source-preflight-admin-fixture',{opportunity_id:'valid_test'}));
   assert.equal(res.status,401);
 } finally {
   for(const [key,value] of [
     ['CLARIS_ADMIN_KEY',backup.admin],
     ['CLARIS_MAKE_KEY',backup.make]
   ]) {
     if(value===undefined) delete process.env[key]; else process.env[key]=value;
   }
 }
});
