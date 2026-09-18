const MODES = new Set(['CONFIRM', 'CONTRAST', 'DISCOVER']);
const RESPONSE_TYPES = new Set(['SINGLE_CHOICE', 'MULTI_CHOICE', 'SHORT_TEXT', 'LONG_TEXT']);
const SOURCE_TYPES = new Set(['PUBLIC_WEB', 'BOOKING', 'CONSULTANT_INPUT', 'OTHER']);
const EVIDENCE_SUBJECTS = new Set(['PROSPECT', 'COMPANY', 'OPPORTUNITY']);

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
    source_type: sourceType,
    subject,
    ref: text(value?.ref, `QUESTION_EVIDENCE_${index}_REF`, 500)
  };
}

function normalizeQuestion(value, index) {
  const mode = String(value?.mode || '').trim().toUpperCase();
  if (!MODES.has(mode)) throw new Error(`QUESTION_${index}_MODE_INVALID`);

  const responseType = String(value?.response_type || '').trim().toUpperCase();
  if (!RESPONSE_TYPES.has(responseType)) throw new Error(`QUESTION_${index}_RESPONSE_TYPE_INVALID`);

  const questionId = id(value?.question_id || `q_${index + 1}`, `QUESTION_${index}_ID`);
  const options = Array.isArray(value?.options)
    ? value.options.map((option, optionIndex) => text(option, `QUESTION_${index}_OPTION_${optionIndex}`, 120))
    : [];

  if (['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(responseType)) {
    if (options.length < 2 || options.length > 8) throw new Error(`QUESTION_${index}_OPTIONS_INVALID`);
    if (new Set(options).size !== options.length) throw new Error(`QUESTION_${index}_OPTIONS_DUPLICATE`);
  } else if (options.length) {
    throw new Error(`QUESTION_${index}_OPTIONS_NOT_ALLOWED`);
  }

  const evidenceRefs = Array.isArray(value?.evidence_refs)
    ? value.evidence_refs.map(normalizeEvidenceRef)
    : [];

  if (mode !== 'DISCOVER' && evidenceRefs.length === 0) {
    throw new Error(`QUESTION_${index}_EVIDENCE_REQUIRED`);
  }

  return {
    question_id: questionId,
    mode,
    prompt: text(value?.prompt, `QUESTION_${index}_PROMPT`, 360),
    display_context: optionalText(value?.display_context, `QUESTION_${index}_DISPLAY_CONTEXT`, 420),
    response_type: responseType,
    options,
    required: value?.required !== false,
    evidence_refs: evidenceRefs
  };
}

export function normalizeClarificationPackage(input, { now = Date.now(), ttlMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 30 * 24 * 60 * 60 * 1000) {
    throw new Error('CLARIFICATION_TTL_INVALID');
  }

  const questions = Array.isArray(input?.questions) ? input.questions.map(normalizeQuestion) : [];
  if (questions.length > 8) throw new Error('CLARIFICATION_QUESTION_LIMIT_EXCEEDED');
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
    status: questions.length ? 'OPEN' : 'NO_CLARIFICATION',
    created_at: createdAt,
    expires_at: new Date(now + ttlMs).toISOString()
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
    questions: pkg.questions.map(({ evidence_refs, ...safeQuestion }) => safeQuestion)
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

function normalizeAnswer(question, raw) {
  const missing = raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0);
  if (missing) return null;

  let value;
  if (question.response_type === 'MULTI_CHOICE') {
    if (!Array.isArray(raw)) throw new Error(`ANSWER_TYPE_INVALID:${question.question_id}`);
    value = [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
    if (!value.length || value.some((item) => !question.options.includes(item))) {
      throw new Error(`ANSWER_OPTION_INVALID:${question.question_id}`);
    }
  } else if (question.response_type === 'SINGLE_CHOICE') {
    value = String(raw).trim();
    if (!question.options.includes(value)) throw new Error(`ANSWER_OPTION_INVALID:${question.question_id}`);
  } else {
    value = String(raw).trim();
    const max = question.response_type === 'SHORT_TEXT' ? 500 : 1500;
    if (!value || value.length > max) throw new Error(`ANSWER_TEXT_INVALID:${question.question_id}`);
  }

  return {
    question_id: question.question_id,
    mode: question.mode,
    source_class: 'PROSPECT_REPORTED',
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
  evidence_subjects: [...EVIDENCE_SUBJECTS]
});
