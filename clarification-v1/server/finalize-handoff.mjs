import { buildClarificationResult } from './result.mjs';

const FINALIZE_CONTEXT_VERSION = 'claris_finalize_context_v1';
const FINALIZE_ANSWERS_VERSION = 'claris_finalize_prospect_answers_v1';

function requiredJsonText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field}_REQUIRED`);
  try { JSON.parse(text); }
  catch { throw new Error(`${field}_INVALID_JSON`); }
  return text;
}

export function buildFinalizeContext(input, { now = Date.now() } = {}) {
  return {
    schema_version: FINALIZE_CONTEXT_VERSION,
    case_state_json: requiredJsonText(input?.case_state_json, 'FINALIZE_CASE_STATE'),
    consultant_sot_json: requiredJsonText(input?.consultant_sot_json, 'FINALIZE_CONSULTANT_SOT'),
    captured_at: new Date(now).toISOString()
  };
}

function assertFinalizeContext(value) {
  if (!value || value.schema_version !== FINALIZE_CONTEXT_VERSION) {
    throw new Error('FINALIZE_CONTEXT_MISSING');
  }
  return {
    schema_version: FINALIZE_CONTEXT_VERSION,
    case_state_json: requiredJsonText(value.case_state_json, 'FINALIZE_CASE_STATE'),
    consultant_sot_json: requiredJsonText(value.consultant_sot_json, 'FINALIZE_CONSULTANT_SOT'),
    captured_at: value.captured_at || null
  };
}

function exactAnswer(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
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
  return {
    ok: true,
    http_status: 200,
    opportunity_id: clarification.opportunity_id,
    status: clarification.status,
    opportunity_version: clarification.opportunity_version || null,
    case_state_json: context.case_state_json,
    consultant_sot_json: context.consultant_sot_json,
    prospect_answers_json: JSON.stringify(prospectAnswers),
    prospect_answers: prospectAnswers
  };
}

export const finalizeHandoffContract = Object.freeze({
  context_version: FINALIZE_CONTEXT_VERSION,
  prospect_answers_version: FINALIZE_ANSWERS_VERSION
});
