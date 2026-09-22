import { buildDeliveryPackage } from '../../calibration-v3/server/pilot-delivery.mjs';
import { json, methodNotAllowed, parseJson } from '../../calibration-v3/server/http.mjs';

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

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    if (!authorized(request)) return json({ ok: false, error: 'MAKE_UNAUTHORIZED' }, 401);

    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;

    const operation = String(
      request.headers.get('x-claris-delivery') ||
      parsed.value?.operation ||
      ''
    ).trim();

    try {
      const packageResult = buildDeliveryPackage(operation, parsed.value);
      return json({ ok: true, delivery: packageResult }, 200);
    } catch (error) {
      const code = error?.message || 'DELIVERY_PACKAGE_FAILED';
      const clientError = code.endsWith('_REQUIRED') || code === 'DELIVERY_OPERATION_INVALID';
      return json({ ok: false, error: code }, clientError ? 422 : 500);
    }
  }
};
