import { json, methodNotAllowed, parseJson } from '../../../clarification-v1/server/http.mjs';
import { runClarificationProtocolStep } from '../../../clarification-v1/server/protocol.mjs';

const MAX_BODY_BYTES = 450_000;

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: 'REQUEST_TOO_LARGE' }, 413);
    }

    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;

    try {
      const result = runClarificationProtocolStep(parsed.value);
      const status = result.ok === false && result.status === 'BLOCKED' ? 422 : 200;
      return json(result, status);
    } catch (error) {
      const code = error?.message || 'CLARIFICATION_PROTOCOL_FAILED';
      const status = code.endsWith('_INVALID_JSON') || code.endsWith('_REQUIRED') ||
        code === 'CLARIFICATION_PROTOCOL_ACTION_INVALID' ||
        code === 'CLARIFICATION_TTL_INVALID'
        ? 400
        : code.startsWith('PREPARE_')
          ? 422
          : 500;
      return json({ ok: false, error: code }, status);
    }
  }
};
