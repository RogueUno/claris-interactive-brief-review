import test from 'node:test';
import assert from 'node:assert/strict';
import { runClarificationProtocolStep } from '../protocol.mjs';

function caseState() {
  return {
    prepare_advisory: { stage: 'AWAITING_PROSPECT_INPUT' },
    p3_repair_applied: false,
    p3_semantic_status: 'DUAL_CERTIFIED_PASS',
    p2_contract_gate_passed: true,
    artifact_contract_version: 'V3_TRUTH_BOUNDARY_3',
    compiler_contract_version: 'V3_CANONICAL_TRUTH_1',
    canonical_evidence_authority: 'MODULE_85_DETERMINISTIC_CANONICAL_TRUTH_COMPILER',
    canonical_truth_json: JSON.stringify({
      company: 'Acme',
      compiler_contract_version: 'V3_CANONICAL_TRUTH_1',
      booking_evidence: [{
        evidence_id: 'BOOK-001',
        authority: 'BOOKING_TEXT',
        statement: 'A customer is asking for security documentation.',
        exact_basis: 'A customer is asking for security documentation.',
        resolvable: true
      }],
      canonical_evidence_registry: [{
        evidence_id: 'FAC-001',
        admission_status: 'ADMITTED',
        sensitivity: 'STANDARD',
        channel: 'IDENTITY_PRODUCT',
        authority: 'VERIFIED_PUBLIC_FACT',
        strength: 'HIGH',
        freshness: 'UNKNOWN',
        source_date: 'UNKNOWN',
        source_url: 'https://acme.example/security',
        source_excerpt: 'Acme publishes SOC 2 readiness material.'
      }]
    })
  };
}

function consultantSot({ budgetRequired = false } = {}) {
  return {
    sot_version: 'AGENTIC_TEST_1',
    consultant: {
      consultant_name: 'Sarah Jones',
      firm: 'Northstar Security'
    },
    services: [{ service_id: 'SVC_SOC2', name: 'SOC 2 readiness/advisory' }],
    ideal_client_profile: {
      preferred_company_types: ['B2B technology', 'SaaS'],
      unknown_is_acceptable: true
    },
    commercial_rules: {
      minimum_viable_engagement_usd: 5000,
      budget_required_before_first_call: budgetRequired,
      budget_rule: 'Direct evidence only; never infer budget.'
    },
    qualification_rules: {
      required_for_first_call: [
        'documented service/problem alignment',
        'not affirmatively disqualified'
      ],
      unknown_is_not_negative: true
    }
  };
}

function base(action) {
  return {
    protocol_version: 'claris_clarification_protocol_v2',
    action,
    opportunity_id: 'opp_protocol_001',
    case_state_json: JSON.stringify(caseState()),
    consultant_sot_json: JSON.stringify(consultantSot()),
    consultant: {
      consultant_id: 'consultant_sarah',
      first_name: 'Sarah',
      firm: 'Northstar Security'
    },
    prospect: {
      first_name: 'Alex',
      role: 'VP Engineering',
      company: 'Acme'
    }
  };
}

function validProposal() {
  return {
    decision: 'ASK',
    decision_basis_ids: ['BOOK-001', 'FAC-001'],
    decision_rationale: 'Confirm whether the customer request is the main trigger.',
    intro_context: 'We already have most of the context. One quick check will help us focus the conversation.',
    questions: [{
      question_id: 'q_trigger',
      mode: 'CONFIRM',
      prompt: 'Is the customer request the main reason this is moving now?',
      display_context: 'Your booking note points to a customer request, so we would rather confirm than assume.',
      response_type: 'SINGLE_CHOICE',
      allow_other: true,
      allow_unsure: true,
      options: [
        {
          option_id: 'trigger_customer',
          label: 'Yes — the customer request is the main trigger',
          posture: 'EVIDENCE_DERIVED',
          basis_ids: ['BOOK-001']
        },
        {
          option_id: 'trigger_other',
          label: 'It is one of several reasons',
          posture: 'GENERIC_SAFE',
          basis_ids: []
        }
      ],
      evidence_ids: ['BOOK-001'],
      required: true
    }]
  };
}

test('START returns proposer request only after certified PREPARE adaptation', () => {
  const result = runClarificationProtocolStep(base('START'), { now: 1_000_000 });
  assert.equal(result.ok, true);
  assert.equal(result.next_action, 'PROPOSE');
  assert.match(result.model_request.system_instruction, /Prospect Clarification Proposer/);
  assert.match(result.model_request.user_prompt, /BOOK-001/);
  assert.match(result.model_request.user_prompt, /CONSULTANT_POLICY/);
  assert.match(result.model_request.user_prompt, /budget_required_before_first_call/);
  assert.equal(result.model_request.user_prompt.includes('https://acme.example/security'), false);
});

test('valid proposal advances to independent verification', () => {
  const result = runClarificationProtocolStep({
    ...base('PROPOSAL'),
    proposal: validProposal()
  }, { now: 2_000_000 });
  assert.equal(result.ok, true);
  assert.equal(result.next_action, 'VERIFY');
  assert.match(result.model_request.system_instruction, /Prospect Clarification Verifier/);
  assert.match(result.model_request.user_prompt, /required_for_first_call/);
});

test('deterministically invalid proposal is routed to repair before verification', () => {
  const proposal = validProposal();
  proposal.questions[0].options[0].basis_ids = ['FAC-MISSING'];

  const result = runClarificationProtocolStep({
    ...base('PROPOSAL'),
    proposal
  }, { now: 3_000_000 });
  assert.equal(result.ok, true);
  assert.equal(result.next_action, 'REPAIR');
  assert.ok(result.repair_plan.instructions.some((item) => item.code === 'OPTION_BASIS_UNKNOWN'));
});

