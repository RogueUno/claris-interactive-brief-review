import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileRepository } from '../repository.mjs';
import { createCalibrationService } from '../service.mjs';
import { verifySession } from '../crypto.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    map,
    async getJson(path) { return map.has(path) ? structuredClone(map.get(path)) : null; },
    async putJson(path, value) { map.set(path, structuredClone(value)); return { pathname: path }; }
  };
}

function fakeLifecycleBuilder(state, { persistedAt }) {
  const valid = Boolean(state?.minimumEngagement) && Boolean(state?.hardDisqualifiersConfirmed) && Array.isArray(state?.firstCallRules) && state.firstCallRules.length > 0;
  return {
    status: state.lockedAt ? 'LOCKED' : 'IN_PROGRESS',
    persisted_at: persistedAt,
    operating_profile: {
      consultant: { consultant_id: state.consultantId, full_name: state.fullName, firm: state.firm },
      commercial: { minimum_engagement: { amount: state.minimumEngagement, currency: state.currency } }
    },
    profile_validation: { ok: valid, errors: valid ? [] : ['INCOMPLETE'] },
    runtime_v3: {
      status: state.currency === 'USD' && valid ? 'READY' : 'BLOCKED',
      report: { errors: state.currency === 'USD' ? [] : [`UNSUPPORTED_RUNTIME_CURRENCY:${state.currency}`], warnings: [] },
      consultant_sot_json: state.currency === 'USD' && valid ? { consultant: { consultant_name: state.fullName } } : null
    }
  };
}

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef';
const IDENTITY = { consultant_id: 'consultant_sarah', first_name: 'Sarah', full_name: 'Sarah Jenkins', firm: 'SecureAdvisory' };
const COMPLETE = { consultantId: 'attacker', firstName: 'Mallory', fullName: 'Mallory', firm: 'Wrong', minimumEngagement: 7500, currency: 'USD', hardDisqualifiersConfirmed: true, firstCallRules: ['documented service/problem alignment'], sessionId: 's1' };

test('invite storage keeps only token hash and resolve establishes canonical identity', async () => {
  const storage = memoryStorage();
  const repo = createProfileRepository(storage);
  const { token, invite } = await repo.createInvite(IDENTITY, { now: 1000, ttlMs: 100000 });
  assert.ok(token.length > 30);
  assert.equal(JSON.stringify([...storage.map.values()]).includes(token), false);
  const resolved = await repo.resolveInvite(token, { now: 2000 });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.invite.consultant_id, IDENTITY.consultant_id);
  const identity = await repo.loadIdentity(IDENTITY.consultant_id);
  assert.equal(identity.full_name, 'Sarah Jenkins');
  assert.equal(invite.token_hash.length > 20, true);
});

test('expired invite fails closed', async () => {
  const repo = createProfileRepository(memoryStorage());
  const { token } = await repo.createInvite(IDENTITY, { now: 1000, ttlMs: 50 });
  const resolved = await repo.resolveInvite(token, { now: 2000 });
  assert.deepEqual(resolved, { ok: false, error: 'INVITE_EXPIRED' });
});

test('session is signed and tampering is rejected', async () => {
  const storage = memoryStorage();
  const repo = createProfileRepository(storage);
  const service = createCalibrationService({ repository: repo, sessionSecret: SECRET, buildLifecycleRecord: fakeLifecycleBuilder });
  const { token } = await repo.createInvite(IDENTITY, { now: 1000, ttlMs: 100000 });
  const resolved = await service.resolveInvite(token, { now: 2000 });
  assert.equal(resolved.ok, true);
  assert.equal(verifySession(resolved.session_token, SECRET, { now: 3000 }).ok, true);
  assert.equal(verifySession(`${resolved.session_token}x`, SECRET, { now: 3000 }).ok, false);
});

test('server overwrites spoofed client identity and persists resume state', async () => {
  const storage = memoryStorage();
  const repo = createProfileRepository(storage);
  const service = createCalibrationService({ repository: repo, sessionSecret: SECRET, buildLifecycleRecord: fakeLifecycleBuilder });
  const { token } = await repo.createInvite(IDENTITY, { now: 1000, ttlMs: 100000 });
  const resolved = await service.resolveInvite(token, { now: 2000 });
  const save = await service.saveProgress(resolved.session_token, COMPLETE, { now: 3000 });
  assert.equal(save.ok, true);
  const loaded = await service.load(resolved.session_token, { now: 4000 });
  assert.equal(loaded.resume_state.consultantId, 'consultant_sarah');
  assert.equal(loaded.resume_state.fullName, 'Sarah Jenkins');
  assert.equal(loaded.resume_state.firm, 'SecureAdvisory');
});

test('lock uses server timestamp and future edits fail closed', async () => {
  const storage = memoryStorage();
  const repo = createProfileRepository(storage);
  const service = createCalibrationService({ repository: repo, sessionSecret: SECRET, buildLifecycleRecord: fakeLifecycleBuilder });
  const { token } = await repo.createInvite(IDENTITY, { now: 1000, ttlMs: 100000 });
  const resolved = await service.resolveInvite(token, { now: 2000 });
  const locked = await service.lock(resolved.session_token, COMPLETE, { now: 5000 });
  assert.equal(locked.ok, true);
  assert.equal(locked.locked_at, new Date(5000).toISOString());
  const save = await service.saveProgress(resolved.session_token, COMPLETE, { now: 6000 });
  assert.deepEqual(save, { ok: false, error: 'PROFILE_LOCKED' });
});

test('a locked profile cannot be overwritten by a second lock request', async () => {
  const storage = memoryStorage();
  const repo = createProfileRepository(storage);
  const service = createCalibrationService({ repository: repo, sessionSecret: SECRET, buildLifecycleRecord: fakeLifecycleBuilder });
  const { token } = await repo.createInvite(IDENTITY, { now: 1000, ttlMs: 100000 });
  const resolved = await service.resolveInvite(token, { now: 2000 });

  const first = await service.lock(resolved.session_token, COMPLETE, { now: 5000 });
  assert.equal(first.ok, true);

  const second = await service.lock(
    resolved.session_token,
    { ...COMPLETE, minimumEngagement: 999999 },
    { now: 6000 }
  );
  assert.deepEqual(second, { ok: false, error: 'PROFILE_LOCKED' });

  const loaded = await service.load(resolved.session_token, { now: 7000 });
  assert.equal(loaded.resume_state.minimumEngagement, 7500);
  assert.equal(loaded.profile_status, 'LOCKED');
});

test('non-USD profile can lock while runtime remains blocked', async () => {
  const storage = memoryStorage();
  const repo = createProfileRepository(storage);
  const service = createCalibrationService({ repository: repo, sessionSecret: SECRET, buildLifecycleRecord: fakeLifecycleBuilder });
  const { token } = await repo.createInvite(IDENTITY, { now: 1000, ttlMs: 100000 });
  const resolved = await service.resolveInvite(token, { now: 2000 });
  const locked = await service.lock(resolved.session_token, { ...COMPLETE, currency: 'EUR' }, { now: 5000 });
  assert.equal(locked.ok, true);
  assert.equal(locked.runtime_v3.status, 'BLOCKED');
  assert.deepEqual(locked.runtime_v3.errors, ['UNSUPPORTED_RUNTIME_CURRENCY:EUR']);
});
