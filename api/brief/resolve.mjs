import { briefServerContext } from '../../brief-v1/server/api-shared.mjs';
import { briefSessionCookie, json, methodNotAllowed, parseJson } from '../../brief-v1/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    const result = await briefServerContext().service.resolve(parsed.value?.brief_token);
    if (!result.ok) {
      const status = ['BRIEF_EXPIRED', 'BRIEF_REVOKED', 'BRIEF_TOKEN_NOT_ACTIVE'].includes(result.error) ? 410 : 401;
      return json(result, status);
    }
    return json({ ok: true, brief: result.brief }, 200, {
      'Set-Cookie': briefSessionCookie(result.session_token, result.session_expires_at)
    });
  }
};
