import test from 'node:test';
import assert from 'node:assert/strict';
import {assessBookingCutover} from '../../../calibration-v3/server/first-mvp-cutover-preflight.mjs';
test('legacy ingress and absent holds cannot pass',()=>{
 const result=assessBookingCutover({ingress:{status:'inactive',target:7533518}});
 assert.equal(result.safeToRun,false);
 assert.ok(result.reasons.includes('INGRESS_TARGET_NOT_PROTECTED'));
 assert.ok(result.reasons.includes('BOOKING_HOLD_MISSING'));
});
test('all protected topology still cannot run without explicit release',()=>{
 const result=assessBookingCutover({
 ingress:{status:'inactive',target:7780705},
 booking:{status:'inactive',hardHold:true,mailDisabled:true,target:7786842},
 lifecycle:{status:'inactive',hardHold:true},
 submitted:{status:'inactive',hardHold:true,mailDisabled:true,target:7786842}
 });
 assert.deepEqual(result.reasons,[]);
 assert.equal(result.safeToRun,false);
});
