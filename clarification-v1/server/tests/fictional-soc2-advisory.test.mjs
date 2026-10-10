import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderFinalBrief } from '../final-brief-renderer.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-soc2-advisory-final.json', import.meta.url), 'utf8'));

test('fictional realistic SOC2 advisory case produces consultant-worthy scoped brief', () => {
  const rendered=renderFinalBrief(fixture);
  assert.equal(rendered.ok,true);
  const brief=rendered.brief_markdown;
  assert.ok(brief.length>2300, 'must have substantive diagnosis, not skeleton');
  for(const phrase of ['Harborlane Cloud','SOC 2','78/100','75/100',
    'QUALIFIED_FOR_DISCOVERY','access control','decision authority',
    'system boundary','Budget','BOOK-001','SVC_SOC2','CPA auditor',
    'fictional','customer security assessment']) {
    assert.ok(brief.toLowerCase().includes(phrase.toLowerCase()), 'missing '+phrase);
  }
  assert.equal((brief.match(/^- What /gm)||[]).length>=1,true);
  assert.doesNotMatch(brief,/failed control is established/i);
});
