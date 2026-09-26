import { buildDeliveryPackage } from '../../calibration-v3/server/pilot-delivery.mjs';
import { json, methodNotAllowed, parseJson, cookieValue } from '../../calibration-v3/server/http.mjs';
import { briefServerContext } from '../../brief-v1/server/api-shared.mjs';
import { briefSessionCookie } from '../../brief-v1/server/http.mjs';

function normalizeAcceptedKeys(values = []) {
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function authorized(request, acceptedKeys) {
  const accepted = normalizeAcceptedKeys(acceptedKeys);
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

function defaultAcceptedKeys() {
  return [process.env.CLARIS_MAKE_KEY, process.env.CLARIS_ADMIN_KEY];
}

function defaultBriefBaseUrl(request) {
  const configured = String(process.env.CLARIS_BRIEF_BASE_URL || '').trim();
  return (configured || `${new URL(request.url).origin}/brief-v1/`).replace(/\/?$/, '/');
}

export function createDeliveryGateway({
  briefServiceProvider = () => briefServerContext().service,
  deliveryBuilder = buildDeliveryPackage,
  acceptedKeysProvider = defaultAcceptedKeys,
  briefBaseUrlProvider = defaultBriefBaseUrl
} = {}) {
  async function handleBriefOperation(request, operation, body) {
    const service = briefServiceProvider();

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
      if (!authorized(request, acceptedKeysProvider())) return json({ ok: false, error: 'MAKE_UNAUTHORIZED' }, 401);
      const days = Math.max(1, Math.min(30, Number(body?.ttl_days || 7)));
      const created = await service.create({
        consultantId: body?.consultant_id,
        company: body?.company,
        payload: body?.brief_payload,
        validationContext: body?.validation_context,
        ttlMs: days * 24 * 60 * 60 * 1000
      });
      if (!created?.brief) return json(created, 422);
      const base = briefBaseUrlProvider(request);
      return json({
        ok: true,
        brief_id: created.brief.brief_id,
        brief_token: created.token,
        brief_url: `${base}#brief=${encodeURIComponent(created.token)}`,
        expires_at: created.brief.expires_at
      }, 201);
    }

    if (operation === 'brief_revoke') {
      if (!authorized(request, acceptedKeysProvider())) return json({ ok: false, error: 'MAKE_UNAUTHORIZED' }, 401);
      try {
        const result = await service.revoke(body?.brief_id);
        return json(result, result.ok ? 200 : 404);
      } catch (error) {
        return json({ ok: false, error: error?.message || 'BRIEF_REVOKE_FAILED' }, 400);
      }
    }

    return null;
  }

  return {
    async fetch(request) {
      if (request.method !== 'POST') return methodNotAllowed('POST');

      const headerOperation = String(request.headers.get('x-claris-delivery') || '').trim();

      if (headerOperation === 'brief_resolve' || headerOperation === 'brief_data') {
        const parsed = await parseJson(request);
        if (!parsed.ok) return parsed.response;
        try {
          const briefResponse = await handleBriefOperation(request, headerOperation, parsed.value);
          return briefResponse || json({ ok: false, error: 'BRIEF_OPERATION_INVALID' }, 422);
        } catch (error) {
          return json({ ok: false, error: error?.message || 'BRIEF_OPERATION_FAILED' }, 500);
        }
      }

      if (!authorized(request, acceptedKeysProvider())) return json({ ok: false, error: 'MAKE_UNAUTHORIZED' }, 401);

      const parsed = await parseJson(request);
      if (!parsed.ok) return parsed.response;
      const operation = headerOperation || String(parsed.value?.operation || '').trim();

      try {
        if (operation === 'brief_create' || operation === 'brief_revoke') {
          const briefResponse = await handleBriefOperation(request, operation, parsed.value);
          return briefResponse || json({ ok: false, error: 'BRIEF_OPERATION_INVALID' }, 422);
        }

        const packageResult = deliveryBuilder(operation, parsed.value);
        return json({ ok: true, delivery: packageResult }, 200);
      } catch (error) {
        const code = error?.message || 'DELIVERY_PACKAGE_FAILED';
        const clientError = code.endsWith('_REQUIRED') || code === 'DELIVERY_OPERATION_INVALID';
        return json({ ok: false, error: code }, clientError ? 422 : 500);
      }
    }
  };
}

export default createDeliveryGateway();
