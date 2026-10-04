# CLARIS Discovery Intelligence Contract V1.2

## Goal
Make the consultant arrive informed, ask only questions worth asking, recognize useful answer patterns, and adapt naturally without sounding scripted.

## Primary questions
- 2–6 maximum plus any mandatory consultant-policy question.
- Every question resolves an authorized PREPARE dimension or explicit consultant-policy requirement.
- Never ask a fact already established by governed public research.
- Fewer high-leverage questions beat checklist completeness.

## Policy dimensions
Current supported policy mapping:
- `commercial_rules.budget_required_before_first_call === true` opens `P_ECONOMICS` / D10 economics.
- This authorizes exactly one economics question, asked after diagnostic relevance is established.
- The consultant's floor stays internal unless explicit policy says to disclose it.
- When policy is false/absent and PREPARE has no economics dimension, `commercial_target` must be exactly `[]`; economics must not affect call flow or end-of-call decisions.

## Conditional probes
A hidden probe may open a new ontology family only when its `trigger_if` hypothetical prospect answer explicitly introduces that family.

### Ownership / stakeholder branches
A conditional probe may open `D09 ownership_stakeholders` only when its `trigger_if` explicitly introduces ownership, responsibility, a stakeholder, approver, decision-maker, engineering team ownership, or security team responsibility.

Merely saying engineering or sales personnel perform a task is not sufficient authority to open D09. If ownership is not explicitly introduced by the hypothetical answer, omit the D09 branch or keep the follow-up inside the already-authorized dimension.

### Observable listen-fors
`listen_for.pattern` should describe a recognizable prospect statement, artifact, workflow, or behavior—not an abstract consultant interpretation. Prefer concrete patterns such as spreadsheet questionnaires, manual evidence retrieval, or engineering answering customer security forms.

## Threat/problem firewall
Do not introduce vulnerability, incident, breach, auth bypass, weakness or similar unless the prospect answer itself introduces it. Public technical surfaces never imply weakness.

## Capability-aware disqualification
Never disqualify or deprioritize because the prospect mentions a domain represented by an available consultant service. A capability can become conditionally relevant if the prospect raises it; it is not a mismatch by default.

## Question object
Every primary question carries:
- question_id
- ontology_intent
- dimension_id
- authority
- policy_key
- ask
- why_now
- already_known_context
- listen_for patterns
- conditional_probes
- what_the_answer_changes
- stop_condition
- linked_service_paths

## End-of-call target
- `diagnostic_target`: what must be understood about the situation.
- `commercial_target`: only explicitly authorized commercial information.
- `ready_for_next_step_if`: confirmed diagnostic fit + resolved mandatory policy gates.
- `remain_in_discovery_if`: admitted dimensions unresolved.
- `disqualify_or_deprioritize_if`: explicit consultant hard disqualifier or prospect-confirmed mismatch only.
