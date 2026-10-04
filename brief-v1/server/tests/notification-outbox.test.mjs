import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriefNotificationOutbox } from '../notification-outbox.mjs';

const publicationId = 'pub_ABC1234567890';
const consultantId = 'consultant_pilot';
const email = 'consultant@pilot.example';
const token = 'X'.repeat(44);
const baseUrl = 'https://claris.test/brief-v1/';
const valid = {
  publication_id: publicationId,
  brief_id: publicationId,
  consultant_id: consultantId,
  consultant_delivery_email: email,
  notification_dedupe_key: 'CONSULTANT_BRIEF_READY:' + publicationId,
  brief_url: baseUrl + '#brief=' + token
};
function fixtures({
  owner = consultantId, locked = true, ready = true, identityEmail = email,
  privateBriefStatus = 'ACTIVE', tokenId = publicationId, briefPublished = true,
  storageOverride = {}
} = {}) {
  const values = new Map();
  let sequence = 0;
  const clone = value => structuredClone(value);
  const storage = {
    async getJsonWithMeta(path) {
      const found = values.get(path);
      return found ? { value: clone(found.value), etag: found.etag } : { value: null, etag: null };
    },
    async putJsonIfAbsent(path, value) {
      if (values.has(path)) throw new Error('BLOB_ALREADY_EXISTS');
      // Simulate atomic provider rejection. Even if two asynchronous calls
      // reached here together, one map write must win before the first await.
      const etag = 'etag-' + ++sequence;
      values.set(path, { value: clone(value), etag });
      return { etag };
    },
    async putJson(path, value, { ifMatch = null } = {}) {
      const old = values.get(path);
      if (!old || ifMatch !== old.etag) throw new Error('BLOB_PRECONDITION_FAILED');
      const etag = 'etag-' + ++sequence;
      values.set(path, { value: clone(value), etag });
      return { etag };
    },
    ...storageOverride
  };
  const briefRepository = {
    async loadBrief(id) {
      if (id !== publicationId) return { ok: false, error: 'BRIEF_NOT_FOUND' };
      if (privateBriefStatus !== 'ACTIVE') return { ok: false, error: 'BRIEF_REVOKED' };
      return {
        ok: true,
        brief: {
          brief_id: publicationId,
          publication_id: briefPublished ? publicationId : null,
          consultant_id: owner,
          status: privateBriefStatus
        }
      };
    },
    async resolveToken(value) {
      if (value !== token) return { ok: false, error: 'BRIEF_TOKEN_NOT_FOUND' };
      return { ok: true, brief: {
        brief_id: tokenId, publication_id: tokenId, consultant_id: owner,
        status: 'ACTIVE'
      } };
    }
  };
  const consultantRepository = {
    async loadIdentity(id) { return { consultant_id: id, delivery_email: identityEmail }; },
    async loadProfileEnvelopeWithMeta(id) {
      return {
        etag: 'profile-1',
        envelope: {
          consultant_id: id,
          lifecycle_record: {
            consultant_id: id,
            status: locked ? 'LOCKED' : 'IN_PROGRESS',
            runtime_v3: {
              status: ready ? 'READY' : 'BLOCKED',
              consultant_sot_json: { consultant: { consultant_name: 'Pilot' } },
              report: { errors: [], warnings: [] }
            }
          }
        }
      };
    }
  };
  return {
    values, storage, briefRepository, consultantRepository,
    outbox: createBriefNotificationOutbox({
      storage, briefRepository, consultantRepository, baseUrl
    })
  };
}

test('claimed once, uncertain until ACK, then sent forever for the publication', async () => {
  const { outbox, values } = fixtures();
  const first = await outbox.claim(valid, { now: 1000 });
  assert.equal(first.status, 'CLAIMED');
  assert.equal(first.consultant_delivery_email, email);
  assert.match(first.claim_token, /^[a-f0-9]{64}$/);
  const persisted = [...values.values()][0].value;
  assert.equal(persisted.status, 'RESERVED');
  assert.equal(persisted.email_hash.length, 64);
  assert.equal(JSON.stringify(persisted).includes(email), false);
  assert.equal(JSON.stringify(persisted).includes(token), false);

  const whilePending = await outbox.claim(valid, { now: 1000 + 365 * 86400000 });
  assert.equal(whilePending.status, 'RECONCILIATION_REQUIRED');
  assert.equal(whilePending.ok, false);
  const rejectedAck = await outbox.acknowledge({
    publication_id: publicationId,
    claim_token: '0'.repeat(64),
    provider_message_id: 'gmail-message-1'
  });
  assert.equal(rejectedAck.status, 'BLOCKED');

  const acknowledged = await outbox.acknowledge({
    publication_id: publicationId,
    claim_token: first.claim_token,
    provider_message_id: 'gmail-message-1'
  }, { now: 1100 });
  assert.equal(acknowledged.status, 'ACKNOWLEDGED');
  assert.equal(acknowledged.reused, false);
  const repeatedAck = await outbox.acknowledge({
    publication_id: publicationId,
    claim_token: first.claim_token,
    provider_message_id: 'gmail-message-1'
  });
  assert.equal(repeatedAck.status, 'ACKNOWLEDGED');
  assert.equal(repeatedAck.reused, true);
  const otherMessage = await outbox.acknowledge({
    publication_id: publicationId,
    claim_token: first.claim_token,
    provider_message_id: 'gmail-message-2'
  });
  assert.equal(otherMessage.status, 'BLOCKED');
  const repeatClaim = await outbox.claim(valid);
  assert.equal(repeatClaim.status, 'SKIPPED_ALREADY_SENT');
  assert.equal(repeatClaim.ok, true);
});

