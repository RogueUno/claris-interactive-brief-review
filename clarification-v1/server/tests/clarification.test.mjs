import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClarificationPackage, publicClarificationPackage } from '../contract.mjs';
import { createClarificationRepository } from '../repository.mjs';
import { createClarificationService } from '../service.mjs';
import { buildClarificationResult } from '../result.mjs';

function memoryStorage() {
  const map = new Map();
  let version = 0;
  return {
    map,
    async getJson(path) {
      return map.has(path) ? structuredClone(map.get(path).value) : null;
    },
    async getJsonWithMeta(path) {
      if (!map.has(path)) return { value: null, etag: null };
      const item = map.get(path);
      return { value: structuredClone(item.value), etag: item.etag };
    },
    async putJson(path, value, { ifMatch = null } = {}) {
      const current = map.get(path);
      if (ifMatch && current?.etag !== ifMatch) {
        const error = new Error('BLOB_PRECONDITION_FAILED');
        error.code = 'BLOB_PRECONDITION_FAILED';
        throw error;
      }
      const etag = `etag-${++version}`;
      map.set(path, { value: structuredClone(value), etag });
      return { etag };
    }
  };
}

function basePackage(overrides = {}) {
  return {
    opportunity_id: 'opp_acme_001',
    consultant: {
      consultant_id: 'consultant_sarah',
      first_name: 'Sarah',
      firm: 'Northstar Security'
    },
    prospect: {
      first_name: 'Alex',
      role: 'VP Engineering',
      company: 'Acme'
    },
    intro_context: 'A few public signals need clarification.',
    questions: [
      {
        question_id: 'q_priority',
        mode: 'CONFIRM',
        prompt: 'Is SOC 2 still the immediate priority?',
        display_context: 'Acme currently presents SOC 2 publicly.',
        response_type: 'SINGLE_CHOICE',
        options: ['Yes', 'No', 'Not decided'],
        required: true,
        evidence_refs: [{ source_type: 'PUBLIC_WEB', subject: 'COMPANY', ref: 'https://acme.example/security' }]
      }
    ],
    ...overrides
  };
}

function serviceFixture() {
  const storage = memoryStorage();
  const repository = createClarificationRepository(storage);
  const service = createClarificationService({
    repository,
    sessionSecret: 'claris-test-secret-that-is-definitely-long-enough'
  });
  return { storage, repository, service };
}

test('CONFIRM and CONTRAST require evidence while DISCOVER can be evidence-free', () => {
  assert.throws(() => normalizeClarificationPackage({
    ...basePackage(),
    questions: [{ ...basePackage().questions[0], evidence_refs: [] }]
  }), /EVIDENCE_REQUIRED/);

  const discover = normalizeClarificationPackage({
    ...basePackage(),
    questions: [{
      question_id: 'q_trigger',
      mode: 'DISCOVER',
      prompt: 'What made this conversation worth having now?',
      response_type: 'LONG_TEXT',
      required: true
    }]
  });
  assert.equal(discover.questions[0].evidence_refs.length, 0);
});

test('prospect-safe package strips internal evidence references', () => {
  const pkg = normalizeClarificationPackage(basePackage());
  const safe = publicClarificationPackage(pkg);
  assert.equal(safe.questions[0].prompt, pkg.questions[0].prompt);
  assert.equal('evidence_refs' in safe.questions[0], false);
});

test('zero-question package creates no prospect invite', async () => {
  const { repository, service } = serviceFixture();
  const created = await service.createPackage(basePackage({ opportunity_id: 'opp_zero_001', questions: [] }), {
    now: 1_000_000,
    ttlMs: 60_000
  });
  assert.equal(created.requires_clarification, false);
  assert.equal(created.status, 'NO_CLARIFICATION');
  assert.equal(created.invite_token, null);

  const loaded = await repository.loadEnvelopeWithMeta('opp_zero_001');
  const result = buildClarificationResult(loaded.envelope, loaded.etag);
  assert.equal(result.ok, true);
  assert.equal(result.clarification_result.required, false);
  assert.deepEqual(result.clarification_result.answers, []);
});

test('raw invite token is never persisted', async () => {
  const { storage, service } = serviceFixture();
  const created = await service.createPackage(basePackage(), { now: 2_000_000, ttlMs: 60_000 });
  assert.ok(created.invite_token);
  const serialized = JSON.stringify([...storage.map.values()].map((item) => item.value));
  assert.equal(serialized.includes(created.invite_token), false);
});

test('invite resolution exposes safe dynamic content but not evidence refs', async () => {
  const { service } = serviceFixture();
  const created = await service.createPackage(basePackage(), { now: 3_000_000, ttlMs: 60_000 });
  const resolved = await service.resolveInvite(created.invite_token, { now: 3_001_000 });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.clarification.prospect.company, 'Acme');
  assert.equal(resolved.clarification.prospect.role, 'VP Engineering');
  assert.equal(resolved.clarification.questions[0].mode, 'CONFIRM');
  assert.equal('evidence_refs' in resolved.clarification.questions[0], false);
  assert.ok(resolved.session_token);
});

