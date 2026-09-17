import assert from 'node:assert/strict';
import { assertOpaqueInviteToken, productionSessionEnvelope, readOpaqueInviteToken } from '../session-contract.mjs';

const token = 'inv_7f3c9d6e2b1a4c5d8e0f';
assert.equal(assertOpaqueInviteToken(token).ok, true);
assert.equal(assertOpaqueInviteToken('sarah@example.com').ok, false);
assert.equal(assertOpaqueInviteToken('short').ok, false);
assert.equal(readOpaqueInviteToken({ href: `https://example.test/calibration-v3/?invite=${token}` }), token);

const envelope = productionSessionEnvelope({
  consultantId: 'consultant_sarah',
  sessionId: 'cal3_test',
  inviteTokenHash: 'sha256:abc123'
});
assert.equal(envelope.status, 'IN_PROGRESS');
assert.equal(envelope.consultant_id, 'consultant_sarah');
assert.equal(envelope.invite_token_hash, 'sha256:abc123');

console.log('CLARIS session contract tests: PASS');
