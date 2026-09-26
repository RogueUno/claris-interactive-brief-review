import { briefServerContext } from '../../../brief-v1/server/api-shared.mjs';
import { bearerToken, json, methodNotAllowed, parseJson } from '../../../brief-v1/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const adminKey = process.env.CLARIS_ADMIN_KEY || '';
    if (!adminKey || bearerToken(request) !== adminKey) return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    const days = Math.max(1, Math.min(30, Number(parsed.value?.ttl_days || 7)));
    try {
      const created = await briefServerContext().service.create({
        consultantId: parsed.value?.consultant_id,
        company: parsed.value?.company,
        payload: parsed.value?.brief_payload,
        validationContext: parsed.value?.validation_context,
        ttlMs: days * 24 * 60 * 60 * 1000
      });
      if (!created?.brief) return json(created, 422);
      const configured = String(process.env.CLARIS_BRIEF_BASE_URL || '').trim();
      const base = (configured || `${new URL(request.url).origin}/brief-v1/`).replace(/\/?$/, '/');
      return json({
        ok: true,
        brief_id: created.brief.brief_id,
        brief_token: created.token,
        brief_url: `${base}#brief=${encodeURIComponent(created.token)}`,
        expires_at: created.brief.expires_at
      }, 201);
    } catch (error) {
      return json({ ok: false, error: error?.message || 'BRIEF_CREATE_FAILED' }, 400);
    }
  }
};
