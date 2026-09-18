import { auditClarificationDraft, buildClarificationRepairPlan } from './governance.mjs';

const MODES = new Set(['CONFIRM', 'CONTRAST', 'DISCOVER']);
const RESPONSE_TYPES = new Set(['SINGLE_CHOICE', 'MULTI_CHOICE', 'SHORT_TEXT', 'LONG_TEXT']);
const SOURCE_TYPES = new Set(['PUBLIC_WEB', 'BOOKING', 'CONSULTANT_INPUT', 'OTHER']);
const EVIDENCE_SUBJECTS = new Set(['PROSPECT', 'COMPANY', 'OPPORTUNITY']);
const OPTION_POSTURES = new Set(['EVIDENCE_DERIVED', 'INFERENCE', 'GENERIC_SAFE']);

function text(value, field, max = 240) {
  const out = String(value || '').trim();
  if (!out) throw new Error(`${field}_REQUIRED`);
  if (out.length > max) throw new Error(`${field}_TOO_LONG`);
  return out;
}

function optionalText(value, field, max = 320) {
  if (value == null || String(value).trim() === '') return null;
  return text(value, field, max);
}

function id(value, field) {
  const out = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(out)) throw new Error(`${field}_INVALID`);
  return out;
}

function normalizeEvidenceRef(value, index) {
  const sourceType = String(value?.source_type || '').trim().toUpperCase();
  if (!SOURCE_TYPES.has(sourceType)) throw new Error(`QUESTION_EVIDENCE_${index}_SOURCE_INVALID`);
  const subject = String(value?.subject || '').trim().toUpperCase();
  if (!EVIDENCE_SUBJECTS.has(subject)) throw new Error(`QUESTION_EVIDENCE_${index}_SUBJECT_INVALID`);
  return {
    evidence_id: id(value?.evidence_id || `evidence_${index + 1}`, `QUESTION_EVIDENCE_${index}_ID`),
    source_type: sourceType,
    subject,
    ref: text(value?.ref, `QUESTION_EVIDENCE_${index}_REF`, 500)
  };
}

function normalizeOption(value, questionIndex, optionIndex) {
  const posture = String(value?.posture || '').trim().toUpperCase();
  if (!OPTION_POSTURES.has(posture)) throw new Error(`QUESTION_${questionIndex}_OPTION_${optionIndex}_POSTURE_INVALID`);
  const basisIds = Array.isArray(value?.basis_ids)
    ? [...new Set(value.basis_ids.map((basisId) => id(basisId, `QUESTION_${questionIndex}_OPTION_${optionIndex}_BASIS_ID`)))]
    : [];

  return {
    option_id: id(value?.option_id || `option_${questionIndex + 1}_${optionIndex + 1}`, `QUESTION_${questionIndex}_OPTION_${optionIndex}_ID`),
    label: text(value?.label, `QUESTION_${questionIndex}_OPTION_${optionIndex}_LABEL`, 120),
    posture,
    basis_ids: basisIds
  };
}

