import { clarificationServerContext } from '../../clarification-v1/server/api-shared.mjs';
import { triggerFinalizeContinuation } from '../../clarification-v1/server/finalize-continuation.mjs';
import { CLARIFICATION_SESSION_COOKIE, cookieValue, json, methodNotAllowed, parseJson } from '../../clarification-v1/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const token = cookieValue(request, CLARIFICATION_SESSION_COOKIE);
    if (!token) return json({ ok: false, error: 'SESSION_REQUIRED' }, 401);

    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;

    const result = await clarificationServerContext().service.submit(
      token,
      parsed.value?.answers,
      { expectedVersion: parsed.value?.opportunity_version ?? null }
    );

    if (result.ok) {
      const continuation = await triggerFinalizeContinuation(result.opportunity_id);
      if (!continuation.ok) {
        console.error('CLARIS_FINALIZE_CONTINUATION_FAILED', {
          opportunity_id: result.opportunity_id,
          error: continuation.error,
          status: continuation.status ?? null
        });
      }

      const { opportunity_id, ...publicResult } = result;
      return json(publicResult);
    }

    const status = ['CLARIFICATION_ALREADY_SUBMITTED', 'CLARIFICATION_CONFLICT', 'CLARIFICATION_NOT_OPEN'].includes(result.error)
      ? 409
      : result.error === 'CLARIFICATION_EXPIRED'
        ? 410
        : result.error?.startsWith('ANSWER_')
          ? 422
          : result.error === 'CLARIFICATION_NOT_FOUND'
            ? 404
            : 401;
    return json(result, status);
  }
};
