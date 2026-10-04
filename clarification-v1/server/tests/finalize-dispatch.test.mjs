import test from 'node:test';
import assert from 'node:assert/strict';
import { createClarificationRepository } from '../repository.mjs';
import { createClarificationService } from '../service.mjs';
import { buildFinalizeContext, buildFinalizeBundle } from '../finalize-handoff.mjs';
import { recordFinalizeDispatch } from '../finalize-dispatch.mjs';

function fixture() {
  const map = new Map();
  let revision = 0;
  const storage = {
    async getJson(path) {
      return map.has(path) ? structuredClone(map.get(path).value) : null;
    },
    async getJsonWithMeta(path) {
      const old = map.get(path);
      return old
        ? { value: structuredClone(old.value), etag: old.etag }
        : { value: null, etag: null };
    },
    async putJson(path, value, { ifMatch = null } = {}) {
      const old = map.get(path);
      if (ifMatch && (!old || ifMatch !== old.etag)) {
        const error = new Error('BLOB_PRECONDITION_FAILED');
        error.code = 'BLOB_PRECONDITION_FAILED';
        throw error;
      }
      const etag = 'etag-' + ++revision;
      map.set(path, { value: structuredClone(value), etag });
      return { etag };
    }
  };
  const repository = createClarificationRepository(storage);
  const service = createClarificationService({
    repository, sessionSecret: 's'.repeat(64)
  });
  return { repository, service, map, storage };
}
function pkg() {
  return {
    opportunity_id: 'opportunity_dispatch_001',
    consultant: {
      consultant_id: 'consultant_alpha',
      first_name: 'Alex', firm: 'Example Advisory'
    },
    prospect: {
      first_name: 'Robin', company: 'Acme Security', role: 'VP Engineering'
    },
    questions: [{
      question_id: 'q_budget',
      mode: 'DISCOVER',
      prompt: 'Was the review budget allocated?',
      response_type: 'SINGLE_CHOICE',
      options: [
        { option_id: 'yes', label: 'Yes', posture: 'GENERIC_SAFE', basis_ids: [] },
        { option_id: 'nope', label: 'No', posture: 'GENERIC_SAFE', basis_ids: [] }
      ],
      allow_other: true,
      allow_unsure: true,
      required: true,
      evidence_refs: []
    }]
  };
}
async function submitted() {
  const f = fixture();
  const context = buildFinalizeContext({
    case_state_json: JSON.stringify({ case: 'frozen' }),
    consultant_sot_json: JSON.stringify({ consultant: { consultant_name: 'Alex' } }),
    consultant_id: 'consultant_alpha',
    consultant_delivery_email: 'consultant@example.net'
  }, { now: 1000 });
  const created = await f.service.createPackage(pkg(), {
    now: 1000, ttlMs: 60000, finalizeContext: context
  });
  const opened = await f.service.resolveInvite(created.invite_token, { now: 1100 });
  assert.equal(opened.ok, true);
  const result = await f.service.submit(
    opened.session_token,
    [{ question_id: 'q_budget', value: 'yes' }],
    { now: 1200, expectedVersion: opened.opportunity_version }
  );
  assert.equal(result.ok, true);
  return f;
}

test('submitted answer writes durable PENDING continuation in the same commit', async () => {
  const f = await submitted();
  const loaded = await f.repository.loadEnvelopeWithMeta(pkg().opportunity_id);
  assert.equal(loaded.envelope.package.status, 'SUBMITTED');
  assert.equal(loaded.envelope.finalize_dispatch.schema_version, 'claris_finalize_dispatch_v1');
  assert.equal(loaded.envelope.finalize_dispatch.status, 'PENDING');
  assert.equal(loaded.envelope.finalize_dispatch.checked_at, null);
  assert.equal(loaded.envelope.response.answers.length, 1);
  const adminBundle = buildFinalizeBundle(loaded.envelope, loaded.etag);
  assert.equal(adminBundle.ok, true);
  assert.equal(adminBundle.finalize_dispatch_status, 'PENDING');
});

test('successful webhook request is recorded as accepted, never finalized', async () => {
  const f = await submitted();
  const recorded = await recordFinalizeDispatch(f.repository, pkg().opportunity_id, {
    ok: true
  }, { now: 1300 });
  assert.deepEqual(recorded, {
    ok: true, status: 'DISPATCH_ACCEPTED', reused: false
  });
  const loaded = await f.repository.loadEnvelopeWithMeta(pkg().opportunity_id);
  assert.equal(loaded.envelope.finalize_dispatch.status, 'DISPATCH_ACCEPTED');
  assert.equal(loaded.envelope.finalize_dispatch.failure_code, null);
  const admin = buildFinalizeBundle(loaded.envelope, loaded.etag);
  assert.equal(admin.finalize_dispatch_status, 'DISPATCH_ACCEPTED');
});

test('missing/rejected webhook is durably marked for manual reconciliation without retry', async () => {
  for(const failed of [
    { ok: false, error: 'FINALIZE_WEBHOOK_NOT_CONFIGURED' },
    { ok: false, error: 'FINALIZE_WEBHOOK_REJECTED', status: 502 },
    { ok: false, error: 'UNSAFE_INTERNAL_TEXT', status: 500 }
  ]){
    const f = await submitted();
    const mark = await recordFinalizeDispatch(f.repository, pkg().opportunity_id, failed, { now: 1400 });
    assert.equal(mark.status, 'RECONCILIATION_REQUIRED');
    const stored = (await f.repository.loadEnvelopeWithMeta(pkg().opportunity_id)).envelope.finalize_dispatch;
    assert.equal(stored.status, 'RECONCILIATION_REQUIRED');
    assert.equal(stored.failure_code, failed.error === 'UNSAFE_INTERNAL_TEXT'
      ? 'FINALIZE_DISPATCH_UNKNOWN_ERROR' : failed.error);
    assert.equal(stored.http_status, failed.status || null);
    const repeat = await recordFinalizeDispatch(f.repository, pkg().opportunity_id,
      { ok: true }, { now: 1500 });
    assert.equal(repeat.reused, true);
    assert.equal(repeat.status, 'RECONCILIATION_REQUIRED');
  }
});

test('storage conflict and legacy missing PENDING state fail closed', async () => {
  const f = await submitted();
  const loaded = await f.repository.loadEnvelopeWithMeta(pkg().opportunity_id);
  const malformed = {
    ...loaded.envelope, finalize_dispatch: null
  };
  await f.repository.saveEnvelopeWithMeta(pkg().opportunity_id, malformed, { ifMatch: loaded.etag });
  const old = await recordFinalizeDispatch(f.repository, pkg().opportunity_id,
    { ok: false }, { now: 1500 });
  assert.equal(old.ok, false);
  assert.equal(old.error, 'FINALIZE_DISPATCH_PENDING_RECORD_MISSING');

  const second = await submitted();
  const original = second.repository.saveEnvelopeWithMeta;
  second.repository.saveEnvelopeWithMeta = async () => {
    throw new Error('BLOB_PRECONDITION_FAILED');
  };
  const conflict = await recordFinalizeDispatch(second.repository, pkg().opportunity_id,
    { ok: true }, { now: 1500 });
  assert.equal(conflict.error, 'FINALIZE_DISPATCH_WRITE_CONFLICT');
  second.repository.saveEnvelopeWithMeta = original;
});
