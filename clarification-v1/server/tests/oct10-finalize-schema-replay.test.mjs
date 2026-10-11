import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeFinalArtifact, renderFinalBrief } from '../final-brief-renderer.mjs';
import { assessCommercialBrief, isExplicitSyntheticRehearsal } from '../commercial-brief-readiness.mjs';

const actual = JSON.parse(readFileSync(new URL('./fixtures/oct10-finalize-live-actual.json', import.meta.url), 'utf8'));
const trustedBooking = 'Synthetic CLARIS MVP rehearsal. The company is Tailead; test research and call preparation only. Do not contact the prospect.';

test('exact live Oct10 schema preserves existing strategic decisions and evidence without inventing scope', () => {
  const normalized = normalizeFinalArtifact(actual);
  assert.equal(normalized.qualification_status, 'SYNTHETIC_REHEARSAL_ONLY');
  assert.equal(normalized.recommended_action, 'Execute synthetic rehearsal scope only.');
  assert.equal(normalized.talking_points.length, 3);
  assert.equal(normalized.risk_factors.length, 2);
  assert.ok(Object.keys(normalized.match_classifications).length >= 5);
  assert.equal(normalized.remaining_unknowns.length, 2);
  assert.equal(normalized.consultant_only_context.hypotheses.length, 1);
  assert.equal(normalized.consultant_only_context.hypotheses[0].status, 'UNVERIFIED');
  assert.equal(normalized.discovery_questions.length, 1);
  assert.equal(normalized.primary_service_id, null); // Do not elevate reported SOC 2 to a sale
  const result = renderFinalBrief(actual);
  const brief = result.brief_markdown;
  assert.ok(brief.length > 1651, 'must restore content missing in the historical renderer');
  for (const fragment of ['SYNTHETIC_REHEARSAL_ONLY', 'Execute synthetic rehearsal scope only.',
    'Scope expansion', 'BOOK-001', 'Prospect-reported SOC 2 Readiness interest',
    '## Evidence-Based Fit', '## Key Talking Points', '## Risk Factors',
    '## Remaining Unknowns', '## Consultant-Only Context', 'UNVERIFIED']) {
    assert.ok(brief.toLowerCase().includes(fragment.toLowerCase()), 'missing: ' + fragment);
  }
  assert.match(brief, /Primary service: Not explicitly classified/);
  assert.doesNotMatch(brief, /Primary service: SVC_SOC2/);
});

test('commercial-quality diagnostic reports actual live deficits but does not override rehearsal', () => {
  assert.equal(isExplicitSyntheticRehearsal(actual), false, 'AI output cannot self-certify rehearsal');
  assert.equal(isExplicitSyntheticRehearsal(actual,{trustedBookingText:trustedBooking}), true);
  const reviewed = assessCommercialBrief(actual);
  assert.equal(reviewed.status, 'REVIEW_REQUIRED');
  assert.ok(reviewed.missing.includes('discovery'));
  assert.ok(reviewed.missing.includes('service'));
  assert.equal(reviewed.checks.talking_points, true);
  assert.equal(reviewed.checks.risk_or_unknown, true);
  assert.equal(reviewed.checks.evidence_fit, true);
  const rehearsal = assessCommercialBrief(actual,{synthetic:true});
  assert.equal(rehearsal.status, 'NOT_COMMERCIAL_BENCHMARK');
  assert.deepEqual(rehearsal.missing, reviewed.missing);
});
