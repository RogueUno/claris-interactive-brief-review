import { clarificationServerContext } from '../../../clarification-v1/server/api-shared.mjs';
import { buildFinalizeBundle } from '../../../clarification-v1/server/finalize-handoff.mjs';
import { json, methodNotAllowed } from '../../../clarification-v1/server/http.mjs';

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

    const adminKey = String(process.env.CLARIS_ADMIN_KEY || '').trim();
    const makeKey = String(process.env.CLARIS_MAKE_KEY || '').trim();
    if (!adminAuthorized(request, [adminKey, makeKey])) {
      return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
    }

    const opportunityId = String(new URL(request.url).searchParams.get('opportunity_id') || '').trim();
    if (!opportunityId) return json({ ok: false, error: 'OPPORTUNITY_ID_REQUIRED' }, 400);

    try {
      const loaded = await clarificationServerContext().repository.loadEnvelopeWithMeta(opportunityId);
      const result = buildFinalizeBundle(loaded.envelope, loaded.etag);
      const { http_status: status, ...body } = result;
      return json(body, status);
    } catch (error) {
      const code = error?.message === 'OPPORTUNITY_ID_INVALID'
        ? 'OPPORTUNITY_ID_INVALID'
        : 'FINALIZE_BUNDLE_FAILED';
      return json({ ok: false, error: code }, code === 'OPPORTUNITY_ID_INVALID' ? 400 : 500);
    }
  }
};
