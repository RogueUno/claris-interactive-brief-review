import { briefServerContext } from '../../../brief-v1/server/api-shared.mjs';
import { bearerToken, json, methodNotAllowed, parseJson } from '../../../brief-v1/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const adminKey = process.env.CLARIS_ADMIN_KEY || '';
    if (!adminKey || bearerToken(request) !== adminKey) return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    try {
      const result = await briefServerContext().service.revoke(parsed.value?.brief_id);
      return json(result, result.ok ? 200 : 404);
    } catch (error) {
      return json({ ok: false, error: error?.message || 'BRIEF_REVOKE_FAILED' }, 400);
    }
  }
};
