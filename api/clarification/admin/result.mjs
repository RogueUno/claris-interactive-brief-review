import { clarificationServerContext } from '../../../clarification-v1/server/api-shared.mjs';
import { buildClarificationResult } from '../../../clarification-v1/server/result.mjs';
import { bearerToken, json, methodNotAllowed } from '../../../clarification-v1/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'GET') return methodNotAllowed('GET');

    const adminKey = process.env.CLARIS_ADMIN_KEY || '';
    if (!adminKey || bearerToken(request) !== adminKey) {
      return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
    }

    const opportunityId = String(new URL(request.url).searchParams.get('opportunity_id') || '').trim();
    if (!opportunityId) return json({ ok: false, error: 'OPPORTUNITY_ID_REQUIRED' }, 400);

    try {
      const loaded = await clarificationServerContext().repository.loadEnvelopeWithMeta(opportunityId);
      const result = buildClarificationResult(loaded.envelope, loaded.etag);
      const { http_status: status, ...body } = result;
      return json(body, status);
    } catch (error) {
      const code = error?.message === 'OPPORTUNITY_ID_INVALID'
        ? 'OPPORTUNITY_ID_INVALID'
        : 'CLARIFICATION_RESULT_FAILED';
      return json({ ok: false, error: code }, code === 'OPPORTUNITY_ID_INVALID' ? 400 : 500);
    }
  }
};
