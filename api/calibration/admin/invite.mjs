import { serverContext } from '../../../calibration-v3/server/api-shared.mjs';
import { bearerToken, json, methodNotAllowed, parseJson } from '../../../calibration-v3/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const adminKey = process.env.CLARIS_ADMIN_KEY || '';
    if (!adminKey || bearerToken(request) !== adminKey) return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    const days = Math.max(1, Math.min(30, Number(parsed.value?.ttl_days || 14)));
    try {
      const created = await serverContext().repository.createInvite(parsed.value?.identity, {
        ttlMs: days * 24 * 60 * 60 * 1000,
        seedState: parsed.value?.seed_state ?? null
      });
      const base = String(process.env.CLARIS_CALIBRATION_BASE_URL || '').replace(/\/?$/, '/');
      return json({
        ok: true,
        invite_token: created.token,
        invite_url: base ? `${base}#invite=${encodeURIComponent(created.token)}` : null,
        expires_at: created.invite.expires_at,
        consultant_id: created.invite.consultant_id,
        seeded: Boolean(created.invite.seed_state)
      }, 201);
    } catch (error) {
      return json({ ok: false, error: error?.message || 'INVITE_CREATE_FAILED' }, 400);
    }
  }
};
