import { buildDeliveryPackage } from '../../calibration-v3/server/pilot-delivery.mjs';
import { createDirectFinalOutbox } from '../../calibration-v3/server/direct-final-outbox.mjs';
import { json, methodNotAllowed, parseJson } from '../../calibration-v3/server/http.mjs';
import { parseMakeDeliveryInput, DIRECT_FINAL_FORM_FIELDS } from '../../calibration-v3/server/make-delivery-transport.mjs';

function authorized(request) {
  const accepted = [process.env.CLARIS_MAKE_KEY, process.env.CLARIS_ADMIN_KEY]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!accepted.length) return false;

  const authorization = String(request.headers.get('authorization') || '').trim();
  const candidates = new Set([authorization]);
  const finalToken = authorization.split(/\s+/).filter(Boolean).at(-1);
  if (finalToken) candidates.add(finalToken);

  let stripped = authorization;
  for (let index = 0; index < 2; index += 1) {
    if (!/^Bearer\s+/i.test(stripped)) break;
    stripped = stripped.replace(/^Bearer\s+/i, '').trim();
    candidates.add(stripped);
  }
  const wrapped = stripped.match(/^<(.+)>$/s);
  if (wrapped?.[1]) candidates.add(wrapped[1].trim());

  return accepted.some((key) => candidates.has(key));
}

function envEnabled(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'enabled';
}

export function recoveryAttestationEnabled(env = process.env) {
  return envEnabled(env?.CLARIS_RECOVERY_ATTESTATION_V1);
}

export function directFinalProvenanceEnabled(env = process.env) {
  return envEnabled(env?.CLARIS_FINAL_PROVENANCE_V1);
}

// Preserve all existing package operations. Direct-final outbox actions share
// this authenticated endpoint instead of consuming another Vercel function.
export function createDeliveryGateway({
  authorize = authorized,
  directFinalOutboxProvider = async (request) => {
    const runtime = (await import('../../calibration-v3/server/api-shared.mjs')).serverContext();
    const { clarificationServerContext } = await import('../../clarification-v1/server/api-shared.mjs');
    return createDirectFinalOutbox({
      storage: runtime.storage,
      consultantRepository: runtime.repository,
      clarificationRepository: clarificationServerContext().repository,
      inviteBaseUrl: new URL('/clarification-v1/',request.url).toString(),
      requireFinalProvenance: directFinalProvenanceEnabled(),
      requireRecoveryAttestation: recoveryAttestationEnabled()
    });
  }
} = {}) {
  return {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    if (!authorize(request)) return json({ ok: false, error: 'MAKE_UNAUTHORIZED' }, 401);

    const declaredOperation = String(
      request.headers.get('x-claris-delivery') || ''
    ).trim();
    const parsed = await parseMakeDeliveryInput(
      request, parseJson, DIRECT_FINAL_FORM_FIELDS[declaredOperation]
    );
    if (!parsed.ok) return parsed.response;
    const operation = declaredOperation || String(parsed.value?.operation || '').trim();

    try {
      if (['direct_final_begin','direct_final_recover','direct_final_seal_prepare',
        'direct_final_claim','direct_final_ack',
        'direct_clarification_claim','direct_clarification_ack'].includes(operation)) {
        const outbox = await directFinalOutboxProvider(request);
        const result = operation === 'direct_final_begin'
          ? await outbox.begin(parsed.value)
          : operation === 'direct_final_recover'
            ? await outbox.recoverRegistered(parsed.value)
            : operation === 'direct_final_seal_prepare'
              ? await outbox.sealPrepare(parsed.value)
            : operation === 'direct_final_claim'
              ? await outbox.claim(parsed.value)
            : operation === 'direct_final_ack'
              ? await outbox.acknowledge(parsed.value)
              : operation === 'direct_clarification_claim'
                ? await outbox.claimInvite(parsed.value)
                : await outbox.acknowledgeInvite(parsed.value);
        const code = ['REGISTERED', 'RECOVERY_AUTHORIZED', 'PREPARE_SEALED',
          'CLAIMED', 'ACKNOWLEDGED', 'SKIPPED_ALREADY_SENT'].includes(result.status)
          ? 200
          : result.status === 'RECONCILIATION_REQUIRED' ? 409 : 422;
        return json(result, code);
      }
      const packageResult = buildDeliveryPackage(operation, parsed.value);
      return json({ ok: true, delivery: packageResult }, 200);
    } catch (error) {
      const code = error?.message || 'DELIVERY_PACKAGE_FAILED';
      const clientError = code.endsWith('_REQUIRED') || code === 'DELIVERY_OPERATION_INVALID';
      return json({ ok: false, error: code }, clientError ? 422 : 500);
    }
  }
  };
}

export default createDeliveryGateway();
