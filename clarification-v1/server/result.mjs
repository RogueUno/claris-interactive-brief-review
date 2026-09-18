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
        return {
          question_id: answer.question_id,
          mode: question?.mode || answer.mode,
          prompt: question?.prompt || null,
          evidence_refs: [...(question?.evidence_refs || [])],
          source_class: 'PROSPECT_REPORTED',
          value: answer.value
        };
      })
    }
  };
}
