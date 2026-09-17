import { serverContext } from '../../calibration-v3/server/api-shared.mjs';
import { cookieValue, json, methodNotAllowed, parseJson } from '../../calibration-v3/server/http.mjs';

export default {
  async fetch(request) {
    const token = cookieValue(request, 'claris_cal_session');
    if (!token) return json({ ok: false, error: 'SESSION_REQUIRED' }, 401);
    if (request.method === 'GET') {
      const result = await serverContext().service.load(token);
      return json(result, result.ok ? 200 : 401);
    }
    if (request.method === 'PUT') {
      const parsed = await parseJson(request);
      if (!parsed.ok) return parsed.response;
      const result = await serverContext().service.saveProgress(token, parsed.value?.calibration_state);
      const status = result.ok ? 200 : result.error === 'PROFILE_LOCKED' ? 409 : 400;
      return json(result, status);
    }
    return methodNotAllowed('GET, PUT');
  }
};
