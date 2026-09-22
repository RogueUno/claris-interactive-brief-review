import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileRepository } from '../repository.mjs';
import { createCalibrationService } from '../service.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    async getJson(path) { return map.has(path) ? structuredClone(map.get(path)) : null; },
    async putJson(path, value) { map.set(path, structuredClone(value)); return { pathname: path }; }
  };
}

function lifecycle(state, { persistedAt }) {
  return {
    status: state.lockedAt ? 'LOCKED' : 'IN_PROGRESS',
    persisted_at: persistedAt,
    operating_profile: { consultant: { consultant_id: state.consultantId } },
    profile_validation: { ok: true, errors: [] },
    runtime_v3: {
      status: 'READY',
      report: { errors: [], warnings: [] },
      consultant_sot_json: {}
    }
  };
}

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef';
const IDENTITY = {
  consultant_id: 'consultant_real',
  first_name: 'Ari',
  full_name: 'Ari Real',
  firm: 'RealCo',
  delivery_email: 'ari@realco.example'
};

test('approved invite seed persists on first resolution with canonical identity', async () => {
  const repo = createProfileRepository(memoryStorage());
  const service = createCalibrationService({ repository: repo, sessionSecret: SECRET, buildLifecycleRecord: lifecycle });
  const seedState = {
    consultantId: 'spoofed',
    firstName: 'Wrong',
    fullName: 'Wrong',
    firm: 'Wrong',
    services: [{ service_id: 'SVC_1', name: 'vCISO', selected: true, state: 'ACTIVE' }],
    minimumEngagement: 9000,
    currency: 'USD',
    hardDisqualifiersConfirmed: true,
    firstCallRules: ['documented fit'],
    sessionId: 'seed_1'
  };

  const { token } = await repo.createInvite(IDENTITY, { now: 1000, ttlMs: 100000, seedState });
  const resolved = await service.resolveInvite(token, { now: 2000 });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.resume_state.consultantId, 'consultant_real');
  assert.equal(resolved.resume_state.fullName, 'Ari Real');
  assert.equal(resolved.resume_state.firm, 'RealCo');
  assert.equal(resolved.identity.delivery_email, 'ari@realco.example');
  assert.equal(resolved.resume_state.services[0].name, 'vCISO');

  const loaded = await service.load(resolved.session_token, { now: 3000 });
  assert.equal(loaded.resume_state.consultantId, 'consultant_real');
  assert.equal(loaded.profile_status, 'IN_PROGRESS');
  assert.equal(loaded.identity.delivery_email, 'ari@realco.example');
});


test('delivery email validation preserves legacy invites', async () => {
  const repo = createProfileRepository(memoryStorage());

  await assert.rejects(
    () => repo.createInvite({
      consultant_id: 'consultant_email_check',
      first_name: 'Test',
      full_name: 'Test Consultant',
      firm: 'ExampleCo',
      delivery_email: 'invalid'
    }),
    /INVALID_CONSULTANT_DELIVERY_EMAIL/
  );

  const legacy = await repo.createInvite({
    consultant_id: 'consultant_legacy',
    first_name: 'Legacy',
    full_name: 'Legacy Consultant',
    firm: 'LegacyCo'
  });

  assert.equal(legacy.invite.identity.delivery_email, undefined);
});
