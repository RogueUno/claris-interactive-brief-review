import { serverContext } from '../../calibration-v3/server/api-shared.mjs';
import { json, methodNotAllowed, parseJson, sessionCookie } from '../../calibration-v3/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    const result = await serverContext().service.resolveInvite(parsed.value?.invite_token);
    if (!result.ok) return json(result, result.error === 'INVITE_EXPIRED' ? 410 : 401);
    return json({
      ok: true,
      identity: result.identity,
      resume_state: result.resume_state,
      profile_status: result.profile_status,
      runtime_v3: result.runtime_v3
    }, 200, { 'Set-Cookie': sessionCookie(result.session_token, result.session_expires_at) });
  }
};