test('valid submission is immutable and exported as PROSPECT_REPORTED beside evidence', async () => {
  const { repository, service } = serviceFixture();
  const created = await service.createPackage(basePackage(), { now: 4_000_000, ttlMs: 60_000 });
  const resolved = await service.resolveInvite(created.invite_token, { now: 4_001_000 });

  const submitted = await service.submit(
    resolved.session_token,
    [{ question_id: 'q_priority', value: 'Yes' }],
    { now: 4_002_000, expectedVersion: resolved.opportunity_version }
  );
  assert.equal(submitted.ok, true);
  assert.equal(submitted.status, 'SUBMITTED');

  const second = await service.submit(
    resolved.session_token,
    [{ question_id: 'q_priority', value: 'No' }],
    { now: 4_003_000 }
  );
  assert.equal(second.ok, false);
  assert.equal(second.error, 'CLARIFICATION_ALREADY_SUBMITTED');

  const loaded = await repository.loadEnvelopeWithMeta('opp_acme_001');
  const result = buildClarificationResult(loaded.envelope, loaded.etag);
  assert.equal(result.ok, true);
  assert.equal(result.clarification_result.source_class, 'PROSPECT_REPORTED');
  assert.equal(result.clarification_result.answers[0].value, 'Yes');
  assert.equal(result.clarification_result.answers[0].evidence_refs[0].source_type, 'PUBLIC_WEB');
  assert.equal(result.clarification_result.answers[0].evidence_refs[0].subject, 'COMPANY');
});

test('stale opportunity version fails closed', async () => {
  const { service } = serviceFixture();
  const created = await service.createPackage(basePackage(), { now: 5_000_000, ttlMs: 60_000 });
  const resolved = await service.resolveInvite(created.invite_token, { now: 5_001_000 });
  const result = await service.submit(
    resolved.session_token,
    [{ question_id: 'q_priority', value: 'Yes' }],
    { now: 5_002_000, expectedVersion: 'stale-etag' }
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'CLARIFICATION_CONFLICT');
});

test('required answer validation rejects incomplete submissions', async () => {
  const { service } = serviceFixture();
  const created = await service.createPackage(basePackage(), { now: 6_000_000, ttlMs: 60_000 });
  const resolved = await service.resolveInvite(created.invite_token, { now: 6_001_000 });
  const result = await service.submit(resolved.session_token, [], {
    now: 6_002_000,
    expectedVersion: resolved.opportunity_version
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'ANSWER_REQUIRED:q_priority');
});

test('choice answers cannot invent an option', async () => {
  const { service } = serviceFixture();
  const created = await service.createPackage(basePackage(), { now: 7_000_000, ttlMs: 60_000 });
  const resolved = await service.resolveInvite(created.invite_token, { now: 7_001_000 });
  const result = await service.submit(
    resolved.session_token,
    [{ question_id: 'q_priority', value: 'Definitely' }],
    { now: 7_002_000, expectedVersion: resolved.opportunity_version }
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'ANSWER_OPTION_INVALID:q_priority');
});

test('reissue rotates the invite without persisting the new raw token', async () => {
  const { storage, service } = serviceFixture();
  const created = await service.createPackage(basePackage(), { now: 7_500_000, ttlMs: 60_000 });
  const firstToken = created.invite_token;

  const reissued = await service.reissueInvite('opp_acme_001', { now: 7_510_000, ttlMs: 120_000 });
  assert.equal(reissued.ok, true);
  assert.ok(reissued.invite_token);
  assert.notEqual(reissued.invite_token, firstToken);

  const firstResolve = await service.resolveInvite(firstToken, { now: 7_511_000 });
  assert.equal(firstResolve.ok, false);
  assert.equal(firstResolve.error, 'INVITE_NOT_ACTIVE');

  const secondResolve = await service.resolveInvite(reissued.invite_token, { now: 7_511_000 });
  assert.equal(secondResolve.ok, true);

  const serialized = JSON.stringify([...storage.map.values()].map((item) => item.value));
  assert.equal(serialized.includes(reissued.invite_token), false);
});

test('submitted opportunity cannot receive a new clarification invite', async () => {
  const { service } = serviceFixture();
  const created = await service.createPackage(basePackage(), { now: 7_700_000, ttlMs: 60_000 });
  const resolved = await service.resolveInvite(created.invite_token, { now: 7_701_000 });
  const submitted = await service.submit(
    resolved.session_token,
    [{ question_id: 'q_priority', value: 'Yes' }],
    { now: 7_702_000, expectedVersion: resolved.opportunity_version }
  );
  assert.equal(submitted.ok, true);

  const reissued = await service.reissueInvite('opp_acme_001', { now: 7_703_000, ttlMs: 60_000 });
  assert.equal(reissued.ok, false);
  assert.equal(reissued.error, 'CLARIFICATION_ALREADY_SUBMITTED');
});

test('tampered prospect session cannot load opportunity data', async () => {
  const { service } = serviceFixture();
  const created = await service.createPackage(basePackage(), { now: 8_000_000, ttlMs: 60_000 });
  const resolved = await service.resolveInvite(created.invite_token, { now: 8_001_000 });
  const last = resolved.session_token.slice(-1);
  const tampered = `${resolved.session_token.slice(0, -1)}${last === 'x' ? 'y' : 'x'}`;
  const result = await service.load(tampered, { now: 8_002_000 });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'SESSION_TOKEN_INVALID_SIGNATURE');
});
