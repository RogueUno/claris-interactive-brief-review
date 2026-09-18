import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileRepository } from '../repository.mjs';
import { createCalibrationService } from '../service.mjs';

function versionedMemoryStorage() {
  const map = new Map();
  let version = 0;

  return {
    async getJson(path) {
      const entry = map.get(path);
      return entry ? structuredClone(entry.value) : null;
    },

    async getJsonWithMeta(path) {
      const entry = map.get(path);
      return entry
        ? { value: structuredClone(entry.value), etag: entry.etag }
        : { value: null, etag: null };
    },

    async putJson(path, value, { ifMatch = null } = {}) {
      const current = map.get(path);
      if (ifMatch && current?.etag !== ifMatch) {
        const error = new Error('BLOB_PRECONDITION_FAILED');
        error.code = 'BLOB_PRECONDITION_FAILED';
        throw error;
      }

      version += 1;
      const etag = `etag-${version}`;
      map.set(path, { value: structuredClone(value), etag });
      return { pathname: path, etag };
    }
  };
}

function fakeLifecycleBuilder(state, { persistedAt }) {
  const valid =
    Boolean(state?.minimumEngagement) &&
    Boolean(state?.hardDisqualifiersConfirmed) &&
    Array.isArray(state?.firstCallRules) &&
    state.firstCallRules.length > 0;

  return {
    status: state.lockedAt ? 'LOCKED' : 'IN_PROGRESS',
    persisted_at: persistedAt,
    operating_profile: {
      consultant: {
        consultant_id: state.consultantId,
        full_name: state.fullName,
        firm: state.firm
      }
    },
    profile_validation: { ok: valid, errors: valid ? [] : ['INCOMPLETE'] },
    runtime_v3: {
      status: valid ? 'READY' : 'BLOCKED',
      report: { errors: [], warnings: [] },
      consultant_sot_json: valid ? {} : null
    }
  };
}

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef';
const IDENTITY = {
  consultant_id: 'consultant_concurrency',
  first_name: 'Ari',
  full_name: 'Ari Concurrent',
  firm: 'Concurrent Advisory'
};
const COMPLETE = {
  consultantId: 'spoofed',
  firstName: 'Wrong',
  fullName: 'Wrong',
  firm: 'Wrong',
  minimumEngagement: 7500,
  currency: 'USD',
  hardDisqualifiersConfirmed: true,
  firstCallRules: ['documented fit'],
  sessionId: 's1'
};

async function setup() {
  const repo = createProfileRepository(versionedMemoryStorage());
  const service = createCalibrationService({
    repository: repo,
    sessionSecret: SECRET,
    buildLifecycleRecord: fakeLifecycleBuilder
  });
  const { token } = await repo.createInvite(IDENTITY, {
    now: 1000,
    ttlMs: 100000,
    seedState: COMPLETE
  });
  const resolved = await service.resolveInvite(token, { now: 2000 });
  assert.equal(resolved.ok, true);
  assert.ok(resolved.profile_version);
  return { service, resolved };
}

test('stale progress save fails closed instead of overwriting a newer session', async () => {
  const { service, resolved } = await setup();
  const staleVersion = resolved.profile_version;

  const first = await service.saveProgress(
    resolved.session_token,
    { ...COMPLETE, minimumEngagement: 8000 },
    { now: 3000, expectedVersion: staleVersion }
  );
  assert.equal(first.ok, true);
  assert.notEqual(first.profile_version, staleVersion);

  const stale = await service.saveProgress(
    resolved.session_token,
    { ...COMPLETE, minimumEngagement: 999999 },
    { now: 4000, expectedVersion: staleVersion }
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.error, 'PROFILE_CONFLICT');

  const loaded = await service.load(resolved.session_token, { now: 5000 });
  assert.equal(loaded.resume_state.minimumEngagement, 8000);
  assert.equal(loaded.profile_version, first.profile_version);
});

test('stale session cannot lock over a newer saved profile', async () => {
  const { service, resolved } = await setup();
  const staleVersion = resolved.profile_version;

  const first = await service.saveProgress(
    resolved.session_token,
    { ...COMPLETE, minimumEngagement: 8500 },
    { now: 3000, expectedVersion: staleVersion }
  );
  assert.equal(first.ok, true);

  const staleLock = await service.lock(
    resolved.session_token,
    { ...COMPLETE, minimumEngagement: 999999 },
    { now: 4000, expectedVersion: staleVersion }
  );
  assert.equal(staleLock.ok, false);
  assert.equal(staleLock.error, 'PROFILE_CONFLICT');

  const loaded = await service.load(resolved.session_token, { now: 5000 });
  assert.equal(loaded.resume_state.minimumEngagement, 8500);
  assert.equal(loaded.profile_status, 'IN_PROGRESS');
});
