import { clarificationServerContext } from '../../../clarification-v1/server/api-shared.mjs';
import { bearerToken, json, methodNotAllowed, parseJson } from '../../../clarification-v1/server/http.mjs';
import { runClarificationProtocolStep } from '../../../clarification-v1/server/protocol.mjs';

const PROTOCOL_OPERATION = 'INTELLIGENCE_PROTOCOL';
const MAX_PROTOCOL_BODY_BYTES = 450_000;

async function handleIntelligenceProtocol(request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROTOCOL_BODY_BYTES) {
    return json({ ok: false, error: 'REQUEST_TOO_LARGE' }, 413);
  }

  const parsed = await parseJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const result = runClarificationProtocolStep(parsed.value);

    if (result.ok && result.status === 'READY' && result.clarification_package) {
      const ttlDays = Math.max(1, Math.min(30, Number(parsed.value?.ttl_days || 7)));
      const persisted = await clarificationServerContext().service.createPackage(
        result.clarification_package,
        { ttlMs: ttlDays * 24 * 60 * 60 * 1000 }
      );

      const base = new URL('/clarification-v1/', request.url).toString();
      return json({
        ...result,
        delivery: {
          persisted: true,
          requires_clarification: true,
          invite_url: persisted.invite_token
            ? `${base}#invite=${encodeURIComponent(persisted.invite_token)}`
            : null,
          expires_at: persisted.expires_at,
          opportunity_version: persisted.opportunity_version
        }
      }, 200);
    }

    if (result.ok && result.status === 'NO_CLARIFICATION') {
      return json({
        ...result,
        delivery: {
          persisted: false,
          requires_clarification: false,
          invite_url: null,
          expires_at: null,
          opportunity_version: null
        }
      }, 200);
    }

    const status = result.ok === false && result.status === 'BLOCKED' ? 422 : 200;
    return json(result, status);
  } catch (error) {
    const code = error?.code || error?.message || 'CLARIFICATION_PROTOCOL_FAILED';
    const status = code === 'OPPORTUNITY_ALREADY_EXISTS'
      ? 409
      : code.endsWith('_INVALID_JSON') || code.endsWith('_REQUIRED') ||
          code === 'CLARIFICATION_PROTOCOL_ACTION_INVALID' ||
          code === 'CLARIFICATION_PROTOCOL_VERSION_UNSUPPORTED' ||
          code === 'CLARIFICATION_TTL_INVALID'
        ? 400
        : code.startsWith('PREPARE_') || code.startsWith('CONSULTANT_SOT_')
          ? 422
          : 500;
    return json({ ok: false, error: code }, status);
  }
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');

    const adminKey = process.env.CLARIS_ADMIN_KEY || '';
    if (!adminKey || bearerToken(request) !== adminKey) {
      const authLikeHeaderNames = [...request.headers.keys()]
        .filter((name) => /auth|api|key/i.test(name))
        .sort();
      return json({
        ok: false,
        error: 'ADMIN_UNAUTHORIZED',
        diagnostic_auth_header_names: authLikeHeaderNames
      }, 401);
    }

    const operation = String(request.headers.get('x-claris-operation') || '').trim().toUpperCase();
    if (operation === PROTOCOL_OPERATION) {
      return handleIntelligenceProtocol(request);
    }

    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    const ttlDays = Math.max(1, Math.min(30, Number(parsed.value?.ttl_days || 7)));

    try {
      const result = await clarificationServerContext().service.createPackage(
        parsed.value?.package ?? parsed.value,
        { ttlMs: ttlDays * 24 * 60 * 60 * 1000 }
      );

      const base = new URL('/clarification-v1/', request.url).toString();
      return json({
        ok: true,
        opportunity_id: result.opportunity_id,
        status: result.status,
        requires_clarification: result.requires_clarification,
        question_count: result.question_count,
        invite_url: result.invite_token
          ? `${base}#invite=${encodeURIComponent(result.invite_token)}`
          : null,
        expires_at: result.expires_at,
        opportunity_version: result.opportunity_version
      }, 201);
    } catch (error) {
      const code = error?.code || error?.message || 'CLARIFICATION_PACKAGE_CREATE_FAILED';
      const body = { ok: false, error: code };
      if (error?.report) body.governance_report = error.report;
      if (error?.repair_plan) body.repair_plan = error.repair_plan;
      return json(
        body,
        code === 'OPPORTUNITY_ALREADY_EXISTS' ? 409 : code === 'CLARIFICATION_GOVERNANCE_FAILED' ? 422 : 400
      );
    }
  }
};
