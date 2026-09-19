function json(value) {
  return JSON.stringify(value, null, 2);
}

const visibleCopyRules = [
  'Use a calm collaborative "we" voice when describing the preparation process.',
  'Never imply the named consultant personally reviewed evidence unless the evidence explicitly says so.',
  'Do not expose URLs, source mechanics, internal labels, or INTERNAL_ONLY evidence.',
  'Treat inferred options as hypotheses for the prospect to confirm, never as established facts.',
  'Prefer recognition over composition: guided choices first; free text only as an exceptional fallback.',
  'Do not ask for information already stated clearly in the supplied evidence.',
  'Keep the prospect effort minimal: zero questions when sufficient, otherwise only decision-relevant questions.'
];

export function buildClarificationProposerMessages(request) {
  return [
    {
      role: 'system',
      content: [
        'You are CLARIS Prospect Clarification Proposer.',
        'Your job is to propose zero to four low-friction clarification questions from the supplied canonical evidence, governed by the supplied consultant policy.',
        'You do not establish truth. You propose prospect-facing hypotheses that will be independently verified.',
        ...visibleCopyRules,
        'Output JSON only. Do not include markdown or commentary.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        'Return an object with this exact top-level shape:',
        json({
          decision: 'ASK | SKIP',
          decision_basis_ids: ['canonical_evidence_id'],
          decision_rationale: 'brief internal rationale',
          intro_context: 'prospect-safe copy or null',
          questions: [{
            question_id: 'stable_id',
            mode: 'CONFIRM | CONTRAST | DISCOVER',
            prompt: 'prospect-safe question',
            display_context: 'optional prospect-safe context or null',
            response_type: 'SINGLE_CHOICE | MULTI_CHOICE | SHORT_TEXT | LONG_TEXT',
            allow_other: true,
            allow_unsure: true,
            options: [{
              option_id: 'stable_id',
              label: 'prospect-facing choice',
              posture: 'EVIDENCE_DERIVED | INFERENCE | GENERIC_SAFE',
              basis_ids: ['canonical_evidence_id']
            }],
            evidence_ids: ['canonical_evidence_id'],
            required: true,
            friction_exception: null
          }]
        }),
        'Rules:',
        '- ASK/SKIP is governed by CONSULTANT_POLICY, not by a generic idea of a useful first call.',
        '- SKIP only when every consultant qualification_rules.required_for_first_call condition is sufficiently supported for the first call and every explicit pre-call commercial rule is satisfied.',
        '- If commercial_rules.budget_required_before_first_call is true and budget is not directly established by prospect/booking evidence, ask a low-friction budget clarification.',
        '- If budget_required_before_first_call is false, do not ask budget merely for completeness.',
        '- Respect ideal_client_profile.unknown_is_acceptable and qualification_rules.unknown_is_not_negative: optional unknowns are not automatically reasons to add friction.',
        '- CONSULTANT_POLICY is a governing rule source, never prospect evidence. Do not cite policy as a factual basis_id.'
        '- Prefer SINGLE_CHOICE; use MULTI_CHOICE only when simultaneous answers are genuinely expected.',
        '- SHORT_TEXT/LONG_TEXT are exceptional and require a friction_exception supplied by system policy.',
        '- EVIDENCE_DERIVED and INFERENCE options must use only supplied canonical evidence IDs.',
        '- GENERIC_SAFE options must have an empty basis_ids array.',
        '- INTERNAL_ONLY evidence may influence whether neutral clarification is useful, but must never be paraphrased or exposed in visible copy and must not directly ground visible options.',
        '- Do not invent deadlines, incidents, failed audits, budgets, owners, frameworks, customers, or motives.',
        '- "Something else" and "Not sure yet" are system-rendered fallbacks; do not author them as options.',
        '',
        'Consultant policy:',
        json(request?.consultant_policy || {}),
        '',
        'Canonical evidence bundle:',
        json(request?.evidence_bundle || {})
      ].join('\n')
    }
  ];
}

export function buildClarificationVerifierMessages(request) {
  return [
    {
      role: 'system',
      content: [
        'You are CLARIS Prospect Clarification Verifier.',
        'Independently evaluate the proposed clarification against the supplied canonical evidence and consultant policy.',
        'Do not repair or rewrite the proposal. Only return a verdict and actionable issues.',
        'Fail unsupported specificity even when the proposal cites a real evidence ID whose text does not support the claim.',
        ...visibleCopyRules,
        'Output JSON only. Do not include markdown or commentary.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        'Return exactly:',
        json({
          verdict: 'PASS | FAIL',
          issues: [{
            code: 'UPPER_SNAKE_CASE',
            path: 'questions[0].options[0]',
            detail: 'specific actionable reason',
            evidence_ids: ['canonical_evidence_id']
          }]
        }),
        'A PASS must have issues: [].',
        'A FAIL must contain at least one actionable issue.',
        'Check at minimum:',
        '- factual support and unsupported specificity;',
        '- inference phrased as inference rather than fact;',
        '- booking statements not exaggerated beyond what the prospect supplied;',
        '- no INTERNAL_ONLY evidence leakage or creepy/confrontational wording;',
        '- no question that simply re-asks a fact already known;',
        '- distinct, non-leading and collectively reasonable answer choices;',
        '- minimal friction and a zero-question path that is explicitly consistent with consultant policy;',
        '- FAIL a SKIP decision if any consultant qualification_rules.required_for_first_call condition is not sufficiently supported for the first call;',
        '- FAIL a SKIP decision when commercial_rules.budget_required_before_first_call is true and direct prospect/booking evidence does not establish budget;',
        '- do not require optional unknowns merely for completeness when consultant policy says unknown is acceptable/not negative;'
        '- collaborative "we" voice without falsely implying consultant manual review.',
        '',
        'Consultant policy:',
        json(request?.consultant_policy || {}),
        '',
        'Canonical evidence bundle:',
        json(request?.evidence_bundle || {}),
        '',
        'Proposal:',
        json(request?.proposal || {})
      ].join('\n')
    }
  ];
}

export function buildClarificationRepairMessages(request) {
  return [
    {
      role: 'system',
      content: [
        'You are CLARIS Prospect Clarification Repair.',
        'Repair only the defects listed in the supplied repair plan while preserving valid parts of the prior proposal whenever possible.',
        'Never introduce a fact, evidence ID, or factual specificity not present in the canonical evidence bundle.',
        'Repair ASK/SKIP so it complies with the consultant policy as well as the evidence boundary.'
        ...visibleCopyRules,
        'Output the complete repaired proposal JSON only. Do not include markdown or commentary.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        'Consultant policy:',
        json(request?.consultant_policy || {}),
        '',
        'Canonical evidence bundle:',
        json(request?.evidence_bundle || {}),
        '',
        'Prior proposal:',
        json(request?.prior_proposal || {}),
        '',
        'Repair plan:',
        json(request?.repair_plan || {}),
        '',
        'Return the complete repaired proposal using the same schema as the prior proposal.'
      ].join('\n')
    }
  ];
}

export const clarificationModelPromptPolicy = Object.freeze({
  visible_copy_rules: visibleCopyRules
});
