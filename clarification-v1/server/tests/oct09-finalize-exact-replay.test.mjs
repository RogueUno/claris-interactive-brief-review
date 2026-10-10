import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderFinalBrief} from '../final-brief-renderer.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/oct09-finalize-actual.json', import.meta.url), 'utf8'));
test('exact Oct 9 FINALIZE output yields complete, bounded no-send consultant brief', () => {
  const result = renderFinalBrief(fixture);
  assert.equal(result.ok, true);
  const brief = result.brief_markdown;
  assert.ok(brief.length > 1500, 'not a skeletal brief');
  for (const required of [
    'Synthetic CLARIS MVP rehearsal',
    'Supported Match: 15/100',
    'Scorable Coverage: 30/100',
    'Evidence Completeness: 74.75/100',
    'UNQUALIFIED_SYNTHETIC',
    'Maintain rehearsal scope separation',
    'Regarding the CLARIS MVP rehearsal',
    'PARTIAL_MATCH',
    'No contact with the prospect is permitted'
  ]) assert.ok(brief.includes(required), 'missing '+required);
  assert.ok(!brief.includes('Supported Match Score:** UNKNOWN'), 'old placeholder');
  assert.ok(!brief.includes('Scorable Coverage:** UNKNOWN'), 'old placeholder');
  assert.ok(!brief.includes('Evaluated Fit Rate:** UNKNOWN'), 'old placeholder');
});
