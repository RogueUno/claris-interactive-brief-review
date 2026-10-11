import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessCommercialBrief, isExplicitSyntheticRehearsal } from '../commercial-brief-readiness.mjs';

const load = name => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
test('fictional SOC 2 commercial brief meets all structural depth checks', () => {
 const result=assessCommercialBrief(load('fictional-soc2-advisory-final.json'));
 assert.equal(result.status,'DEPTH_CANDIDATE');
 assert.deepEqual(result.missing,[]);
});
test('synthetic October 9 rehearsal is not a commercial benchmark', () => {
 const result=assessCommercialBrief(load('oct09-finalize-actual.json'),{synthetic:true});
 assert.equal(result.status,'NOT_COMMERCIAL_BENCHMARK');
});
test('thin non-synthetic opportunity must be flagged for review', () => {
 const result=assessCommercialBrief({preliminary_brief_markdown:'A short summary',deterministic_metrics:{supported_match:50}});
 assert.equal(result.status,'REVIEW_REQUIRED');
 assert.ok(result.missing.includes('discovery'));
 assert.ok(result.missing.includes('evidence_lineage'));
});

test('synthetic exemption derives only from explicit booking evidence', () => {
 const historical=load('oct09-finalize-actual.json');
 assert.equal(isExplicitSyntheticRehearsal(historical),false);
 const trustedBookingText='Synthetic CLARIS MVP rehearsal. The company is Tailead; test research and call preparation only. Do not contact the prospect.';
 assert.equal(isExplicitSyntheticRehearsal(historical,{trustedBookingText}),true);
 const commercial=load('fictional-soc2-advisory-final.json');
 assert.equal(isExplicitSyntheticRehearsal(commercial),false);
 assert.equal(assessCommercialBrief(historical,{synthetic:isExplicitSyntheticRehearsal(historical,{trustedBookingText})}).status,'NOT_COMMERCIAL_BENCHMARK');
 assert.equal(assessCommercialBrief(commercial,{synthetic:isExplicitSyntheticRehearsal(commercial)}).status,'DEPTH_CANDIDATE');
});
test('marketing prose claiming synthetic cannot itself bypass review', () => {
 const artifact={preliminary_brief_markdown:'This says synthetic, but has no source.',deterministic_metrics:{supported_match:20}};
 assert.equal(isExplicitSyntheticRehearsal(artifact),false);
 assert.equal(assessCommercialBrief(artifact).status,'REVIEW_REQUIRED');
});
