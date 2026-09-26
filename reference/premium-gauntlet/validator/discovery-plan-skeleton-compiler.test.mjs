import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileDiscoveryPlanSkeleton} from './discovery-plan-skeleton-compiler.mjs';
const fixture=new URL('../fixtures/supabase-v1/',import.meta.url);
const prepare=JSON.parse(fs.readFileSync(new URL('premium-prepare.json',fixture),'utf8'));
const sot=JSON.parse(fs.readFileSync(new URL('consultant-sot.json',fixture),'utf8'));
const catalog=JSON.parse(fs.readFileSync(new URL('../contracts/discovery-intents-v1.json',import.meta.url),'utf8'));
let r=compileDiscoveryPlanSkeleton(prepare,sot,catalog);
assert.equal(r.ok,true,JSON.stringify(r.errors));
assert.equal(r.question_slots.length,3);
assert.deepEqual(r.question_slots.map(x=>x.dimension_id),['D1','D2','D3']);
assert.equal(r.commercial_target_authorized,false);
assert(r.forbidden_primary_intents.includes('D10 economics'));
assert.equal(r.ontology_coverage.length,15);
assert.equal(r.coverage_summary.catalog_intent_count,15);
assert.equal(r.coverage_summary.primary_authorized_count,3);
assert.equal(r.coverage_summary.deferred_not_authorized_count,12);
assert.equal(r.coverage_summary.unaccounted_count,0);
assert.deepEqual(
  r.ontology_coverage.filter(x=>x.status==='PRIMARY_AUTHORIZED').map(x=>x.ontology_intent),
  ['D02 technical_or_service_scope','D06 desired_outcome','D11 timing_trigger']
);
assert.equal(r.ontology_coverage.find(x=>x.intent_id==='D10').status,'DEFERRED_NOT_AUTHORIZED');
const ps=structuredClone(sot); ps.commercial_rules.budget_required_before_first_call=true;
r=compileDiscoveryPlanSkeleton(prepare,ps,catalog);
assert.equal(r.ok,true,JSON.stringify(r.errors));
assert.equal(r.question_slots.length,4);
assert.equal(r.question_slots.at(-1).dimension_id,'P_ECONOMICS');
assert.equal(r.commercial_target_authorized,true);
assert(!r.forbidden_primary_intents.includes('D10 economics'));
assert.equal(r.ontology_coverage.length,15);
assert.equal(r.coverage_summary.primary_authorized_count,4);
assert.equal(r.coverage_summary.deferred_not_authorized_count,11);
assert.equal(r.coverage_summary.unaccounted_count,0);
const economics=r.ontology_coverage.find(x=>x.intent_id==='D10');
assert.equal(economics.status,'PRIMARY_AUTHORIZED');
assert.deepEqual(economics.authorized_dimensions,['P_ECONOMICS']);
assert.deepEqual(economics.authorities,['CONSULTANT_POLICY']);
console.log('discovery-plan-skeleton-compiler tests: PASS');
