import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessCommercialBrief } from '../commercial-brief-readiness.mjs';

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
