import { clarificationServerContext } from '../../../clarification-v1/server/api-shared.mjs';
import { bearerToken, json, methodNotAllowed, parseJson } from '../../../clarification-v1/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');

    const adminKey = process.env.CLARIS_ADMIN_KEY || '';
    if (!adminKey || bearerToken(request) !== adminKey) {
      return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
    }

    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    const opportunityId = String(parsed.value?.opportunity_id || '').trim();
    if (!opportunityId) return json({ ok: false, error: 'OPPORTUNITY_ID_REQUIRED' }, 400);
    const ttlDays = Math.max(1, Math.min(30, Number(parsed.value?.ttl_days || 7)));

    try {
      const result = await clarificationServerContext().service.reissueInvite(opportunityId, {
        ttlMs: ttlDays * 24 * 60 * 60 * 1000
      });
      if (!result.ok) {
        const status = ['CLARIFICATION_ALREADY_SUBMITTED', 'CLARIFICATION_NOT_OPEN', 'CLARIFICATION_CONFLICT'].includes(result.error)
          ? 409
          : result.error === 'CLARIFICATION_NOT_FOUND'
            ? 404
            : 400;
        return json(result, status);
      }

      const base = new URL('/clarification-v1/', request.url).toString();
      return json({
        ok: true,
        opportunity_id: result.opportunity_id,
        status: result.status,
        invite_url: `${base}#invite=${encodeURIComponent(result.invite_token)}`,
        expires_at: result.expires_at,
        opportunity_version: result.opportunity_version
      });
    } catch (error) {
      const code = error?.message === 'OPPORTUNITY_ID_INVALID'
        ? 'OPPORTUNITY_ID_INVALID'
        : 'CLARIFICATION_REISSUE_FAILED';
      return json({ ok: false, error: code }, code === 'OPPORTUNITY_ID_INVALID' ? 400 : 500);
    }
  }
};
