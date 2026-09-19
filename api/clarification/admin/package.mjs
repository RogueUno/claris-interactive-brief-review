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

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');

    const operation = String(request.headers.get('x-claris-operation') || '').trim().toUpperCase();
    if (operation === PROTOCOL_OPERATION) {
      return handleIntelligenceProtocol(request);
    }

    const adminKey = process.env.CLARIS_ADMIN_KEY || '';
    if (!adminKey || bearerToken(request) !== adminKey) {
      return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
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
