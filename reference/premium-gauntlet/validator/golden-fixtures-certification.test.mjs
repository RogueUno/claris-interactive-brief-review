import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePremiumPrepareV36 } from './premium-prepare-validator-v36.mjs';
import { validateDiscoveryV12 } from './discovery-validator-v12.mjs';
import { compileBriefPublishReady } from '../../../brief-v1/server/publication-contract.mjs';
import { compileDiscoveryPlanSkeleton } from './discovery-plan-skeleton-compiler.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../contracts/discovery-intents-v1.json', import.meta.url), 'utf8'));

const cases = [
  {
    name: 'Resend',
    dir: '../fixtures/resend-v3/',
    domainHost: 'resend.com',
    expectedDimensions: 2,
    expectedQuestions: 2
  },
  {
    name: 'Linear',
    dir: '../fixtures/linear-v1/',
    domainHost: 'linear.app',
    expectedDimensions: 2,
    expectedQuestions: 2
  },
  {
    name: 'Supabase',
    dir: '../fixtures/supabase-v1/',
    domainHost: 'supabase.com',
    expectedDimensions: 3,
    expectedQuestions: 3
  }
];

function loadJson(base, file) {
  return JSON.parse(fs.readFileSync(new URL(file, base), 'utf8'));
}

for (const fixture of cases) {
  test(`${fixture.name} golden fixture clears Premium + Discovery + publish-ready gates`, () => {
    const base = new URL(fixture.dir, import.meta.url);
    const booking = fs.readFileSync(new URL('booking.txt', base), 'utf8').trim();
    const sot = loadJson(base, 'consultant-sot.json');
    const prepare = loadJson(base, 'premium-prepare.json');
    const discovery = loadJson(base, 'discovery-plan.json');
    const allowedServiceIds = sot.services.map((service) => service.service_id);

    const premium = validatePremiumPrepareV36(prepare, {
      bookingText: booking,
      companyDomainHost: fixture.domainHost,
      allowedServiceIds,
      allowedPolicyKeys: []
    });
    assert.equal(premium.ok, true, `${fixture.name} Premium failed: ${JSON.stringify(premium.errors)}`);

    const diagnostic = validateDiscoveryV12(discovery, prepare, sot);
    assert.equal(diagnostic.ok, true, `${fixture.name} Discovery failed: ${JSON.stringify(diagnostic.errors)}`);

    assert.equal(prepare.open_dimensions.length, fixture.expectedDimensions);
    assert.equal(discovery.primary_questions.length, fixture.expectedQuestions);

    const skeleton = compileDiscoveryPlanSkeleton(prepare, sot, catalog);
    assert.equal(skeleton.ok, true, `${fixture.name} Skeleton failed: ${JSON.stringify(skeleton.errors)}`);
    assert.equal(skeleton.ontology_coverage.length, 15);
    assert.equal(skeleton.coverage_summary.catalog_intent_count, 15);
    assert.equal(skeleton.coverage_summary.primary_authorized_count, fixture.expectedDimensions);
    assert.equal(skeleton.coverage_summary.deferred_not_authorized_count, 15 - fixture.expectedDimensions);
    assert.equal(skeleton.coverage_summary.unaccounted_count, 0);
    assert.equal(new Set(skeleton.ontology_coverage.map((item) => item.intent_id)).size, 15);

    const compiled = compileBriefPublishReady({
      opportunity_id: `gold_${fixture.name.toLowerCase()}`,
      consultant_id: `consultant_${fixture.name.toLowerCase()}`,
      consultant_delivery_email: 'pilot@example.com',
      consultant_first_name: 'Pilot',
      company: fixture.name,
      prospect_name: 'Fixture Prospect',
      meeting_time: '2026-09-30T14:00:00Z',
      prepare,
      discovery,
      consultant_sot: sot,
      ttl_days: 7
    });

    assert.equal(compiled.operation, 'brief_publish_ready');
    assert.equal(compiled.body.brief_payload.prepare.schema_version, 'CLARIS_PREMIUM_PREPARE_V3_6');
    assert.equal(compiled.body.brief_payload.discovery.schema_version, 'CLARIS_DISCOVERY_INTELLIGENCE_V1_2');
    assert.equal(compiled.body.validation_context.services.length, sot.services.length);
    assert.equal(
      compiled.body.validation_context.commercial_rules.budget_required_before_first_call,
      sot.commercial_rules?.budget_required_before_first_call === true
    );

    const serialized = JSON.stringify(compiled);
    assert.doesNotMatch(serialized, /minimum_viable_engagement_usd/);
    assert.doesNotMatch(serialized, /budget_rule/);
    assert.doesNotMatch(serialized, /internal_margin/);
    assert.doesNotMatch(serialized, /private_notes/);
  });
}

test('golden suite preserves materially different diagnostic shapes', () => {
  const loaded = cases.map((fixture) => {
    const base = new URL(fixture.dir, import.meta.url);
    const discovery = loadJson(base, 'discovery-plan.json');
    return {
      name: fixture.name,
      intents: discovery.authorized_dimensions.map((item) => item.ontology_intent),
      questions: discovery.primary_questions.map((item) => item.ask)
    };
  });

  assert.deepEqual(loaded.find((item) => item.name === 'Resend').intents, [
    'D02 technical_or_service_scope',
    'D06 desired_outcome'
  ]);
  assert.deepEqual(loaded.find((item) => item.name === 'Linear').intents, [
    'D04 problem_or_gap',
    'D06 desired_outcome'
  ]);
  assert.deepEqual(loaded.find((item) => item.name === 'Supabase').intents, [
    'D02 technical_or_service_scope',
    'D06 desired_outcome',
    'D11 timing_trigger'
  ]);

  const allQuestions = loaded.flatMap((item) => item.questions.map((question) => `${item.name}:${question}`));
  assert.equal(new Set(allQuestions).size, allQuestions.length);
});
