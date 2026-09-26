import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileAuthorizedDimensions} from './authorized-dimensions-compiler.mjs';
const fixture=new URL('../fixtures/supabase-v1/',import.meta.url);
const prepare=JSON.parse(fs.readFileSync(new URL('premium-prepare.json',fixture),'utf8'));
const sot=JSON.parse(fs.readFileSync(new URL('consultant-sot.json',fixture),'utf8'));
let r=compileAuthorizedDimensions(prepare,sot);
assert.equal(r.ok,true,JSON.stringify(r.errors));
assert.deepEqual(r.dimensions.map(x=>[x.dimension_id,x.ontology_intent]),[
  ['D1','D02 technical_or_service_scope'],['D2','D06 desired_outcome'],['D3','D11 timing_trigger']
]);
const policy=structuredClone(sot); policy.commercial_rules.budget_required_before_first_call=true;
r=compileAuthorizedDimensions(prepare,policy);
assert.equal(r.ok,true);
assert(r.dimensions.some(x=>x.dimension_id==='P_ECONOMICS'&&x.ontology_intent==='D10 economics'));
const bad=structuredClone(prepare); bad.open_dimensions.push({dimension_id:'D99',dimension_kind:'OTHER_EXPLICIT',why_open:'x'});
r=compileAuthorizedDimensions(bad,sot);
assert.equal(r.ok,false);
assert(r.errors.some(e=>e.code==='ONTOLOGY_MAP'));
console.log('authorized-dimensions-compiler tests: PASS');
