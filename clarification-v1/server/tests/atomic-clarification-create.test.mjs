import test from 'node:test';
import assert from 'node:assert/strict';
import { createClarificationRepository } from '../repository.mjs';

const opportunityId = 'opp_atomic_0001';
function pkg(id = opportunityId) {
  return {
    opportunity_id: id,
    status: 'OPEN',
    expires_at: new Date(90_000_000).toISOString(),
    consultant: { consultant_id: 'consultant_alpha', first_name: 'Alex', firm: 'Alpha Advisory' },
    prospect: { first_name: 'Robin', company: 'Acme Corp' },
    questions: [{ question_id: 'q1', mode: 'DISCOVER', prompt: 'Test' }]
  };
}
function fixture({ unknownWrite = false, failInvite = false } = {}) {
  const map = new Map();
  let version = 0;
  const clone = x => structuredClone(x);
  const storage = {
    async getJson(path) {
      return map.has(path) ? clone(map.get(path).value) : null;
    },
    async getJsonWithMeta(path) {
      const item = map.get(path);
      return item
        ? { value: clone(item.value), etag: item.etag }
        : { value: null, etag: null };
    },
    async putJsonIfAbsent(path, value) {
      if (map.has(path)) {
        const error = new Error('BLOB_ALREADY_EXISTS');
        error.code = 'BLOB_ALREADY_EXISTS';
        throw error;
      }
      const etag = 'etag-' + ++version;
      map.set(path, { value: clone(value), etag });
      if (unknownWrite) throw new Error('NETWORK_TIMEOUT_AFTER_ACCEPT');
      return { etag };
    },
    async putJson(path, value, { ifMatch = null } = {}) {
      if (failInvite && path.startsWith('claris/clarification-invites/')) {
        throw new Error('INVITE_WRITE_FAILED');
      }
      const current = map.get(path);
      if (ifMatch && current?.etag !== ifMatch) {
        const error = new Error('BLOB_PRECONDITION_FAILED');
        error.code = 'BLOB_PRECONDITION_FAILED';
        throw error;
      }
      const etag = 'etag-' + ++version;
      map.set(path, { value: clone(value), etag });
      return { etag };
    }
  };
  return { map, storage, repository: createClarificationRepository(storage, {requireAtomicCreate: true}) };
}
test('production repo must have a create-only Blob primitive', () => {
  assert.throws(() => createClarificationRepository({
    getJson: async () => null, putJson: async () => ({})
  }, { requireAtomicCreate: true }), /CLARIFICATION_ATOMIC_STORAGE_REQUIRED/);
});

test('16 racing clarification requests create one envelope and one resolvable invite', async () => {
  const { map, repository } = fixture();
  const outcomes = await Promise.allSettled(
    Array.from({length: 16}, () => repository.createPackage(pkg(), {now: 1000}))
  );
  const wins = outcomes.filter(x => x.status === 'fulfilled');
  const denied = outcomes.filter(x => x.status === 'rejected');
  assert.equal(wins.length, 1);
  assert.equal(denied.length, 15);
  assert.ok(denied.every(x => x.reason?.message === 'OPPORTUNITY_ALREADY_EXISTS'));
  const allPaths = [...map.keys()];
  assert.equal(allPaths.filter(x => x.endsWith('/envelope.json')).length, 1);
  assert.equal(allPaths.filter(x => x.startsWith('claris/clarification-invites/')).length, 1);
  const loaded = await repository.loadEnvelopeWithMeta(opportunityId);
  assert.equal(loaded.envelope.package.consultant.consultant_id, 'consultant_alpha');
  assert.equal(loaded.envelope.package.invite_hash?.length, 64);
  assert.equal(loaded.etag, wins[0].value.etag);
  const invite = await repository.resolveInvite(wins[0].value.token, {now: 2000});
  assert.equal(invite.ok, true);
  assert.equal(invite.envelope.package.opportunity_id, opportunityId);
});

test('lost successful create response cannot overwrite the accepted envelope', async () => {
  const { map, repository } = fixture({unknownWrite: true});
  await assert.rejects(repository.createPackage(pkg(), {now: 1000}), /OPPORTUNITY_ALREADY_EXISTS/);
  const loaded = await repository.loadEnvelopeWithMeta(opportunityId);
  assert.equal(loaded.envelope.package.status, 'OPEN');
  assert.equal(map.size, 1);
  await assert.rejects(repository.createPackage(pkg(), {now: 2000}), /OPPORTUNITY_ALREADY_EXISTS/);
  assert.equal(map.size, 1);
});

test('failed invite write leaves recoverable OPEN envelope but never returns a broken link', async () => {
  const { repository, map, storage } = fixture({failInvite: true});
  await assert.rejects(repository.createPackage(pkg(), {now: 1000}), /INVITE_WRITE_FAILED/);
  assert.equal(map.size, 1);
  const loaded = await repository.loadEnvelopeWithMeta(opportunityId);
  assert.equal(loaded.envelope.package.status, 'OPEN');
  await assert.rejects(repository.createPackage(pkg(), {now: 1500}), /OPPORTUNITY_ALREADY_EXISTS/);
  // A supervised reissue can recover without replaying Gemini or overwriting the case.
  storage.putJson = async (path, value, { ifMatch = null } = {}) => {
    const current = map.get(path);
    if (ifMatch && current?.etag !== ifMatch) throw new Error('BLOB_PRECONDITION_FAILED');
    const etag = 'recovered-' + map.size;
    map.set(path, { value: structuredClone(value), etag });
    return { etag };
  };
  const fixed = await repository.reissueInvite(opportunityId, {
    now: 2000, expiresAt: new Date(95_000_000).toISOString()
  });
  assert.equal(fixed.ok, true);
  assert.ok(fixed.token);
  assert.equal((await repository.resolveInvite(fixed.token, {now: 2500})).ok, true);
});

test('zero-question completion still creates a single immutable envelope with no invite', async () => {
  const { map, repository } = fixture();
  const value = { ...pkg('opp_atomic_zero_001'), status:'NO_CLARIFICATION', questions:[] };
  const written = await repository.createPackage(value,{now:1000});
  assert.equal(written.token,null);
  assert.equal(map.size,1);
  assert.equal((await repository.loadEnvelopeWithMeta(value.opportunity_id)).envelope.package.status,
    'NO_CLARIFICATION');
});
