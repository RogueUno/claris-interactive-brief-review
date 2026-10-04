import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalizeContext, buildFinalizeBundle } from '../finalize-handoff.mjs';
import { createClarificationRepository } from '../repository.mjs';
import { createClarificationService } from '../service.mjs';
import { publicClarificationPackage } from '../contract.mjs';
import { verifyLockedDeliveryOwner } from '../verify-locked-delivery-owner.mjs';
import { buildConsultantFinalDelivery } from '../../../calibration-v3/server/pilot-delivery.mjs';

const consultantId = 'consultant_alpha';
const consultantSot = {
  sot_version: 'AGENTIC_TEST_1',
  consultant: { consultant_name: 'Alice Consultant', firm: 'Alpha Advisory' },
  commercial_rules: { budget_required_before_first_call: true }
};
const fakeEmail = 'alice@alpha.example';

function storageFixture() {
  const map = new Map();
  let revision = 0;
  const storage = {
    async getJson(path) { return map.has(path) ? structuredClone(map.get(path).value) : null; },
    async getJsonWithMeta(path) {
      const found = map.get(path);
      return found ? { value: structuredClone(found.value), etag: found.etag } :
        { value: null, etag: null };
    },
    async putJson(path, value, { ifMatch = null } = {}) {
      const current = map.get(path);
      if (ifMatch && current?.etag !== ifMatch) throw new Error('BLOB_PRECONDITION_FAILED');
      const etag = 'etag-' + ++revision;
      map.set(path, { value: structuredClone(value), etag });
      return { etag };
    }
  };
  return {
    repository: createClarificationRepository(storage),
    service: createClarificationService({
      repository: createClarificationRepository(storage),
      sessionSecret: 'a-strong-enough-test-secret-for-local-tests'
    })
  };
}

const profileRepository = {
  async loadIdentity() {
    return { consultant_id: consultantId, delivery_email: fakeEmail };
  },
  async loadProfileEnvelopeWithMeta() {
    return {
      etag: 'profile-1',
      envelope: {
        consultant_id: consultantId,
        lifecycle_record: {
          consultant_id: consultantId,
          status: 'LOCKED',
          runtime_v3: {
            status: 'READY',
            consultant_sot_json: consultantSot,
            report: { errors: [], warnings: [], adapter_version: 'test' }
          }
        }
      }
    };
  }
};

function pkg() {
  return {
    opportunity_id: 'opportunity_alpha_001',
    consultant: {
      consultant_id: consultantId, first_name: 'Alice', firm: 'Alpha Advisory'
    },
    prospect: {
      first_name: 'Robin', company: 'Acme Security', role: 'VP Engineering'
    },
    intro_context: null,
    questions: [{
      question_id: 'q_budget',
      mode: 'DISCOVER',
      prompt: 'Is budget allocated to the security review?',
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

test('offline submitted-clarification lifecycle binds private final delivery to locked tenant', async () => {
  const context = buildFinalizeContext({
    case_state_json: JSON.stringify({ artifact_contract_version: 'V3_TRUTH_BOUNDARY_3' }),
    consultant_sot_json: JSON.stringify(consultantSot),
    consultant: { consultant_id: consultantId, firm: 'Alpha Advisory' },
    consultant_delivery_email: fakeEmail
  }, { now: 1_000 });
  const verified = await verifyLockedDeliveryOwner(context, {
    repository: profileRepository
  });
  const { repository, service } = storageFixture();
  const created = await service.createPackage(pkg(), {
    now: 1_000, ttlMs: 60_000, finalizeContext: { ...context, ...verified }
  });
  assert.equal(created.ok, true);
  assert.equal(created.requires_clarification, true);

  const opened = await service.resolveInvite(created.invite_token, { now: 1_200 });
  assert.equal(opened.ok, true);
  const visible = publicClarificationPackage((await repository.loadEnvelopeWithMeta('opportunity_alpha_001')).envelope.package);
  assert.doesNotMatch(JSON.stringify(visible), /alice@alpha.example|finalize_context|consultant_sot_json/);
  const submitted = await service.submit(
    opened.session_token,
    [{ question_id: 'q_budget', value: 'yes' }],
    { now: 1_500, expectedVersion: opened.opportunity_version }
  );
  assert.equal(submitted.ok, true);
  const loaded = await repository.loadEnvelopeWithMeta('opportunity_alpha_001');
  const final = buildFinalizeBundle(loaded.envelope, loaded.etag);
  assert.equal(final.ok, true);
  assert.equal(final.consultant_id, consultantId);
  assert.equal(final.consultant_delivery_email, fakeEmail);
  assert.equal(JSON.parse(final.prospect_answers_json).source_class, 'PROSPECT_REPORTED');

  // Test-only stand-in for a previously certified FINALIZE brief; NO model calls.
  const delivery = buildConsultantFinalDelivery({
    consultant_delivery_email: final.consultant_delivery_email,
    consultant_first_name: 'Alice',
    company: 'Acme Security',
    prospect_first_name: 'Robin',
    final_brief_markdown: '# CLARIS Summary\nVerified context and budget question acknowledged.',
    opportunity_id: 'opportunity_alpha_001'
  });
  assert.equal(delivery.to, fakeEmail);
  assert.equal(delivery.kind, 'CONSULTANT_FINAL');
  assert.doesNotMatch(JSON.stringify(delivery), /other-tenant@/);

  const repeatSubmit = await service.submit(
    opened.session_token,
    [{ question_id: 'q_budget', value: 'yes' }],
    { now: 1_600 }
  );
  assert.equal(repeatSubmit.ok, false);
  assert.equal(repeatSubmit.error, 'CLARIFICATION_ALREADY_SUBMITTED');
});

test('older ownerless clarification cannot produce an addressed consultant email', async () => {
  const { repository, service } = storageFixture();
  const oldContext = buildFinalizeContext({
    case_state_json: JSON.stringify({ artifact_contract_version: 'V3_TRUTH_BOUNDARY_3' }),
    consultant_sot_json: JSON.stringify(consultantSot)
  });
  const created = await service.createPackage(pkg(), {
    now: 1_000, ttlMs: 60_000, finalizeContext: oldContext
  });
  const opened = await service.resolveInvite(created.invite_token, { now: 1_200 });
  const submitted = await service.submit(
    opened.session_token,
    [{ question_id: 'q_budget', value: 'yes' }],
    { now: 1_500, expectedVersion: opened.opportunity_version }
  );
  assert.equal(submitted.ok, true);
  const loaded = await repository.loadEnvelopeWithMeta('opportunity_alpha_001');
  const final = buildFinalizeBundle(loaded.envelope, loaded.etag);
  assert.equal(final.ok, true);
  assert.equal(final.consultant_delivery_email, null);
  assert.throws(() => buildConsultantFinalDelivery({
    consultant_delivery_email: final.consultant_delivery_email,
    company: 'Acme Security', final_brief_markdown: 'Certified brief'
  }), /CONSULTANT_DELIVERY_EMAIL_REQUIRED/);
});
