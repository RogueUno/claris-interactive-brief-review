import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessDiscoveryCoverage} from '../discovery-coverage.mjs';
import {assessCommercialBrief} from '../commercial-brief-readiness.mjs';

const load = name => JSON.parse(readFileSync(new URL('./fixtures/'+name, import.meta.url),'utf8'));
const fictional=load('fictional-soc2-advisory-final.json');
const oct10=load('oct10-finalize-live-actual.json');
const oct09=load('oct09-finalize-actual.json');

test('fictional commercial SOC2 case covers buyer outcome, technical scope, evidence, authority, budget and timing',()=>{
  const r=assessDiscoveryCoverage(fictional);
  assert.equal(r.status,'BREADTH_CANDIDATE');
  assert.equal(r.question_count,5);
  assert.equal(r.covered_count,6);
  assert.deepEqual(r.missing,[]);
  assert.deepEqual(r.duplicated_indices,[]);
  assert.equal(assessCommercialBrief(fictional).checks.discovery_breadth,true);
});

test('real October 10 rehearsal has narrow call-purpose question; never fabricate a commercial discovery plan',()=>{
  const r=assessDiscoveryCoverage(oct10);
  assert.equal(r.question_count,1);
  assert.equal(r.status,'BREADTH_REVIEW_REQUIRED');
  assert.ok(r.covered_count <= 1);
  const review=assessCommercialBrief(oct10,{synthetic:true});
  assert.equal(review.status,'NOT_COMMERCIAL_BENCHMARK');
  assert.equal(review.checks.discovery_breadth,false);
  assert.deepEqual(review.discovery_strategy.missing,r.missing);
});

test('actual October 9 artifact also lacks broad discovery questions',()=>{
  const r=assessDiscoveryCoverage(oct09);
  assert.equal(r.status,'BREADTH_REVIEW_REQUIRED');
  assert.ok(r.covered_count < 4);
});

test('multiple generic icebreaker questions cannot satisfy high-ticket discovery breadth',()=>{
  const shallow={discovery_question_plan:[
    'Tell me about your company?',
    'What is important to you?',
    'Can you say more about that?',
    'Any other priorities?',
    'How can we help?'
  ],preliminary_brief_markdown:'Budget, audit, deadline and scope are stated in narrative, not the discovery plan.'};
  const r=assessDiscoveryCoverage(shallow);
  assert.equal(r.question_count,5);
  assert.equal(r.status,'BREADTH_REVIEW_REQUIRED');
  assert.equal(r.covered_count,0);
  assert.equal(assessCommercialBrief(shallow).checks.discovery,true);
  assert.equal(assessCommercialBrief(shallow).checks.discovery_breadth,false);
});

test('exact duplicated discovery questions are flagged as redundant',()=>{
  const one='What is the budget for the engagement?';
  const repeated={discovery_question_plan:Array(5).fill(one)};
  const r=assessDiscoveryCoverage(repeated);
  assert.deepEqual(r.duplicated_indices,[2,3,4,5]);
  assert.equal(r.covered.commercial_feasibility,true);
  assert.equal(r.status,'BREADTH_REVIEW_REQUIRED');
});

test('question intent may clarify dimension, but unrelated brief narrative cannot',()=>{
  const a={discovery_question_plan:[{question:'What would this unblock?',intent:'Define the buyer decision and desired outcome'}]};
  const result=assessDiscoveryCoverage(a);
  assert.equal(result.covered.buyer_outcome,true);
  assert.equal(result.covered.commercial_feasibility,false);
  assert.equal(result.question_count,1);
});
