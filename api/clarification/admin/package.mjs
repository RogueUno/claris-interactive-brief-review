import { clarificationServerContext } from '../../../clarification-v1/server/api-shared.mjs';
import { json, methodNotAllowed, parseJson } from '../../../clarification-v1/server/http.mjs';
import { runClarificationProtocolStep } from '../../../clarification-v1/server/protocol.mjs';
import { buildFinalizeBundle, buildFinalizeContext } from '../../../clarification-v1/server/finalize-handoff.mjs';
import { renderFinalBrief } from '../../../clarification-v1/server/final-brief-renderer.mjs';

const PROTOCOL_OPERATION = 'INTELLIGENCE_PROTOCOL';
const FINALIZE_BUNDLE_OPERATION = 'FINALIZE_BUNDLE';
const RENDER_FINAL_BRIEF_OPERATION = 'RENDER_FINAL_BRIEF';
const MAX_PROTOCOL_BODY_BYTES = 450_000;

function adminAuthorized(request, acceptedKeys) {
  const keys = (Array.isArray(acceptedKeys) ? acceptedKeys : [acceptedKeys])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!keys.length) return false;

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

  return keys.some((key) => candidates.has(key));
}

async function handleFinalizeBundle(request) {
  const parsed = await parseJson(request);
  if (!parsed.ok) return parsed.response;

  const opportunityId = String(parsed.value?.opportunity_id || '').trim();
  if (!opportunityId) return json({ ok: false, error: 'OPPORTUNITY_ID_REQUIRED' }, 400);

  try {
    const loaded = await clarificationServerContext().repository.loadEnvelopeWithMeta(opportunityId);
    const result = buildFinalizeBundle(loaded.envelope, loaded.etag);
    const { http_status: status, ...body } = result;
    return json(body, status);
  } catch (error) {
    const code = error?.message === 'OPPORTUNITY_ID_INVALID'
      ? 'OPPORTUNITY_ID_INVALID'
      : 'FINALIZE_BUNDLE_FAILED';
    return json({ ok: false, error: code }, code === 'OPPORTUNITY_ID_INVALID' ? 400 : 500);
  }
}

async function handleRenderFinalBrief(request) {
  const parsed = await parseJson(request);
  if (!parsed.ok) return parsed.response;

  try {
    const artifact = parsed.value?.stage_output_json ?? parsed.value?.artifact ?? parsed.value;
    return json(renderFinalBrief(artifact), 200);
  } catch (error) {
    const code = error?.message || 'FINAL_BRIEF_RENDER_FAILED';
    const status = ['FINAL_ARTIFACT_REQUIRED', 'FINAL_ARTIFACT_INVALID', 'FINAL_ARTIFACT_INVALID_JSON'].includes(code)
      ? 400
      : 500;
    return json({ ok: false, error: code }, status);
  }
}

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
      const finalizeContext = buildFinalizeContext(parsed.value);
      const persisted = await clarificationServerContext().service.createPackage(
        result.clarification_package,
        {
          ttlMs: ttlDays * 24 * 60 * 60 * 1000,
          finalizeContext
        }
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

    const adminKey = String(process.env.CLARIS_ADMIN_KEY || '').trim();
    const makeKey = String(process.env.CLARIS_MAKE_KEY || '').trim();
    if (!adminAuthorized(request, [adminKey, makeKey])) {
      return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
    }

    const operation = String(request.headers.get('x-claris-operation') || '').trim().toUpperCase();
    if (operation === PROTOCOL_OPERATION) {
      return handleIntelligenceProtocol(request);
    }
    if (operation === FINALIZE_BUNDLE_OPERATION) {
      return handleFinalizeBundle(request);
    }
    if (operation === RENDER_FINAL_BRIEF_OPERATION) {
      return handleRenderFinalBrief(request);
    }

    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;
    const ttlDays = Math.max(1, Math.min(30, Number(parsed.value?.ttl_days || 7)));

    try {
      const directPackage = parsed.value?.package ?? parsed.value;
      const finalizeContext = parsed.value?.finalize_context
        ? buildFinalizeContext(parsed.value.finalize_context)
        : null;
      const result = await clarificationServerContext().service.createPackage(
        directPackage,
        {
          ttlMs: ttlDays * 24 * 60 * 60 * 1000,
          finalizeContext
        }
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
