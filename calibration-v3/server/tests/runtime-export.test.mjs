import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeV3Export } from '../runtime-export.mjs';

function envelope({
  status = 'LOCKED',
  runtimeStatus = 'READY',
  runtimeSot = { sot_version: 'AGENTIC_TEST_1', consultant: { firm: 'Secure Advisory' } }
} = {}) {
  return {
    consultant_id: 'consultant_test',
    calibration_state: { lockedAt: '2026-09-18T12:00:00.000Z' },
    lifecycle_record: {
      consultant_id: 'consultant_test',
      status,
      operating_profile: { locked_at: '2026-09-18T12:00:00.000Z' },
      runtime_v3: {
        status: runtimeStatus,
        consultant_sot_json: runtimeSot,
        report: {
          adapter_version: 'consultant_profile_to_runtime_v3@1',
          errors: runtimeStatus === 'READY' ? [] : ['UNSUPPORTED_RUNTIME_CURRENCY:EUR'],
          warnings: ['PROFILE_ONLY_FIRST_CALL_RULES:test']
        }
      }
    }
  };
}

test('missing profile fails closed', () => {
  assert.deepEqual(buildRuntimeV3Export(null), {
    ok: false,
    error: 'PROFILE_NOT_FOUND',
    http_status: 404
  });
});

test('in-progress profile cannot export Runtime V3', () => {
  const result = buildRuntimeV3Export(envelope({ status: 'IN_PROGRESS' }), 'etag-1');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'PROFILE_NOT_LOCKED');
  assert.equal(result.http_status, 409);
  assert.equal(result.profile_version, 'etag-1');
  assert.equal('consultant_sot_json' in (result.runtime_v3 || {}), false);
});

test('locked but blocked Runtime V3 fails closed without a runtime payload', () => {
  const result = buildRuntimeV3Export(envelope({ runtimeStatus: 'BLOCKED', runtimeSot: null }), 'etag-2');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'RUNTIME_V3_BLOCKED');
  assert.equal(result.http_status, 409);
  assert.equal(result.runtime_v3.status, 'BLOCKED');
  assert.deepEqual(result.runtime_v3.errors, ['UNSUPPORTED_RUNTIME_CURRENCY:EUR']);
  assert.equal('consultant_sot_json' in result.runtime_v3, false);
});

test('locked and READY profile exports only the compiled Runtime V3 contract', () => {
  const source = envelope();
  source.lifecycle_record.operating_profile.strategy = { discovery_style: 'Diagnostic first' };
  source.calibration_state.customExceptions = ['Do not leak me'];

  const result = buildRuntimeV3Export(source, 'etag-3');
  assert.equal(result.ok, true);
  assert.equal(result.http_status, 200);
  assert.equal(result.profile_status, 'LOCKED');
  assert.equal(result.profile_version, 'etag-3');
  assert.equal(result.runtime_v3.status, 'READY');
  assert.equal(result.runtime_v3.consultant_sot_json.sot_version, 'AGENTIC_TEST_1');

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('Diagnostic first'), false);
  assert.equal(serialized.includes('Do not leak me'), false);
});
