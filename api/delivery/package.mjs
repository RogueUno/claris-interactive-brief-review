import { buildDeliveryPackage } from '../../calibration-v3/server/pilot-delivery.mjs';
import { json, methodNotAllowed, parseJson, cookieValue } from '../../calibration-v3/server/http.mjs';
import { briefServerContext } from '../../brief-v1/server/api-shared.mjs';
import { briefSessionCookie } from '../../brief-v1/server/http.mjs';

function authorized(request) {
  const accepted = [process.env.CLARIS_MAKE_KEY, process.env.CLARIS_ADMIN_KEY]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!accepted.length) return false;

  const authorization = String(request.headers.get('authorization') || '').trim();
  const candidates = new Set([authorization]);
  const finalToken = authorization.split(/\s+/).filter(Boolean).at(-1);
  if (finalToken) candidates.add(finalToken);

  let stripped = authorization;
  for (let index = 0; index < 2; index += 1) {
    if (!/^Bearer\s+/i.test(stripped)) break;
    stripped = stripped.replace(/^Bearer\s+/i, '').trim();
    candidates.add(stripped);
  }
  const wrapped = stripped.match(/^<(.+)>$/s);
  if (wrapped?.[1]) candidates.add(wrapped[1].trim());

  return accepted.some((key) => candidates.has(key));
}

function operationFrom(request, body) {
  return String(
    request.headers.get('x-claris-delivery') ||
    body?.operation ||
    ''
  ).trim();
}

async function handleBriefOperation(request, operation, body) {
  const service = briefServerContext().service;

  if (operation === 'brief_resolve') {
    const result = await service.resolve(body?.brief_token);
    if (!result.ok) {
      const status = ['BRIEF_EXPIRED', 'BRIEF_REVOKED', 'BRIEF_TOKEN_NOT_ACTIVE'].includes(result.error) ? 410 : 401;
      return json(result, status);
    }
    return json({ ok: true, brief: result.brief }, 200, {
      'Set-Cookie': briefSessionCookie(result.session_token, result.session_expires_at)
    });
  }

  if (operation === 'brief_data') {
    const token = cookieValue(request, 'claris_brief_session');
    if (!token) return json({ ok: false, error: 'BRIEF_SESSION_REQUIRED' }, 401);
    const result = await service.load(token);
    if (!result.ok) {
      const status = ['BRIEF_EXPIRED', 'BRIEF_REVOKED'].includes(result.error) ? 410 : 401;
      return json(result, status);
    }
    return json(result, 200);
  }

  if (operation === 'brief_create') {
    if (!authorized(request)) return json({ ok: false, error: 'MAKE_UNAUTHORIZED' }, 401);
    const days = Math.max(1, Math.min(30, Number(body?.ttl_days || 7)));
    const created = await service.create({
      consultantId: body?.consultant_id,
      company: body?.company,
      payload: body?.brief_payload,
      validationContext: body?.validation_context,
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
  }

  if (operation === 'brief_revoke') {
    if (!authorized(request)) return json({ ok: false, error: 'MAKE_UNAUTHORIZED' }, 401);
    try {
      const result = await service.revoke(body?.brief_id);
      return json(result, result.ok ? 200 : 404);
    } catch (error) {
      return json({ ok: false, error: error?.message || 'BRIEF_REVOKE_FAILED' }, 400);
    }
  }

  return null;
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');

    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    const operation = operationFrom(request, parsed.value);

    try {
      if (operation.startsWith('brief_')) {
        const briefResponse = await handleBriefOperation(request, operation, parsed.value);
        if (briefResponse) return briefResponse;
        return json({ ok: false, error: 'BRIEF_OPERATION_INVALID' }, 422);
      }

      if (!authorized(request)) return json({ ok: false, error: 'MAKE_UNAUTHORIZED' }, 401);
      const packageResult = buildDeliveryPackage(operation, parsed.value);
      return json({ ok: true, delivery: packageResult }, 200);
    } catch (error) {
      const code = error?.message || 'DELIVERY_PACKAGE_FAILED';
      const clientError = code.endsWith('_REQUIRED') || code === 'DELIVERY_OPERATION_INVALID';
      return json({ ok: false, error: code }, clientError ? 422 : 500);
    }
  }
};