test('simultaneous claim attempts cannot authorize two Gmail sends', async () => {
  const { outbox } = fixtures();
  const runs = await Promise.all(Array.from({ length: 16 }, () => outbox.claim(valid)));
  assert.equal(runs.filter(r => r.status === 'CLAIMED').length, 1);
  assert.equal(runs.filter(r => r.status !== 'CLAIMED').length, 15);
  for(const rejected of runs.filter(r => r.status !== 'CLAIMED')){
    assert.ok(['RECONCILIATION_REQUIRED', 'SKIPPED_ALREADY_SENT'].includes(rejected.status));
  }
});

test('email and tenant identity must match the locked profile', async () => {
  for (const options of [
    { owner: 'consultant_wrong' },
    { locked: false },
    { ready: false },
    { identityEmail: 'forged@example.org' }
  ]) {
    const { outbox } = fixtures(options);
    const result = await outbox.claim(valid);
    assert.equal(result.status, 'BLOCKED', JSON.stringify(options));
    assert.equal(result.error, 'BRIEF_NOTIFICATION_OWNER_MISMATCH');
  }
});

test('wrong token, domain, url path, publication, dedupe key or unsigned brief fails closed', async () => {
  for (const invalid of [
    { brief_url: 'https://evil.example/brief-v1/#brief=' + token },
    { brief_url: baseUrl + '#brief=' + 'a'.repeat(44) },
    { brief_url: baseUrl + '#brief=' + token + '&extra=x' },
    { brief_url: 'http://claris.test/brief-v1/#brief=' + token },
    { brief_url: 'https://claris.test/brief-v5/#brief=' + token },
    { brief_id: 'pub_WRONG_ID' },
    { notification_dedupe_key: 'OTHER:' + publicationId },
    { publication_id: 'pub_some_other' }
  ]) {
    const { outbox, values } = fixtures();
    assert.equal((await outbox.claim({ ...valid, ...invalid })).status, 'BLOCKED');
    assert.equal(values.size, 0);
  }
  for(const options of [
    { tokenId: 'pub_other_secret' },
    { privateBriefStatus: 'REVOKED' },
    { briefPublished: false }
  ]) {
    const { outbox } = fixtures(options);
    assert.equal((await outbox.claim(valid)).status, 'BLOCKED');
  }
});

test('unknown create outcome never grants send authority', async () => {
  const { outbox } = fixtures({
    storageOverride: {
      async putJsonIfAbsent() {
        throw new Error('PROVIDER_TIMEOUT');
      }
    }
  });
  const result = await outbox.claim(valid);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.error, 'BRIEF_NOTIFICATION_RESERVATION_UNCERTAIN');
});

test('malformed receipt and failed acknowledgment are not automatically retried', async () => {
  const f = fixtures();
  const claim = await f.outbox.claim(valid);
  assert.equal(claim.status, 'CLAIMED');
  const path = [...f.values.keys()][0];
  f.values.get(path).value.status = 'UNKNOWN';
  assert.equal((await f.outbox.claim(valid)).error, 'BRIEF_NOTIFICATION_RECEIPT_INVALID');

  const second = fixtures();
  const good = await second.outbox.claim(valid);
  second.storage.putJson = async () => { throw new Error('STORAGE_FAILURE'); };
  const ack = await second.outbox.acknowledge({
    publication_id: publicationId,
    claim_token: good.claim_token,
    provider_message_id: 'gmail-1'
  });
  assert.equal(ack.status, 'RECONCILIATION_REQUIRED');
  assert.equal((await second.outbox.claim(valid)).status, 'RECONCILIATION_REQUIRED');
});
