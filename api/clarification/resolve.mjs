import { clarificationServerContext } from '../../clarification-v1/server/api-shared.mjs';
import { clarificationSessionCookie, json, methodNotAllowed, parseJson } from '../../clarification-v1/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;

    const result = await clarificationServerContext().service.resolveInvite(parsed.value?.invite_token);
    if (!result.ok) {
      const status = ['INVITE_EXPIRED', 'CLARIFICATION_EXPIRED'].includes(result.error) ? 410 : 401;
      return json(result, status);
    }

    const { session_token, session_expires_at, ...body } = result;
    return json(body, 200, {
      'Set-Cookie': clarificationSessionCookie(session_token, session_expires_at)
    });
  }
};
