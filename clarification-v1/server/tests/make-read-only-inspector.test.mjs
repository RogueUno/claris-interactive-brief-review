import test from 'node:test';
import assert from 'node:assert/strict';
import {createMakeReadOnlyInspector} from '../../../calibration-v3/server/make-read-only-inspector.mjs';
const token='synthetic-test-token-not-real';
test('Make inspector permits GET on allowlisted EU1 paths only',async()=>{
 const urls=[];
 const inspect=createMakeReadOnlyInspector({token,fetchImpl:async(url,options)=>{
   urls.push({url,method:options.method,auth:options.headers.Authorization});
   if(url.endsWith('/scenarios/7786842'))return {ok:true,json:async()=>({scenario:{id:7786842,isActive:false}})};
   if(url.endsWith('/dlqs?scenarioId=7786842'))return {ok:true,json:async()=>({dlqs:[],pg:{offset:0,limit:100}})};
   throw Error('unexpected path');
 }});
 const s=await inspect.inspectScenario({scenarioId:7786842});
 assert.equal(s.status,'inactive');
 assert.deepEqual(urls.map(x=>x.method),['GET','GET']);
 assert.ok(urls.every(x=>x.auth==='Token '+token));
 await assert.rejects(()=>inspect.inspectExecution({
   scenarioId:7786842,executionId:'a'.repeat(32)
 }),/MAKE_EXECUTION_TERMINAL_PROOF_NOT_IMPLEMENTED/);
});
test('incomplete runs, uncertain active state and malformed API responses cannot authorize',async()=>{
 for(const dlqs of [[{id:'pending'}],null]){
  const f=createMakeReadOnlyInspector({token,fetchImpl:async url=>({ok:true,json:async()=>url.includes('/dlqs?')?{dlqs}:{scenario:{id:7786842,isActive:false}}})});
  await assert.rejects(()=>f.inspectScenario({scenarioId:7786842}));
 }
});
test('unsafe scenario ids and invalid credentials fail closed',async()=>{
 const f=createMakeReadOnlyInspector({token,fetchImpl:async()=>{throw Error('no network')}});
 await assert.rejects(()=>f.inspectScenario({scenarioId:'7786842/../user'}),/MAKE_SCENARIO_ID_INVALID/);
 assert.throws(()=>createMakeReadOnlyInspector({token:'x'}),/MAKE_INSPECTOR_CONFIG_INVALID/);
});

test('empty first page without pagination metadata cannot certify no pending work',async()=>{
 const inspect=createMakeReadOnlyInspector({token,fetchImpl:async url=>({ok:true,json:async()=>url.includes('/dlqs?')?{dlqs:[]}:{scenario:{id:7786842,isActive:false}}})});
 await assert.rejects(()=>inspect.inspectScenario({scenarioId:7786842}),/PAGINATION_UNVERIFIED/);
});
