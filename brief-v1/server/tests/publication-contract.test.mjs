import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  compileBriefPublication,
  compileBriefPublishReady,
  compileBriefReadyNotification
} from '../publication-contract.mjs';

const prepare = {
  schema_version: 'CLARIS_PREMIUM_PREPARE_V3_6',
  executive_readout: 'Acme already publishes the baseline. Resolve exact API scope and desired outcome.',
  open_dimensions: [{ dimension_id: 'D1', max_questions: 1 }]
};

const discovery = {
  schema_version: 'CLARIS_DISCOVERY_INTELLIGENCE_V1_2',
  authorized_dimensions: [{ dimension_id: 'D1', authority: 'PREPARE', policy_key: null }],
  commercial_target: [],
  primary_questions: [
    { ask: 'Which API surface is actually in scope?' },
    { ask: 'What outcome do you need from external help?' },
    { ask: 'Third useful question.' },
    { ask: 'Fourth question must not be emailed.' }
  ]
};

const sot = {
  services: [
    { service_id: 'SVC_ADVISORY', name: 'Advisory vCISO', internal_margin: 0.8 },
    { service_id: 'SVC_PENTEST', name: 'Penetration Testing', notes: 'private' }
  ],
  commercial_rules: {
    minimum_viable_engagement_usd: 3000,
    budget_required_before_first_call: false,
    budget_rule: 'Internal policy text'
  },
  private_notes: 'must not cross delivery boundary'
};

test('publication compiler sends only delivery-required consultant policy', () => {
  const result = compileBriefPublication({
    consultant_id: 'consultant_test_1',
    company: 'Acme',
    prepare,
    discovery,
    consultant_sot: sot,
    ttl_days: 8
  });

  assert.equal(result.operation, 'brief_create');
  assert.equal(result.body.company, 'Acme');
  assert.equal(result.body.ttl_days, 8);
  assert.deepEqual(result.body.validation_context.services, [
    { service_id: 'SVC_ADVISORY', name: 'Advisory vCISO' },
    { service_id: 'SVC_PENTEST', name: 'Penetration Testing' }
  ]);
  assert.deepEqual(result.body.validation_context.commercial_rules, {
    budget_required_before_first_call: false
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /minimum_viable_engagement/);
  assert.doesNotMatch(serialized, /private_notes/);
  assert.doesNotMatch(serialized, /internal_margin/);
  assert.doesNotMatch(serialized, /budget_rule/);
});


test('publish-ready compiler emits one minimized atomic gateway request', () => {
  const result = compileBriefPublishReady({
    opportunity_id: 'opp_1',
    consultant_id: 'consultant_test_1',
    consultant_delivery_email: 'sarah@example.com',
    consultant_first_name: 'Sarah',
    company: 'Acme',
    prospect_name: 'Alex Morgan',
    meeting_time: '2026-09-30T14:00:00Z',
    prepare,
    discovery,
    consultant_sot: sot,
    ttl_days: 9
  });

  assert.equal(result.operation, 'brief_publish_ready');
  assert.equal(result.body.consultant_id, 'consultant_test_1');
  assert.equal(result.body.consultant_delivery_email, 'sarah@example.com');
  assert.equal(result.body.ttl_days, 9);
  assert.equal(result.body.brief_payload.prepare.schema_version, 'CLARIS_PREMIUM_PREPARE_V3_6');
  assert.equal(result.body.brief_payload.discovery.schema_version, 'CLARIS_DISCOVERY_INTELLIGENCE_V1_2');
  assert.deepEqual(result.body.validation_context.services, [
    { service_id: 'SVC_ADVISORY', name: 'Advisory vCISO' },
    { service_id: 'SVC_PENTEST', name: 'Penetration Testing' }
  ]);
  assert.deepEqual(result.body.validation_context.commercial_rules, {
    budget_required_before_first_call: false
  });

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /minimum_viable_engagement/);
  assert.doesNotMatch(serialized, /private_notes/);
  assert.doesNotMatch(serialized, /internal_margin/);
  assert.doesNotMatch(serialized, /budget_rule/);
});


