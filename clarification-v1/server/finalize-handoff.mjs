import { createHash } from 'node:crypto';
import { buildClarificationResult } from './result.mjs';

const FINALIZE_CONTEXT_VERSION = 'claris_finalize_context_v1';
const FINALIZE_ANSWERS_VERSION = 'claris_finalize_prospect_answers_v1';
const FINALIZE_PROVENANCE_VERSION = 'claris_finalize_provenance_v1';

function requiredJsonText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field}_REQUIRED`);
  try { JSON.parse(text); }
  catch { throw new Error(`${field}_INVALID_JSON`); }
  return text;
}

// Admin-only identity binding; never part of publicClarificationPackage or prospect answers.
function deliveryOwner(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null; // Old clarification envelopes remain readable and fail closed at delivery.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new Error('FINALIZE_DELIVERY_EMAIL_INVALID');
  }
  return raw;
}
function consultantId(value) {
  const raw = String(value ?? '').trim();
  if (raw && !/^[A-Za-z0-9_-]{3,80}$/.test(raw)) {
    throw new Error('FINALIZE_CONSULTANT_ID_INVALID');
  }
  return raw || null;
}

export function buildFinalizeContext(input, { now = Date.now() } = {}) {
  const ownerId = consultantId(input?.consultant?.consultant_id || input?.consultant_id);
  const nestedId = consultantId(input?.consultant?.consultant_id);
  const declaredId = consultantId(input?.consultant_id);
  if (nestedId && declaredId && nestedId !== declaredId) {
    throw new Error('FINALIZE_CONSULTANT_ID_MISMATCH');
  }
  const ownerEmail = deliveryOwner(input?.consultant_delivery_email);
  if (ownerEmail && !ownerId) throw new Error('FINALIZE_CONSULTANT_ID_REQUIRED');
  return {
    schema_version: FINALIZE_CONTEXT_VERSION,
    case_state_json: requiredJsonText(input?.case_state_json, 'FINALIZE_CASE_STATE'),
    consultant_sot_json: requiredJsonText(input?.consultant_sot_json, 'FINALIZE_CONSULTANT_SOT'),
    consultant_id: ownerId,
    consultant_delivery_email: ownerEmail,
    captured_at: new Date(now).toISOString()
  };
}

function assertFinalizeContext(value) {
  if (!value || value.schema_version !== FINALIZE_CONTEXT_VERSION) {
    throw new Error('FINALIZE_CONTEXT_MISSING');
  }
  const ownerId = consultantId(value.consultant_id);
  const ownerEmail = deliveryOwner(value.consultant_delivery_email);
  if (ownerEmail && !ownerId) throw new Error('FINALIZE_CONSULTANT_ID_REQUIRED');
  return {
    schema_version: FINALIZE_CONTEXT_VERSION,
    case_state_json: requiredJsonText(value.case_state_json, 'FINALIZE_CASE_STATE'),
    consultant_sot_json: requiredJsonText(value.consultant_sot_json, 'FINALIZE_CONSULTANT_SOT'),
    consultant_id: ownerId,
    consultant_delivery_email: ownerEmail,
    captured_at: value.captured_at || null
  };
}

function exactAnswer(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function canonicalJson(value) {
  function walk(item) {
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, walk(item[key])]));
    }
    return item;
  }
  return JSON.stringify(walk(value));
}
function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value), 'utf8').digest('hex');
}
function finalizeProvenance({ opportunityId, opportunityVersion, context, prospectAnswers }) {
  const version = String(opportunityVersion || '').trim();
  if (!version) throw new Error('FINALIZE_OPPORTUNITY_VERSION_REQUIRED');
  const payload = {
    schema_version: FINALIZE_PROVENANCE_VERSION,
    opportunity_id: opportunityId,
    opportunity_version: version,
    consultant_id: context.consultant_id,
    accepted_answer_count: prospectAnswers.answers.length,
    clarification_required: prospectAnswers.clarification_required === true,
    submitted_at: prospectAnswers.submitted_at || null,
    case_state_sha256: digest(context.case_state_json),
    consultant_sot_sha256: digest(context.consultant_sot_json),
    prospect_answers_sha256: digest(prospectAnswers)
  };
  return {
    ...payload,
    digest: digest(payload)
  };
}

export function buildFinalizeProspectAnswers(clarificationResult) {
  const result = clarificationResult?.clarification_result;
  if (!result) throw new Error('CLARIFICATION_RESULT_REQUIRED');

  return {
    schema_version: FINALIZE_ANSWERS_VERSION,
    opportunity_id: clarificationResult.opportunity_id,
    clarification_required: result.required === true,
    source_class: result.source_class || null,
    submitted_at: result.submitted_at || null,
    answers: (result.answers || []).map((answer) => ({
      question_id: answer.question_id,
      prompt: answer.prompt || null,
      mode: answer.mode || null,
      answer_kind: answer.answer_kind || null,
      selected_option_id: answer.selected_option_id || null,
      selected_option_postures: [...(answer.selected_option_postures || [])],
      answer_exact: exactAnswer(answer.value),
      value: answer.value,
      question_evidence_refs: [...(answer.question_evidence_refs || [])],
      basis_evidence_refs: [...(answer.basis_evidence_refs || [])],
      source_class: 'PROSPECT_REPORTED'
    }))
  };
}

export function buildFinalizeBundle(envelope, opportunityVersion = null) {
  const clarification = buildClarificationResult(envelope, opportunityVersion);
  if (!clarification.ok) return clarification;

  let context;
  try {
    context = assertFinalizeContext(envelope?.finalize_context);
    const persistedOwnerId = consultantId(envelope?.package?.consultant?.consultant_id);
    if (context.consultant_id && persistedOwnerId !== context.consultant_id) {
      throw new Error('FINALIZE_CONSULTANT_ID_MISMATCH');
    }
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'FINALIZE_CONTEXT_INVALID',
      http_status: 409,
      opportunity_id: clarification.opportunity_id,
      status: clarification.status
    };
  }

  const prospectAnswers = buildFinalizeProspectAnswers(clarification);
  let provenance;
  try {
    provenance = finalizeProvenance({
      opportunityId: clarification.opportunity_id,
      opportunityVersion: clarification.opportunity_version,
      context,
      prospectAnswers
    });
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'FINALIZE_PROVENANCE_INVALID',
      http_status: 409,
      opportunity_id: clarification.opportunity_id,
      status: clarification.status
    };
  }
  return {
    ok: true,
    http_status: 200,
    opportunity_id: clarification.opportunity_id,
    status: clarification.status,
    opportunity_version: clarification.opportunity_version || null,
    case_state_json: context.case_state_json,
    consultant_sot_json: context.consultant_sot_json,
    consultant_id: context.consultant_id,
    consultant_delivery_email: context.consultant_delivery_email,
    prospect_answers_json: JSON.stringify(prospectAnswers),
    prospect_answers: prospectAnswers,
    finalize_provenance: provenance,
    finalize_provenance_digest: provenance.digest
  };
}

export const finalizeHandoffContract = Object.freeze({
  context_version: FINALIZE_CONTEXT_VERSION,
  prospect_answers_version: FINALIZE_ANSWERS_VERSION,
  provenance_version: FINALIZE_PROVENANCE_VERSION
});
