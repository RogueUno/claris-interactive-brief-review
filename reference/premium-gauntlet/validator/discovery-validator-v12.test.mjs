import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateDiscoveryV12} from './discovery-validator-v12.mjs';

const fixture=new URL('../fixtures/supabase-v1/',import.meta.url);
const prepare=JSON.parse(fs.readFileSync(new URL('premium-prepare.json',fixture),'utf8'));
const plan=JSON.parse(fs.readFileSync(new URL('discovery-plan.json',fixture),'utf8'));
const sot=JSON.parse(fs.readFileSync(new URL('consultant-sot.json',fixture),'utf8'));

assert.equal(validateDiscoveryV12(plan,prepare,sot).ok,true,'Supabase gold should pass');

const econLeak=structuredClone(plan);
econLeak.commercial_target=['Collect budget if raised.'];
let r=validateDiscoveryV12(econLeak,prepare,sot);
assert.equal(r.ok,false);
assert(r.errors.some(e=>e.code==='ECON_TARGET_NONEMPTY'||e.code==='ECON_LEAK'));

const invalidService=structuredClone(plan);
invalidService.primary_questions[0].linked_service_paths.push({service_id:'SVC_NOT_REAL',condition:'x'});
r=validateDiscoveryV12(invalidService,prepare,sot);
assert.equal(r.ok,false);
assert(r.errors.some(e=>e.code==='SERVICE_ID'));

const badBranch=structuredClone(plan);
badBranch.primary_questions[0].conditional_probes[0].opens_ontology_intent='D10 economics';
badBranch.primary_questions[0].conditional_probes[0].trigger_if='The prospect says they are worried about cross-tenant access.';
r=validateDiscoveryV12(badBranch,prepare,sot);
assert.equal(r.ok,false);
assert(r.errors.some(e=>e.code==='BRANCH_AUTHORITY'));

const capSot=structuredClone(sot);
capSot.services.push({service_id:'SVC_HIPAA',name:'HIPAA Readiness'});
const capPlan=structuredClone(plan);
capPlan.end_of_call_decision.disqualify_or_deprioritize_if=['The prospect needs HIPAA readiness.'];
r=validateDiscoveryV12(capPlan,prepare,capSot);
assert.equal(r.ok,false);
assert(r.errors.some(e=>e.code==='CAPABILITY_AS_DISQUALIFIER'));

const policySot=structuredClone(sot);
policySot.commercial_rules.budget_required_before_first_call=true;
const policyPlan=structuredClone(plan);
policyPlan.authorized_dimensions.push({dimension_id:'P_ECONOMICS',ontology_intent:'D10 economics',authority:'CONSULTANT_POLICY',policy_key:'commercial_rules.budget_required_before_first_call',reason:'Mandatory consultant policy.'});
policyPlan.commercial_target=['Direct budget evidence sufficient to evaluate fit.'];
policyPlan.primary_questions.push({question_id:'Q4',ontology_intent:'D10 economics',dimension_id:'P_ECONOMICS',authority:'CONSULTANT_POLICY',policy_key:'commercial_rules.budget_required_before_first_call',ask:'Have you allocated budget or resources for outside help with this review?',why_now:'Required policy gate after diagnostic fit.',already_known_context:['Diagnostic fit established first.'],listen_for:[{pattern:'Budget range provided',meaning:'Economics resolved',next_effect:'Evaluate fit'}],conditional_probes:[],what_the_answer_changes:'Commercial fit',stop_condition:'Direct budget evidence established',linked_service_paths:[]});
policyPlan.call_flow.push({step:5,move:'Establish budget alignment after diagnostic fit.',advance_when:'Direct budget evidence is collected.'});
policyPlan.end_of_call_decision.ready_for_next_step_if.push('Mandatory economics policy is resolved.');
policyPlan.end_of_call_decision.disqualify_or_deprioritize_if.push('Direct prospect budget evidence is below the consultant minimum engagement floor.');
r=validateDiscoveryV12(policyPlan,prepare,policySot);
assert.equal(r.ok,true,JSON.stringify(r.errors));

console.log('discovery-validator-v12 tests: PASS');
