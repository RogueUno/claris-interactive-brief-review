const CHOICE_TYPES = new Set(['SINGLE_CHOICE', 'MULTI_CHOICE']);
const OPTION_POSTURES = new Set(['EVIDENCE_DERIVED', 'INFERENCE', 'GENERIC_SAFE']);
const TEXT_EXCEPTION_REASONS = new Set([
  'PROSPECT_LANGUAGE_REQUIRED',
  'UNBOUNDED_CONTEXT_REQUIRED'
]);
const MAX_QUESTIONS = 4;
const MAX_AUTHORED_OPTIONS = 5;

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function questionEvidenceIds(question) {
  return new Set(
    (Array.isArray(question?.evidence_refs) ? question.evidence_refs : [])
      .map((ref) => String(ref?.evidence_id || '').trim())
      .filter(Boolean)
  );
}

export function auditClarificationDraft(input) {
  const violations = [];
  const questions = Array.isArray(input?.questions) ? input.questions : [];

  if (questions.length > MAX_QUESTIONS) {
    violations.push({
      code: 'QUESTION_BUDGET_EXCEEDED',
      path: 'questions',
      detail: `Prospect clarification is capped at ${MAX_QUESTIONS} questions.`
    });
  }

  questions.forEach((question, index) => {
    const path = `questions[${index}]`;
    const responseType = String(question?.response_type || '').trim().toUpperCase();
    const options = Array.isArray(question?.options) ? question.options : [];
    const evidenceIds = questionEvidenceIds(question);

    if (CHOICE_TYPES.has(responseType)) {
      if (options.length < 2) {
        violations.push({ code: 'TOO_FEW_GUIDED_OPTIONS', path: `${path}.options`, detail: 'At least two guided choices are required.' });
      }
      if (options.length > MAX_AUTHORED_OPTIONS) {
        violations.push({ code: 'TOO_MANY_GUIDED_OPTIONS', path: `${path}.options`, detail: `No more than ${MAX_AUTHORED_OPTIONS} authored choices are allowed.` });
      }
      if (question?.allow_other !== true) {
        violations.push({ code: 'OTHER_ESCAPE_REQUIRED', path: `${path}.allow_other`, detail: 'Guided questions must let the prospect provide another answer.' });
      }

      const labels = new Set();
      options.forEach((option, optionIndex) => {
        const optionPath = `${path}.options[${optionIndex}]`;
        if (!option || typeof option !== 'object' || Array.isArray(option)) {
          violations.push({ code: 'OPTION_METADATA_REQUIRED', path: optionPath, detail: 'Guided options must carry provenance metadata.' });
          return;
        }

        const label = norm(option.label);
        if (!label) {
          violations.push({ code: 'OPTION_LABEL_REQUIRED', path: `${optionPath}.label`, detail: 'Option label is required.' });
        } else if (labels.has(label)) {
          violations.push({ code: 'OPTION_DUPLICATE', path: `${optionPath}.label`, detail: 'Duplicate or near-identical option label.' });
        } else {
          labels.add(label);
        }

        const posture = String(option.posture || '').trim().toUpperCase();
        if (!OPTION_POSTURES.has(posture)) {
          violations.push({ code: 'OPTION_POSTURE_INVALID', path: `${optionPath}.posture`, detail: 'Option posture must be EVIDENCE_DERIVED, INFERENCE, or GENERIC_SAFE.' });
          return;
        }

        const basisIds = Array.isArray(option.basis_ids)
          ? [...new Set(option.basis_ids.map((value) => String(value || '').trim()).filter(Boolean))]
          : [];

        if (posture === 'GENERIC_SAFE') {
          if (basisIds.length) {
            violations.push({ code: 'GENERIC_OPTION_HAS_BASIS', path: `${optionPath}.basis_ids`, detail: 'Generic-safe choices must not pretend to be evidence-derived.' });
          }
        } else {
          if (!basisIds.length) {
            violations.push({ code: 'OPTION_BASIS_REQUIRED', path: `${optionPath}.basis_ids`, detail: 'Evidence-derived and inferred choices require basis IDs.' });
          }
          for (const basisId of basisIds) {
            if (!evidenceIds.has(basisId)) {
              violations.push({ code: 'OPTION_BASIS_UNKNOWN', path: `${optionPath}.basis_ids`, detail: `Unknown evidence basis: ${basisId}` });
            }
          }
        }
      });
    } else {
      const exception = question?.friction_exception;
      const reason = String(exception?.reason || '').trim().toUpperCase();
      const rationale = String(exception?.rationale || '').trim();
      if (!TEXT_EXCEPTION_REASONS.has(reason) || rationale.length < 12) {
        violations.push({
          code: 'FREE_TEXT_NOT_JUSTIFIED',
          path: `${path}.friction_exception`,
          detail: 'Free text is exceptional and requires an approved reason plus rationale.'
        });
      }
    }
  });

  return {
    ok: violations.length === 0,
    schema_version: 'claris_clarification_governance_report_v1',
    question_budget: MAX_QUESTIONS,
    max_authored_options: MAX_AUTHORED_OPTIONS,
    violations
  };
}

export function buildClarificationRepairPlan(report) {
  const violations = Array.isArray(report?.violations) ? report.violations : [];
  return {
    schema_version: 'claris_clarification_repair_plan_v1',
    repair_required: violations.length > 0,
    instructions: violations.map((violation) => ({
      code: violation.code,
      path: violation.path,
      instruction: violation.detail
    }))
  };
}

export const clarificationGovernance = Object.freeze({
  choice_types: [...CHOICE_TYPES],
  option_postures: [...OPTION_POSTURES],
  text_exception_reasons: [...TEXT_EXCEPTION_REASONS],
  max_questions: MAX_QUESTIONS,
  max_authored_options: MAX_AUTHORED_OPTIONS
});
