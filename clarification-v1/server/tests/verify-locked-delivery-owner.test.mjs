import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLockedDeliveryOwner } from '../verify-locked-delivery-owner.mjs';

const consultantSot = {
  sot_version: 'AGENTIC_TEST_1',
  consultant: { consultant_name: 'Consultant A', firm: 'A Advisory' },
  commercial_rules: { budget_required_before_first_call: true }
};

function fixture({ id = 'consultant_a', deliveryEmail = 'a@example.com', status = 'LOCKED',
  runtimeStatus = 'READY', lockedSot = consultantSot } = {}) {
  const repo = {
    async loadIdentity() {
      return { consultant_id: id, delivery_email: deliveryEmail };
    },
    async loadProfileEnvelopeWithMeta() {
      return {
        etag: 'etag-test',
        envelope: {
          consultant_id: id,
          lifecycle_record: {
            consultant_id: id,
            status,
            runtime_v3: {
              status: runtimeStatus,
              consultant_sot_json: lockedSot,
              report: { adapter_version: 'test', errors: [], warnings: [] }
            }
          }
        }
      };
    }
  };
  return { repository: repo };
}

const validInput = {
  consultant_id: 'consultant_a',
  consultant_delivery_email: 'A@EXAMPLE.COM',
  consultant_sot_json: JSON.stringify(consultantSot)
};

test('locks consultant delivery owner to verified identity + locked Runtime', async () => {
  const owner = await verifyLockedDeliveryOwner(validInput, fixture());
  assert.deepEqual(owner, {
    consultant_id: 'consultant_a',
    consultant_delivery_email: 'a@example.com'
  });
});

test('JSON key ordering cannot cause a spurious mismatch', async () => {
  const result = await verifyLockedDeliveryOwner({
    ...validInput,
    consultant_sot_json: JSON.stringify({
      commercial_rules: { budget_required_before_first_call: true },
      consultant: { firm: 'A Advisory', consultant_name: 'Consultant A' },
      sot_version: 'AGENTIC_TEST_1'
    })
  }, fixture());
  assert.equal(result.consultant_id, 'consultant_a');
});

test('rejects missing or mismatched owner email', async () => {
  await assert.rejects(
    verifyLockedDeliveryOwner({ ...validInput, consultant_delivery_email: null }, fixture()),
    /CONSULTANT_DELIVERY_OWNER_REQUIRED/
  );
  await assert.rejects(
    verifyLockedDeliveryOwner({ ...validInput, consultant_delivery_email: 'b@example.com' }, fixture()),
    /CONSULTANT_DELIVERY_OWNER_MISMATCH/
  );
});

test('rejects wrong tenant and invalid consultant IDs', async () => {
  await assert.rejects(
    verifyLockedDeliveryOwner(validInput, fixture({ id: 'consultant_b' })),
    /CONSULTANT_DELIVERY_OWNER_MISMATCH/
  );
  await assert.rejects(
    verifyLockedDeliveryOwner({ ...validInput, consultant_id: '../../wrong' }, fixture()),
    /CONSULTANT_DELIVERY_OWNER_INVALID/
  );
});

test('rejects unlocked/blocked Runtime and altered consultant SOT', async () => {
  await assert.rejects(
    verifyLockedDeliveryOwner(validInput, fixture({ status: 'IN_PROGRESS' })),
    /CONSULTANT_DELIVERY_RUNTIME_NOT_READY/
  );
  await assert.rejects(
    verifyLockedDeliveryOwner(validInput, fixture({ runtimeStatus: 'BLOCKED' })),
    /CONSULTANT_DELIVERY_RUNTIME_NOT_READY/
  );
  await assert.rejects(
    verifyLockedDeliveryOwner(validInput, fixture({ lockedSot: {
      ...consultantSot, consultant: { ...consultantSot.consultant, firm: 'Another Firm' }
    } })),
    /CONSULTANT_DELIVERY_SOT_MISMATCH/
  );
});

test('lookup failure and malformed SOT do not authorize a recipient', async () => {
  await assert.rejects(
    verifyLockedDeliveryOwner(validInput, { repository: { loadIdentity() {
      throw new Error('storage unavailable');
    }, loadProfileEnvelopeWithMeta: async () => ({}) } }),
    /CONSULTANT_DELIVERY_LOOKUP_FAILED/
  );
  await assert.rejects(
    verifyLockedDeliveryOwner({ ...validInput, consultant_sot_json: '{"broken":' }, fixture()),
    /CONSULTANT_DELIVERY_SOT_INVALID/
  );
});