test('semantic PASS creates final clarification package', () => {
  const result = runClarificationProtocolStep({
    ...base('VERIFICATION'),
    proposal: validProposal(),
    verification: { verdict: 'PASS', issues: [] },
    ttl_days: 7
  }, { now: 4_000_000 });
  assert.equal(result.ok, true);
  assert.equal(result.next_action, 'RETURN');
  assert.equal(result.status, 'READY');
  assert.equal(result.clarification_package.questions.length, 1);
  assert.equal(typeof result.clarification_package_json, 'string');
  assert.equal(typeof result.intelligence_audit_json, 'string');
  assert.equal(result.failure_json, '');
  assert.equal(JSON.parse(result.clarification_package_json).schema_version, 'claris_clarification_package_v1');
  const audit = JSON.parse(result.intelligence_audit_json);
  assert.equal(audit.schema_version, 'claris_clarification_protocol_audit_v1');
  assert.equal(audit.consultant_policy.source_class, 'CONSULTANT_POLICY');
  assert.equal(audit.consultant_policy.commercial_rules.budget_required_before_first_call, false);
});

test('semantic FAIL routes one controlled repair', () => {
  const result = runClarificationProtocolStep({
    ...base('VERIFICATION'),
    proposal: validProposal(),
    verification: {
      verdict: 'FAIL',
      issues: [{
        code: 'UNSUPPORTED_SPECIFICITY',
        path: 'questions[0]',
        detail: 'The evidence does not support the stronger claim.',
        evidence_ids: ['BOOK-001']
      }]
    }
  }, { now: 5_000_000 });
  assert.equal(result.ok, true);
  assert.equal(result.next_action, 'REPAIR');
  assert.ok(result.repair_plan.instructions.some((item) => item.code === 'UNSUPPORTED_SPECIFICITY'));
});

test('repaired proposal must pass deterministic governance before re-verification', () => {
  const result = runClarificationProtocolStep({
    ...base('REPAIRED_PROPOSAL'),
    proposal: validProposal()
  }, { now: 6_000_000 });
  assert.equal(result.ok, true);
  assert.equal(result.next_action, 'VERIFY_REPAIRED');
});

test('invalid repaired proposal fails closed without a second repair', () => {
  const proposal = validProposal();
  proposal.questions[0].options[0].basis_ids = ['FAC-MISSING'];

  const result = runClarificationProtocolStep({
    ...base('REPAIRED_PROPOSAL'),
    proposal
  }, { now: 7_000_000 });
  assert.equal(result.ok, false);
  assert.equal(result.next_action, 'BLOCKED');
  assert.equal(result.error, 'CLARIFICATION_INTELLIGENCE_BLOCKED');
  assert.equal(result.clarification_package_json, '');
  assert.equal(result.intelligence_audit_json, '');
  assert.equal(JSON.parse(result.failure_json).error, 'CLARIFICATION_INTELLIGENCE_BLOCKED');
});

test('repaired verification failure fails closed', () => {
  const result = runClarificationProtocolStep({
    ...base('REPAIRED_VERIFICATION'),
    proposal: validProposal(),
    verification: {
      verdict: 'FAIL',
      issues: [{
        code: 'LEADING_CHOICE_SET',
        path: 'questions[0].options',
        detail: 'Choice set remains leading.',
        evidence_ids: ['BOOK-001']
      }]
    }
  }, { now: 8_000_000 });
  assert.equal(result.ok, false);
  assert.equal(result.next_action, 'BLOCKED');
  assert.equal(result.error, 'CLARIFICATION_INTELLIGENCE_BLOCKED');
});

test('unknown or uncertified PREPARE never reaches model stage', () => {
  const value = base('START');
  const bad = caseState();
  bad.p3_semantic_status = 'FAILED';
  value.case_state_json = JSON.stringify(bad);

  assert.throws(
    () => runClarificationProtocolStep(value),
    /PREPARE_SEMANTIC_NOT_CERTIFIED/
  );
});


test('unsupported protocol version fails closed before adaptation', () => {
  const value = base('START');
  value.protocol_version = 'claris_clarification_protocol_v999';
  assert.throws(
    () => runClarificationProtocolStep(value),
    /CLARIFICATION_PROTOCOL_VERSION_UNSUPPORTED/
  );
});


test('consultant SOT is required before any clarification model stage', () => {
  const value = base('START');
  delete value.consultant_sot_json;
  assert.throws(
    () => runClarificationProtocolStep(value),
    /CONSULTANT_SOT_REQUIRED/
  );
});

test('budget-required consultant policy is explicitly carried into proposer and verifier prompts', () => {
  const startInput = base('START');
  startInput.consultant_sot_json = JSON.stringify(consultantSot({ budgetRequired: true }));
  const start = runClarificationProtocolStep(startInput);
  assert.match(start.model_request.user_prompt, /"budget_required_before_first_call": true/);

  const proposalInput = base('PROPOSAL');
  proposalInput.consultant_sot_json = JSON.stringify(consultantSot({ budgetRequired: true }));
  proposalInput.proposal = validProposal();
  const verify = runClarificationProtocolStep(proposalInput);
  assert.match(verify.model_request.user_prompt, /FAIL a SKIP decision when commercial_rules\.budget_required_before_first_call is true/);
  assert.match(verify.model_request.user_prompt, /"budget_required_before_first_call": true/);
});