function normalizeQuestion(value, index) {
  const mode = String(value?.mode || '').trim().toUpperCase();
  if (!MODES.has(mode)) throw new Error(`QUESTION_${index}_MODE_INVALID`);

  const responseType = String(value?.response_type || '').trim().toUpperCase();
  if (!RESPONSE_TYPES.has(responseType)) throw new Error(`QUESTION_${index}_RESPONSE_TYPE_INVALID`);

  const questionId = id(value?.question_id || `q_${index + 1}`, `QUESTION_${index}_ID`);
  const evidenceRefs = Array.isArray(value?.evidence_refs)
    ? value.evidence_refs.map(normalizeEvidenceRef)
    : [];

  if (mode !== 'DISCOVER' && evidenceRefs.length === 0) {
    throw new Error(`QUESTION_${index}_EVIDENCE_REQUIRED`);
  }

  const options = ['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(responseType)
    ? value.options.map((option, optionIndex) => normalizeOption(option, index, optionIndex))
    : [];

  return {
    question_id: questionId,
    mode,
    prompt: text(value?.prompt, `QUESTION_${index}_PROMPT`, 360),
    display_context: optionalText(value?.display_context, `QUESTION_${index}_DISPLAY_CONTEXT`, 420),
    response_type: responseType,
    options,
    allow_other: ['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(responseType) ? true : false,
    allow_unsure: ['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(responseType) ? value?.allow_unsure !== false : false,
    other_label: 'Something else',
    unsure_label: 'Not sure yet',
    friction_exception: value?.friction_exception || null,
    required: value?.required !== false,
    evidence_refs: evidenceRefs
  };
}

export class ClarificationGovernanceError extends Error {
  constructor(report) {
    super('CLARIFICATION_GOVERNANCE_FAILED');
    this.name = 'ClarificationGovernanceError';
    this.code = 'CLARIFICATION_GOVERNANCE_FAILED';
    this.report = report;
    this.repair_plan = buildClarificationRepairPlan(report);
  }
}

export function normalizeClarificationPackage(input, { now = Date.now(), ttlMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 30 * 24 * 60 * 60 * 1000) {
    throw new Error('CLARIFICATION_TTL_INVALID');
  }

  const governanceReport = auditClarificationDraft(input);
  if (!governanceReport.ok) throw new ClarificationGovernanceError(governanceReport);

  const questions = Array.isArray(input?.questions) ? input.questions.map(normalizeQuestion) : [];
  if (new Set(questions.map((question) => question.question_id)).size !== questions.length) {
    throw new Error('CLARIFICATION_QUESTION_IDS_DUPLICATE');
  }

  const createdAt = new Date(now).toISOString();
  return {
    schema_version: 'claris_clarification_package_v1',
    opportunity_id: id(input?.opportunity_id, 'OPPORTUNITY_ID'),
    consultant: {
      consultant_id: id(input?.consultant?.consultant_id, 'CONSULTANT_ID'),
      first_name: text(input?.consultant?.first_name, 'CONSULTANT_FIRST_NAME', 100),
      firm: text(input?.consultant?.firm, 'CONSULTANT_FIRM', 160)
    },
    prospect: {
      first_name: text(input?.prospect?.first_name, 'PROSPECT_FIRST_NAME', 100),
      role: optionalText(input?.prospect?.role, 'PROSPECT_ROLE', 160),
      company: text(input?.prospect?.company, 'PROSPECT_COMPANY', 180)
    },
    intro_context: optionalText(input?.intro_context, 'INTRO_CONTEXT', 420),
    questions,
    governance: {
      ...governanceReport,
      repair_plan: buildClarificationRepairPlan(governanceReport)
    },
    status: questions.length ? 'OPEN' : 'NO_CLARIFICATION',
    created_at: createdAt,
    expires_at: new Date(now + ttlMs).toISOString()
  };
}

function safePublicOption(option) {
  if (typeof option === 'string') {
    return { option_id: option, label: option };
  }
  return {
    option_id: option.option_id,
    label: option.label
  };
}

export function publicClarificationPackage(pkg) {
  if (!pkg) return null;
  return {
    schema_version: pkg.schema_version,
    opportunity_id: pkg.opportunity_id,
    consultant: { first_name: pkg.consultant.first_name, firm: pkg.consultant.firm },
    prospect: { first_name: pkg.prospect.first_name, role: pkg.prospect.role || null, company: pkg.prospect.company },
    intro_context: pkg.intro_context,
    status: pkg.status,
    expires_at: pkg.expires_at,
    questions: pkg.questions.map(({ evidence_refs, governance, friction_exception, ...safeQuestion }) => ({
      ...safeQuestion,
      options: (safeQuestion.options || []).map(safePublicOption)
    }))
  };
}

function answerMap(pkg, input) {
  if (!pkg || pkg.status !== 'OPEN') throw new Error('CLARIFICATION_NOT_OPEN');
  const values = Array.isArray(input) ? input : [];
  const byId = new Map();
  for (const item of values) {
    const questionId = String(item?.question_id || '').trim();
    if (!questionId || byId.has(questionId)) throw new Error('ANSWER_SET_INVALID');
    byId.set(questionId, item?.value);
  }

  for (const questionId of byId.keys()) {
    if (!pkg.questions.some((question) => question.question_id === questionId)) {
      throw new Error('ANSWER_UNKNOWN_QUESTION');
    }
  }
  return byId;
}

function optionRecord(question, optionIdOrLabel) {
  const raw = String(optionIdOrLabel || '').trim();
  return (question.options || []).find((option) => {
    if (typeof option === 'string') return option === raw;
    return option.option_id === raw || option.label === raw;
  }) || null;
}

function normalizeSingleChoice(question, raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const kind = String(raw.kind || '').trim().toUpperCase();
    if (kind === 'OTHER') {
      if (!question.allow_other) throw new Error(`ANSWER_OTHER_NOT_ALLOWED:${question.question_id}`);
      const value = String(raw.text || '').trim();
      if (!value || value.length > 500) throw new Error(`ANSWER_OTHER_TEXT_INVALID:${question.question_id}`);
      return {
        question_id: question.question_id,
        mode: question.mode,
        source_class: 'PROSPECT_REPORTED',
        answer_kind: 'OTHER',
        selected_option_id: null,
        value
      };
    }
    if (kind === 'UNSURE') {
      if (!question.allow_unsure) throw new Error(`ANSWER_UNSURE_NOT_ALLOWED:${question.question_id}`);
      return {
        question_id: question.question_id,
        mode: question.mode,
        source_class: 'PROSPECT_REPORTED',
        answer_kind: 'UNSURE',
        selected_option_id: null,
        value: question.unsure_label || 'Not sure yet'
      };
    }
    if (kind === 'OPTION') {
      raw = raw.option_id;
    }
  }

  const option = optionRecord(question, raw);
  if (!option) throw new Error(`ANSWER_OPTION_INVALID:${question.question_id}`);
  const optionId = typeof option === 'string' ? option : option.option_id;
  const label = typeof option === 'string' ? option : option.label;
  return {
    question_id: question.question_id,
    mode: question.mode,
    source_class: 'PROSPECT_REPORTED',
    answer_kind: 'OPTION',
    selected_option_id: optionId,
    value: label
  };
}

function normalizeAnswer(question, raw) {
  const missing = raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0);
  if (missing) return null;

  if (question.response_type === 'SINGLE_CHOICE') {
    return normalizeSingleChoice(question, raw);
  }

  if (question.response_type === 'MULTI_CHOICE') {
    if (!Array.isArray(raw)) throw new Error(`ANSWER_TYPE_INVALID:${question.question_id}`);
    const normalized = raw.map((item) => normalizeSingleChoice(question, item));
    const identities = normalized.map((item) => `${item.answer_kind}:${item.selected_option_id || item.value}`);
    if (new Set(identities).size !== identities.length) throw new Error(`ANSWER_DUPLICATE:${question.question_id}`);
    return {
      question_id: question.question_id,
      mode: question.mode,
      source_class: 'PROSPECT_REPORTED',
      answer_kind: 'MULTI',
      selected_option_id: null,
      value: normalized.map((item) => ({
        answer_kind: item.answer_kind,
        selected_option_id: item.selected_option_id,
        value: item.value
      }))
    };
  }

  const value = String(raw).trim();
  const max = question.response_type === 'SHORT_TEXT' ? 500 : 1500;
  if (!value || value.length > max) throw new Error(`ANSWER_TEXT_INVALID:${question.question_id}`);
  return {
    question_id: question.question_id,
    mode: question.mode,
    source_class: 'PROSPECT_REPORTED',
    answer_kind: 'TEXT',
    selected_option_id: null,
    value
  };
}

export function normalizeProspectProgress(pkg, input) {
  const byId = answerMap(pkg, input);
  return pkg.questions.flatMap((question) => {
    if (!byId.has(question.question_id)) return [];
    const answer = normalizeAnswer(question, byId.get(question.question_id));
    return answer ? [answer] : [];
  });
}

export function normalizeProspectAnswers(pkg, input) {
  const byId = answerMap(pkg, input);

  return pkg.questions.flatMap((question) => {
    const answer = normalizeAnswer(question, byId.get(question.question_id));
    if (!answer) {
      if (question.required) throw new Error(`ANSWER_REQUIRED:${question.question_id}`);
      return [];
    }
    return [answer];
  });
}

export const clarificationContract = Object.freeze({
  modes: [...MODES],
  response_types: [...RESPONSE_TYPES],
  source_types: [...SOURCE_TYPES],
  evidence_subjects: [...EVIDENCE_SUBJECTS],
  option_postures: [...OPTION_POSTURES]
});
