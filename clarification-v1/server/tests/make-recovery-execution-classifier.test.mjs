import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMakeRecoveryExecution} from '../../../calibration-v3/server/make-recovery-execution-classifier.mjs';
const id='a7d72485a71246d6b599c6bec301b241';
const summary={execution:{id,status:'error',startedAt:'2026-10-06T11:55:28.774Z',duration:338270},error:{message:'[503] This model is currently experiencing high demand.'}};
const inspection={execution:{id,status:'error',startedAt:'2026-10-06T11:55:28.774Z',duration:338270},
error:{message:'[503] This model is currently experiencing high demand.',moduleId:19},
modules:[{id:2,invocations:1,errors:0},{id:19,invocations:1,errors:1}]};
test('real C2 verifier 503 cannot be misclassified as PREPARE failure',()=>{
  assert.equal(classifyMakeRecoveryExecution({scenarioId:7786842,executionId:id,summary,inspection}),null);
});
test('even a PREPARE child failure cannot prove no-send, child-provider or no-pending facts',()=>{
 const value=classifyMakeRecoveryExecution({scenarioId:7786842,executionId:id,summary,
 inspection:{...inspection,error:{...inspection.error,moduleId:2},
 modules:[{id:2,invocations:1,errors:1}]}});
 assert.equal(value.failure_stage,'PREPARE');
 assert.equal(value.provider_failure_class,'UNVERIFIED_CHILD');
 assert.equal(value.pending_operations,null);
 assert.equal(value.send_attempted,null);
 assert.equal(value.claim_attempted,null);
});
test('ambiguous or FINALIZE-linked errors are denied',()=>{
 for(const mutation of [
  {error:{...inspection.error,moduleId:55}},
  {modules:[{id:2,errors:1,invocations:1},{id:55,errors:0,invocations:1}]},
  {error:{message:'Unknown failure',moduleId:2},modules:[{id:2,errors:1,invocations:1}]}
 ]){
  const x=classifyMakeRecoveryExecution({scenarioId:7786842,executionId:id,summary,
    inspection:{...inspection,...mutation}});
  assert.equal(x,null);
 }
});

test('truncated and contradictory Make execution histories fail closed',()=>{
 for(const change of [
  {eventsTruncated:true},
  {modules:[{id:2,invocations:1,errors:2}]},
  {modules:[{id:2,invocations:1,errors:1},{id:2,invocations:1,errors:1}]}
 ]){
  assert.equal(classifyMakeRecoveryExecution({scenarioId:7786842,executionId:id,summary,
   inspection:{...inspection,error:{message:'[503] transient',moduleId:2},
    modules:[{id:2,invocations:1,errors:1}],...change}}),null);
 }
 const mismatch={...summary,execution:{...summary.execution,duration:123}};
 assert.equal(classifyMakeRecoveryExecution({scenarioId:7786842,executionId:id,summary:mismatch,
  inspection:{...inspection,error:{message:'[503] transient',moduleId:2},modules:[{id:2,invocations:1,errors:1}]}}),null);
});
