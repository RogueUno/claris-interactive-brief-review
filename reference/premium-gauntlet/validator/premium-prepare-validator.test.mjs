import assert from 'node:assert/strict';
import { validatePremiumPrepare } from './premium-prepare-validator.mjs';

const filler = Array.from({length:445},(_,i)=>`w${i}`).join(' ');
const base={
 schema_version:'CLARIS_PREMIUM_PREPARE_V3_5',
 open_dimensions:[
  {dimension_id:'D1',dimension:'TECHNICAL_SCOPE',exposed_by:['BOOKING'],why_open:'API security scope unspecified',max_questions:1},
  {dimension_id:'D2',dimension:'DESIRED_OUTCOME',exposed_by:['BOOKING'],why_open:'Outcome unspecified',max_questions:1}
 ],
 signals_that_matter:[1,2,3,4].map(i=>({signal:`s${i}`,observation:`o${i}`,call_implication:`c${i}`,routes_to:[`E${i}`,'R1']})),
 opportunity_hypotheses:[],
 call_strategy:{opening_move:'scope',first_10_minutes:['scope','outcome'],avoid_early:['no causal claims']},
 priority_questions:[
  {question:'Which API security surface is in scope?',dimension_id:'D1',purpose:'scope',what_the_answer_changes:'focus',routes_to:['R1','U1']},
  {question:'What outcome do you want: guidance, testing, assurance, or something else?',dimension_id:'D2',purpose:'outcome',what_the_answer_changes:'service path',routes_to:['R2','U2']}
 ],
 conditional_service_paths:[
  {service_id:'SVC_VCISO_ADVISORY',condition_to_confirm:'guidance',why_relevant_if_confirmed:'advisory',do_not_assume:'need',depends_on_dimensions:['D2'],routes_to:['U2']},
  {service_id:'SVC_PENTEST',condition_to_confirm:'testing',why_relevant_if_confirmed:'testing',do_not_assume:'need',depends_on_dimensions:['D2'],routes_to:['U2']}
 ],
 critical_unknowns:[
  {unknown:'Exact API security surface in scope.',dimension_id:'D1',routes_to:['U1']},
  {unknown:'Desired external-help outcome.',dimension_id:'D2',routes_to:['U2']}
 ],
 expandable_blocks:{
  evidence:[1,2,3,4].map(i=>({id:`E${i}`,title:`e${i}`,claims:[`c${i}`],sources:[{url:`https://resend.com/x${i}`,source_type:'FIRST_PARTY',supports:'fact'}],used_for:['signal'],not_used_for:['intent']})),
  reasoning:[
   {id:'R1',title:'r1',premises:['p'],observation:'o',confidence:'HIGH',linked_evidence_ids:['E1'],not_a_claim_of:['intent']},
   {id:'R2',title:'r2',premises:['p'],observation:'o',confidence:'HIGH',linked_evidence_ids:['E2'],not_a_claim_of:['need']}
  ],
  unknowns:[
   {id:'U1',title:'u1',dimension_id:'D1',why_unknown:'booking sparse',what_would_resolve_it:'answer',blocked_conclusions:['scope']},
   {id:'U2',title:'u2',dimension_id:'D2',why_unknown:'booking sparse',what_would_resolve_it:'answer',blocked_conclusions:['service']}
  ]
 },
 premium_brief_markdown:filler
};

const opts={bookingText:'Interested in discussing API security.',companyDomainHost:'resend.com',allowedServiceIds:['SVC_VCISO_ADVISORY','SVC_PENTEST','SVC_ENTERPRISE_SECURITY']};

let r=validatePremiumPrepare(base,opts);
assert.equal(r.ok,true,JSON.stringify(r.errors));

const emptyHyp=structuredClone(base);
emptyHyp.opportunity_hypotheses=[];
assert.equal(validatePremiumPrepare(emptyHyp,opts).ok,true);

const budget=structuredClone(base);
budget.priority_questions[0].question='What is your budget?';
assert.equal(validatePremiumPrepare(budget,opts).ok,false);

const badDim=structuredClone(base);
badDim.open_dimensions[0].dimension='BUDGET';
assert.equal(validatePremiumPrepare(badDim,opts).ok,false);

const missingMd=structuredClone(base);
missingMd.premium_brief_markdown='';
assert.equal(validatePremiumPrepare(missingMd,opts).ok,false);

const badRoute=structuredClone(base);
badRoute.signals_that_matter[0].routes_to=['E99'];
assert.equal(validatePremiumPrepare(badRoute,opts).ok,false);

const hipaa=structuredClone(base);
hipaa.premium_brief_markdown=('HIPAA '+filler);
assert.equal(validatePremiumPrepare(hipaa,opts).ok,false);

console.log('premium validator tests: PASS');
