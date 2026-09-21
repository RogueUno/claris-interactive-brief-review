import { serverContext } from '../../../calibration-v3/server/api-shared.mjs';
import { buildRuntimeV3Export } from '../../../calibration-v3/server/runtime-export.mjs';
import { json, methodNotAllowed } from '../../../calibration-v3/server/http.mjs';

function adminAuthorized(request, acceptedKeys) {
  const keys = (Array.isArray(acceptedKeys) ? acceptedKeys : [acceptedKeys])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!keys.length) return false;

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

  return keys.some((key) => candidates.has(key));
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return methodNotAllowed('GET');

    const adminKey = process.env.CLARIS_ADMIN_KEY || '';
    const makeKey = process.env.CLARIS_MAKE_KEY || '';
    if (!adminAuthorized(request, [adminKey, makeKey])) {
      return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
    }

    const url = new URL(request.url);
    const consultantId = String(url.searchParams.get('consultant_id') || '').trim();
    if (!consultantId) {
      return json({ ok: false, error: 'CONSULTANT_ID_REQUIRED' }, 400);
    }

    try {
      const { envelope, etag } = await serverContext().repository.loadProfileEnvelopeWithMeta(consultantId);
      const result = buildRuntimeV3Export(envelope, etag);
      const { http_status: status, ...body } = result;
      return json(body, status);
    } catch (error) {
      const code = error?.message === 'INVALID_CONSULTANT_ID'
        ? 'INVALID_CONSULTANT_ID'
        : 'RUNTIME_V3_EXPORT_FAILED';
      return json({ ok: false, error: code }, code === 'INVALID_CONSULTANT_ID' ? 400 : 500);
    }
  }
};
