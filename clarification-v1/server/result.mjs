function selectedOptionRecords(question, answer) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const findOne = (optionId) => options.find((option) => {
    if (typeof option === 'string') return option === optionId;
    return option?.option_id === optionId;
  }) || null;

  if (answer?.answer_kind === 'MULTI' && Array.isArray(answer.value)) {
    return answer.value
      .filter((item) => item?.answer_kind === 'OPTION' && item?.selected_option_id)
      .map((item) => findOne(item.selected_option_id))
      .filter(Boolean);
  }

  if (answer?.answer_kind === 'OPTION' && answer?.selected_option_id) {
    const found = findOne(answer.selected_option_id);
    return found ? [found] : [];
  }

  return [];
}

function basisEvidence(question, selectedOptions) {
  const basisIds = new Set(
    selectedOptions.flatMap((option) => (
      typeof option === 'string' ? [] : (option?.basis_ids || [])
    ))
  );
  return (question?.evidence_refs || []).filter((ref) => basisIds.has(ref.evidence_id));
}

export function buildClarificationResult(envelope, opportunityVersion = null) {
  if (!envelope) return { ok: false, error: 'CLARIFICATION_NOT_FOUND', http_status: 404 };

  const pkg = envelope.package;
  if (!pkg) return { ok: false, error: 'CLARIFICATION_PACKAGE_MISSING', http_status: 409 };

  if (pkg.status === 'NO_CLARIFICATION') {
    return {
      ok: true,
      http_status: 200,
      opportunity_id: pkg.opportunity_id,
      status: 'NO_CLARIFICATION',
      opportunity_version: opportunityVersion || null,
      clarification_result: {
        required: false,
        source_class: null,
        submitted_at: null,
        answers: []
      }
    };
  }

  if (pkg.status !== 'SUBMITTED' || !envelope.response) {
    return {
      ok: false,
      error: 'CLARIFICATION_PENDING',
      http_status: 409,
      opportunity_id: pkg.opportunity_id,
      status: pkg.status || 'OPEN',
      opportunity_version: opportunityVersion || null
    };
  }

  const questions = new Map(pkg.questions.map((question) => [question.question_id, question]));
  return {
    ok: true,
    http_status: 200,
    opportunity_id: pkg.opportunity_id,
    status: 'SUBMITTED',
    opportunity_version: opportunityVersion || null,
    clarification_result: {
      required: true,
      source_class: 'PROSPECT_REPORTED',
      submitted_at: envelope.response.submitted_at,
      answers: envelope.response.answers.map((answer) => {
        const question = questions.get(answer.question_id);
        const selected = selectedOptionRecords(question, answer);
        return {
          question_id: answer.question_id,
          mode: question?.mode || answer.mode,
          prompt: question?.prompt || null,
          answer_kind: answer.answer_kind || 'LEGACY',
          selected_option_id: answer.selected_option_id || null,
          selected_option_postures: selected
            .map((option) => typeof option === 'string' ? null : option?.posture || null)
            .filter(Boolean),
          basis_evidence_refs: basisEvidence(question, selected),
          question_evidence_refs: [...(question?.evidence_refs || [])],
          source_class: 'PROSPECT_REPORTED',
          value: answer.value
        };
      })
    }
  };
}