test('Supabase gold fixture compiles through atomic publish-ready contract', () => {
  const fixture = new URL('../../../reference/premium-gauntlet/fixtures/supabase-v1/', import.meta.url);
  const goldPrepare = JSON.parse(fs.readFileSync(new URL('premium-prepare.json', fixture), 'utf8'));
  const goldDiscovery = JSON.parse(fs.readFileSync(new URL('discovery-plan.json', fixture), 'utf8'));
  const goldSot = JSON.parse(fs.readFileSync(new URL('consultant-sot.json', fixture), 'utf8'));

  const result = compileBriefPublishReady({
    opportunity_id: 'premium_gauntlet_supabase_v1',
    consultant_id: 'consultant_supabase_fixture',
    consultant_delivery_email: 'consultant@example.com',
    consultant_first_name: 'Chase',
    company: 'Supabase',
    prospect_name: 'VP Engineering',
    meeting_time: '2026-09-30T14:00:00Z',
    prepare: goldPrepare,
    discovery: goldDiscovery,
    consultant_sot: goldSot,
    ttl_days: 7
  });

  assert.equal(result.operation, 'brief_publish_ready');
  assert.equal(result.body.brief_payload.prepare.open_dimensions.length, 3);
  assert.equal(result.body.brief_payload.discovery.primary_questions.length, 3);
  assert.equal(result.body.validation_context.services.length, 3);
  assert.equal(result.body.validation_context.commercial_rules.budget_required_before_first_call, false);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /minimum_viable_engagement_usd/);
  assert.doesNotMatch(serialized, /budget_rule/);
  assert.doesNotMatch(serialized, /3000/);
});

test('notification compiler binds published URL to compact consultant email package', () => {
  const result = compileBriefReadyNotification({
    opportunity_id: 'opp_1',
    consultant_delivery_email: 'sarah@example.com',
    consultant_first_name: 'Sarah',
    company: 'Acme',
    prospect_name: 'Alex Morgan',
    meeting_time: '2026-09-30T14:00:00Z',
    prepare,
    discovery,
    published: {
      brief_id: 'brief_123',
      brief_url: 'https://preview.example/brief-v1/#brief=opaque',
      expires_at: '2026-10-07T14:00:00.000Z'
    }
  });

  assert.equal(result.operation, 'CONSULTANT_BRIEF_READY');
  assert.equal(result.body.brief_id, 'brief_123');
  assert.equal(result.body.brief_url, 'https://preview.example/brief-v1/#brief=opaque');
  assert.deepEqual(result.body.priority_questions, [
    'Which API surface is actually in scope?',
    'What outcome do you need from external help?',
    'Third useful question.'
  ]);
  assert.equal(result.body.executive_readout, prepare.executive_readout);
});

test('publication compiler fails closed on uncertified schemas', () => {
  assert.throws(() => compileBriefPublication({
    consultant_id: 'consultant_test_1',
    company: 'Acme',
    prepare: { ...prepare, schema_version: 'OLD' },
    discovery,
    consultant_sot: sot
  }), /PREPARE_V3_6_REQUIRED/);
});

test('notification compiler refuses insecure or missing published URLs', () => {
  assert.throws(() => compileBriefReadyNotification({
    consultant_delivery_email: 'sarah@example.com',
    company: 'Acme',
    prepare,
    discovery,
    published: { brief_url: 'http://example.com/brief' }
  }), /PUBLISHED_BRIEF_URL_INVALID/);
});


test('publish-ready compiler requires opportunity id for deterministic publication identity', () => {
  assert.throws(() => compileBriefPublishReady({
    consultant_id: 'consultant_test_1',
    consultant_delivery_email: 'sarah@example.com',
    company: 'Acme',
    prepare,
    discovery,
    consultant_sot: sot
  }), /OPPORTUNITY_ID_REQUIRED/);
});
