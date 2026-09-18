import { clarificationServerContext } from '../../clarification-v1/server/api-shared.mjs';
import { CLARIFICATION_SESSION_COOKIE, cookieValue, json, methodNotAllowed } from '../../clarification-v1/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const token = cookieValue(request, CLARIFICATION_SESSION_COOKIE);
    if (!token) return json({ ok: false, error: 'SESSION_REQUIRED' }, 401);

    const result = await clarificationServerContext().service.load(token);
    if (result.ok) return json(result);

    const status = result.error === 'CLARIFICATION_EXPIRED'
      ? 410
      : result.error === 'CLARIFICATION_NOT_FOUND'
        ? 404
        : 401;
    return json(result, status);
  }
};
