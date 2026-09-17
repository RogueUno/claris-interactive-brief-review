import assert from 'node:assert/strict';
import { buildOperatingProfileV1, validateOperatingProfileV1 } from '../operating-profile-v1.mjs';
import { compileConsultantRuntimeSotV3 } from '../compile-runtime-sot-v3.mjs';

function snapshot(overrides = {}) {
  const base = {
    consultant: {
      consultantId: 'consultant_prototype_sarah',
      firstName: 'Sarah',
      fullName: 'Sarah Jenkins',
      firm: 'SecureAdvisory'
    },
    practice: {
      services: [
        { service_id: 'SVC_API_AUDIT', name: 'API Security Auditing', selected: true, state: 'ACTIVE', preference: 'LEAD_WITH' },
        { service_id: 'SVC_SOC2', name: 'SOC 2 Readiness', selected: true, state: 'SELECTIVE', preference: 'SELECTIVE' },
        { service_id: 'SVC_VCISO', name: 'Fractional vCISO', selected: true, state: 'PAUSED', preference: 'ONLY_IF_REQUESTED' }
      ],
      leadServiceId: 'SVC_API_AUDIT',
      pausedPolicies: { SVC_VCISO: 'EXPLICIT_ONLY' }
    },
    opportunity: {
      companyTypes: ['B2B SaaS', 'Software'],
      buyerRoles: ['CISO / Security lead'],
      companyStage: 'Growth / scale-up',
      geographyMatters: false,
      geographies: []
    },
    commercial: {
      minimumEngagement: 7500,
      currency: 'USD',
      engagementModels: ['Fixed-scope project'],
      budgetRequired: false,
      hardDisqualifiers: ['Pure price-shopping / commodity RFP'],
      hardDisqualifiersConfirmed: true,
      cautionSignals: ['Very early / exploratory only']
    },
    judgment: {
      firstCallRules: [
        'documented service/problem alignment',
        'not affirmatively disqualified',
        'a real reason to act, not just curiosity'
      ],
      positiveSignals: ['Enterprise or customer pressure'],
      vanitySignals: ['Funding announcement by itself']
    },
    strategy: {
      discoveryStyle: 'Diagnostic first',
      briefDensity: 'Balanced — key evidence + implications',
      preferredNextMove: 'Define the next diagnostic step',
      proofPoints: ['Relevant case study'],
      avoidPush: ['Pricing too early']
    },
    exceptions: ['Warm referral with credible need'],
    lockedAt: '2026-09-17T12:00:00.000Z'
  };
  return structuredClone(Object.assign(base, overrides));
}

{
  const profile = buildOperatingProfileV1(snapshot());
  const validation = validateOperatingProfileV1(profile);
  assert.equal(validation.ok, true, validation.errors.join(', '));

  const result = compileConsultantRuntimeSotV3(profile);
  assert.equal(result.ok, true, result.report.errors.join(', '));
  assert.deepEqual(result.runtime_sot.services, [
    { service_id: 'SVC_API_AUDIT', name: 'API Security Auditing' },
    { service_id: 'SVC_SOC2', name: 'SOC 2 Readiness' }
  ]);
  assert.deepEqual(result.runtime_sot.qualification_rules.required_for_first_call, [
    'documented service/problem alignment',
    'not affirmatively disqualified'
  ]);
  assert.equal(result.runtime_sot.commercial_rules.minimum_viable_engagement_usd, 7500);
  assert.equal(result.runtime_sot.ideal_client_profile.unknown_is_acceptable, true);
  assert.equal(result.runtime_sot.qualification_rules.unknown_is_not_negative, true);
  assert.equal(result.runtime_sot.evidence_policy.non_observation_rule, 'UNKNOWN, never absence');

  const serialized = JSON.stringify(result.runtime_sot);
  assert.equal(serialized.includes('Diagnostic first'), false);
  assert.equal(serialized.includes('Warm referral with credible need'), false);
  assert.equal(serialized.includes('Pure price-shopping / commodity RFP'), false);
  assert.equal(serialized.includes('Fractional vCISO'), false);
}

{
  const eur = snapshot();
  eur.commercial.currency = 'EUR';
  const result = compileConsultantRuntimeSotV3(buildOperatingProfileV1(eur));
  assert.equal(result.ok, false);
  assert.equal(result.runtime_sot, null);
  assert(result.report.errors.includes('UNSUPPORTED_RUNTIME_CURRENCY:EUR'));
}

{
  const unsupported = snapshot();
  unsupported.judgment.firstCallRules = ['a real reason to act, not just curiosity'];
  const result = compileConsultantRuntimeSotV3(buildOperatingProfileV1(unsupported));
  assert.equal(result.ok, false);
  assert(result.report.errors.includes('NO_RUNTIME_COMPATIBLE_QUALIFICATION_RULE'));
}

{
  const profile = buildOperatingProfileV1(snapshot());
  profile.match_score = { weights: { service_need_alignment: 999 } };
  const validation = validateOperatingProfileV1(profile);
  assert.equal(validation.ok, false);
  assert(validation.errors.includes('UNEXPECTED_FIELD:$.match_score'));
  const result = compileConsultantRuntimeSotV3(profile);
  assert.equal(result.ok, false);
  assert.equal(result.runtime_sot, null);
}

{
  const incomplete = snapshot();
  incomplete.commercial.hardDisqualifiersConfirmed = false;
  const result = compileConsultantRuntimeSotV3(buildOperatingProfileV1(incomplete));
  assert.equal(result.ok, false);
  assert(result.report.errors.includes('HARD_DISQUALIFIERS_NOT_CONFIRMED'));
}

console.log('CLARIS Runtime V3 adapter tests: PASS');
