import test from 'node:test';
import assert from 'node:assert/strict';
import {runMakeInspectorDiagnostic} from '../../../calibration-v3/server/make-inspector-diagnostic.mjs';
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'candidate/trusted-booking-facts-20261007',CLARIS_MAKE_INSPECTOR_DIAGNOSTIC_V1:'true',CLARIS_MAKE_INSPECTOR_TOKEN:'synthetic-token-for-ci-only'};
test('disabled outside candidate Preview without network',async()=>{
 let calls=0;
 for(const patch of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{CLARIS_MAKE_INSPECTOR_DIAGNOSTIC_V1:'false'}]){
  const result=await runMakeInspectorDiagnostic({env:{...env,...patch},fetchImpl:async()=>{calls++;throw Error('Unexpected network');}});
  assert.equal(result.status,'DIAGNOSTIC_DISABLED');
 }
 assert.equal(calls,0);
});
test('read-only sanitized successful diagnostic',async()=>{
 const requests=[];
 const result=await runMakeInspectorDiagnostic({env,fetchImpl:async(url,opts)=>{
  requests.push({url,method:opts.method});
  return {ok:true,json:async()=>url.endsWith('/scenarios/7786842')?
   {scenario:{id:7786842,isActive:false}}:{dlqs:[],pg:{offset:0,limit:10}}};
 }});
 assert.equal(result.status,'SCENARIO_READ_VERIFIED');
 assert.equal(result.ok,true);
 assert.deepEqual(requests.map(x=>x.method),['GET','GET']);
 assert.equal(JSON.stringify(result).includes(env.CLARIS_MAKE_INSPECTOR_TOKEN),false);
});
test('missing DLQ pagination and failed request remain safely categorized',async()=>{
 const partial=await runMakeInspectorDiagnostic({env,fetchImpl:async url=>({
  ok:true,json:async()=>url.endsWith('/scenarios/7786842')?
   {scenario:{id:7786842,isActive:false}}:{dlqs:[]}
 })});
 assert.equal(partial.status,'MAKE_INSPECTOR_DLQ_PAGINATION_UNVERIFIED');
 const unavailable=await runMakeInspectorDiagnostic({env,fetchImpl:async()=>{throw Error('private-details')}});
 assert.equal(unavailable.status,'INSPECTOR_UNAVAILABLE');
});
