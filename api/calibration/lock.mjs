import { serverContext } from '../../calibration-v3/server/api-shared.mjs';
import { cookieValue, json, methodNotAllowed, parseJson } from '../../calibration-v3/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const token = cookieValue(request, 'claris_cal_session');
    if (!token) return json({ ok: false, error: 'SESSION_REQUIRED' }, 401);
    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    const result = await serverContext().service.lock(token, parsed.value?.calibration_state);
    const status = result.ok
      ? 200
      : result.error === 'PROFILE_LOCKED'
        ? 409
        : result.error === 'PROFILE_VALIDATION_FAILED'
          ? 422
          : 400;
    return json(result, status);
  }
};
