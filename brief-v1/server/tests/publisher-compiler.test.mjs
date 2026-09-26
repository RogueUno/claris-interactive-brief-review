import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileBriefPublishRequest,
  compileBriefReadyNotification,
  compilePrivateBriefDelivery
} from '../publisher-compiler.mjs';

const prepare = {
  schema_version: 'CLARIS_PREMIUM_PREPARE_V3_6',
  executive_readout: 'Acme already publishes strong baseline controls. Resolve exact scope and desired outcome.',
  open_dimensions: [{ dimension_id: 'D1', max_questions: 1 }]
};

const discovery = {
  schema_version: 'CLARIS_DISCOVERY_INTELLIGENCE_V1_2',
  authorized_dimensions: [{ dimension_id: 'D1', authority: 'PREPARE', policy_key: null }],
  commercial_target: [],
  primary_questions: [{
    question_id: 'Q1',
    dimension_id: 'D1',
    ask: 'Which API surface is actually in scope?',
    linked_service_paths: [{ service_id: 'SVC_ADVISORY', condition: 'Guidance requested.' }],
    conditional_probes: []
  }],
  end_of_call_decision: {
    ready_for_next_step_if: ['Scope is clear.'],
    remain_in_discovery_if: ['D1 remains unresolved.'],
    disqualify_or_deprioritize_if: ['Requirement is outside available services.']
  }
};

const sot = {
  services: [
    { service_id: 'SVC_ADVISORY', name: 'Advisory vCISO', internal_notes: 'must never leave compiler' },
    { service_id: 'SVC_PENTEST', name: 'Penetration Testing' }
  ],
  commercial_rules: {
    minimum_viable_engagement_usd: 7500,
    budget_required_before_first_call: false,
    private_pricing_note: 'never publish'
  },
  discovery_style: 'profile-only'
};

test('publish request contains only certified artifacts and minimum validation context', () => {
  const result = compileBriefPublishRequest({
    consultant_id: 'consultant_123',
    company: 'Acme',
    prepare,
    discovery,
    consultant_sot: sot,
    ttl_days: 7
  });

  assert.equal(result.operation, 'brief_create');
  assert.deepEqual(result.brief_payload, { prepare, discovery });
  assert.deepEqual(result.validation_context, {
    services: [
      { service_id: 'SVC_ADVISORY', name: 'Advisory vCISO' },
      { service_id: 'SVC_PENTEST', name: 'Penetration Testing' }
    ],
    commercial_rules: { budget_required_before_first_call: false }
  });
  assert.equal(JSON.stringify(result).includes('7500'), false);
  assert.equal(JSON.stringify(result).includes('private_pricing_note'), false);
  assert.equal(JSON.stringify(result).includes('internal_notes'), false);
  assert.equal(JSON.stringify(result).includes('discovery_style'), false);
});

test('budget-required policy publishes only the boolean, never the floor', () => {
  const policySot = structuredClone(sot);
  policySot.commercial_rules.budget_required_before_first_call = true;
  const result = compileBriefPublishRequest({
    consultant_id: 'consultant_123',
    company: 'Acme',
    prepare,
    discovery,
    consultant_sot: policySot
  });
  assert.equal(result.validation_context.commercial_rules.budget_required_before_first_call, true);
  assert.equal(JSON.stringify(result).includes('7500'), false);
});

test('notification is compiled only after a successful publish result', () => {
  const result = compileBriefReadyNotification({
    publish_result: {
      ok: true,
      brief_id: 'brief_abc12345',
      brief_url: 'https://preview.example/brief-v1/#brief=opaque-token',
      expires_at: '2026-10-03T10:00:00.000Z'
    },
    prepare,
    discovery,
    consultant_delivery_email: 'consultant@example.com',
    consultant_first_name: 'Chase',
    company: 'Acme',
    prospect_name: 'Alex',
    opportunity_id: 'opp_123',
    meeting_time: '2026-09-27T10:00:00Z'
  });

  assert.equal(result.operation, 'CONSULTANT_BRIEF_READY');
  assert.equal(result.brief_id, 'brief_abc12345');
  assert.equal(result.priority_questions.length, 1);
  assert.equal(result.priority_questions[0], 'Which API surface is actually in scope?');
  assert.equal('brief_payload' in result, false);
  assert.equal('validation_context' in result, false);
});

test('compiler fails closed on uncertified schemas or failed publish', () => {
  assert.throws(() => compileBriefPublishRequest({
    consultant_id: 'consultant_123',
    company: 'Acme',
    prepare: { ...prepare, schema_version: 'OLD' },
    discovery,
    consultant_sot: sot
  }), /PREPARE_V3_6_REQUIRED/);

  assert.throws(() => compileBriefReadyNotification({
    publish_result: { ok: false },
    prepare,
    discovery,
    consultant_delivery_email: 'consultant@example.com',
    company: 'Acme'
  }), /PUBLISH_RESULT_REQUIRED/);
});

test('two-phase delivery compiler never fabricates publish output', () => {
  const result = compilePrivateBriefDelivery({
    consultant_id: 'consultant_123',
    company: 'Acme',
    prepare,
    discovery,
    consultant_sot: sot
  });
  assert.equal(result.publish.operation, 'brief_create');
  assert.deepEqual(result.notification_after_publish.required_publish_fields, ['ok', 'brief_id', 'brief_url', 'expires_at']);
});
