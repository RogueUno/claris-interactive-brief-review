import { briefServerContext } from '../../brief-v1/server/api-shared.mjs';
import { cookieValue, json, methodNotAllowed } from '../../brief-v1/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const token = cookieValue(request, 'claris_brief_session');
    if (!token) return json({ ok: false, error: 'BRIEF_SESSION_REQUIRED' }, 401);
    const result = await briefServerContext().service.load(token);
    if (!result.ok) {
      const status = ['BRIEF_EXPIRED', 'BRIEF_REVOKED'].includes(result.error) ? 410 : 401;
      return json(result, status);
    }
    return json(result, 200);
  }
};
