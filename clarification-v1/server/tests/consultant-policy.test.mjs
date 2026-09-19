import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consultantPolicyAuditView,
  normalizeClarificationConsultantPolicy
} from '../consultant-policy.mjs';

function runtimeSot(overrides = {}) {
  return {
    sot_version: 'AGENTIC_TEST_1',
    consultant: {
      consultant_name: 'Jordan Vale',
      firm: 'Priority Stack Advisory'
    },
    services: [
      { service_id: 'SVC_API_AUDIT', name: 'API Security Auditing' },
      { service_id: 'SVC_SOC2', name: 'SOC 2 readiness/advisory' }
    ],
    ideal_client_profile: {
      preferred_company_types: ['B2B technology', 'SaaS'],
      unknown_is_acceptable: true
    },
    commercial_rules: {
      minimum_viable_engagement_usd: 5000,
      budget_required_before_first_call: false,
      budget_rule: 'Direct evidence only; never infer budget.'
    },
    qualification_rules: {
      required_for_first_call: [
        'documented service/problem alignment',
        'not affirmatively disqualified'
      ],
      unknown_is_not_negative: true
    },
    ...overrides
  };
}

test('normalizes current Runtime V3 / Make SOT fields into clarification policy', () => {
  const policy = normalizeClarificationConsultantPolicy(JSON.stringify(runtimeSot()));
  assert.equal(policy.schema_version, 'claris_clarification_consultant_policy_v1');
  assert.equal(policy.source_class, 'CONSULTANT_POLICY');
  assert.equal(policy.sot_version, 'AGENTIC_TEST_1');
  assert.equal(policy.services.length, 2);
  assert.equal(policy.commercial_rules.minimum_viable_engagement_usd, 5000);
  assert.equal(policy.commercial_rules.budget_required_before_first_call, false);
  assert.deepEqual(policy.qualification_rules.required_for_first_call, [
    'documented service/problem alignment',
    'not affirmatively disqualified'
  ]);
});

test('budget-before-call policy remains consultant-governed', () => {
  const value = runtimeSot();
  value.commercial_rules.budget_required_before_first_call = true;
  const policy = normalizeClarificationConsultantPolicy(value);
  assert.equal(policy.commercial_rules.budget_required_before_first_call, true);
});

test('fails closed when required first-call policy is missing', () => {
  const value = runtimeSot();
  value.qualification_rules.required_for_first_call = [];
  assert.throws(
    () => normalizeClarificationConsultantPolicy(value),
    /CONSULTANT_SOT_FIRST_CALL_RULE_REQUIRED/
  );
});

test('fails closed when critical boolean runtime rules are absent', () => {
  const value = runtimeSot();
  delete value.commercial_rules.budget_required_before_first_call;
  assert.throws(
    () => normalizeClarificationConsultantPolicy(value),
    /CONSULTANT_SOT_BUDGET_BEFORE_CALL_BOOLEAN_REQUIRED/
  );
});

test('audit view excludes service catalog and descriptive policy text', () => {
  const policy = normalizeClarificationConsultantPolicy(runtimeSot());
  const audit = consultantPolicyAuditView(policy);
  assert.equal('services' in audit, false);
  assert.equal('budget_rule' in audit.commercial_rules, false);
  assert.equal(audit.source_class, 'CONSULTANT_POLICY');
});
