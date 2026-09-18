import test from 'node:test';
import assert from 'node:assert/strict';
import { auditClarificationDraft, buildClarificationRepairPlan } from '../governance.mjs';
import { normalizeClarificationPackage, normalizeProspectAnswers, publicClarificationPackage } from '../contract.mjs';

function guidedQuestion(overrides = {}) {
  return {
    question_id: 'q_trigger',
    mode: 'DISCOVER',
    prompt: 'What best describes why this became a priority now?',
    response_type: 'SINGLE_CHOICE',
    allow_other: true,
    allow_unsure: true,
    options: [
      {
        option_id: 'trigger_customer',
        label: 'A customer is asking for security evidence',
        posture: 'INFERENCE',
        basis_ids: ['ev_booking_customer']
      },
      {
        option_id: 'trigger_deadline',
        label: 'A compliance milestone is approaching',
        posture: 'GENERIC_SAFE',
        basis_ids: []
      }
    ],
    required: true,
    evidence_refs: [
      {
        evidence_id: 'ev_booking_customer',
        source_type: 'BOOKING',
        subject: 'OPPORTUNITY',
        ref: 'fixture://booking/customer-requirement'
      }
    ],
    ...overrides
  };
}

function packageInput(question = guidedQuestion()) {
  return {
    opportunity_id: 'opp_governance_001',
    consultant: {
      consultant_id: 'consultant_sarah',
      first_name: 'Sarah',
      firm: 'Northstar Security'
    },
    prospect: {
      first_name: 'Alex',
      role: 'VP Engineering',
      company: 'Acme'
    },
    questions: [question]
  };
}

test('guided option inference must reference evidence from the same question', () => {
  const question = guidedQuestion({
    options: [
      {
        option_id: 'unsupported',
        label: 'A failed security review triggered this',
        posture: 'INFERENCE',
        basis_ids: ['ev_missing']
      },
      {
        option_id: 'safe',
        label: 'A compliance milestone is approaching',
        posture: 'GENERIC_SAFE',
        basis_ids: []
      }
    ]
  });
  const report = auditClarificationDraft(packageInput(question));
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((item) => item.code === 'OPTION_BASIS_UNKNOWN'));
  const repair = buildClarificationRepairPlan(report);
  assert.equal(repair.repair_required, true);
  assert.ok(repair.instructions.some((item) => item.code === 'OPTION_BASIS_UNKNOWN'));
});

test('guided questions require a prospect-controlled other route', () => {
  const report = auditClarificationDraft(packageInput(guidedQuestion({ allow_other: false })));
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((item) => item.code === 'OTHER_ESCAPE_REQUIRED'));
});

test('free text is rejected by default without an explicit friction exception', () => {
  const report = auditClarificationDraft(packageInput({
    question_id: 'q_text',
    mode: 'DISCOVER',
    prompt: 'Tell us what is happening.',
    response_type: 'LONG_TEXT',
    required: true,
    evidence_refs: []
  }));
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((item) => item.code === 'FREE_TEXT_NOT_JUSTIFIED'));
});

test('public package exposes labels but strips option posture, basis and evidence refs', () => {
  const pkg = normalizeClarificationPackage(packageInput());
  const safe = publicClarificationPackage(pkg);
  const question = safe.questions[0];
  assert.equal(question.options[0].option_id, 'trigger_customer');
  assert.equal(question.options[0].label, 'A customer is asking for security evidence');
  assert.equal('posture' in question.options[0], false);
  assert.equal('basis_ids' in question.options[0], false);
  assert.equal('evidence_refs' in question, false);
  assert.equal('governance' in safe, false);
});

test('prospect can choose an authored option, unsure, or provide another answer', () => {
  const pkg = normalizeClarificationPackage(packageInput());

  const option = normalizeProspectAnswers(pkg, [{
    question_id: 'q_trigger',
    value: { kind: 'OPTION', option_id: 'trigger_customer' }
  }])[0];
  assert.equal(option.answer_kind, 'OPTION');
  assert.equal(option.selected_option_id, 'trigger_customer');
  assert.equal(option.value, 'A customer is asking for security evidence');

  const unsure = normalizeProspectAnswers(pkg, [{
    question_id: 'q_trigger',
    value: { kind: 'UNSURE' }
  }])[0];
  assert.equal(unsure.answer_kind, 'UNSURE');
  assert.equal(unsure.value, 'Not sure yet');

  const other = normalizeProspectAnswers(pkg, [{
    question_id: 'q_trigger',
    value: { kind: 'OTHER', text: 'Our board asked us to formalize this.' }
  }])[0];
  assert.equal(other.answer_kind, 'OTHER');
  assert.equal(other.selected_option_id, null);
  assert.equal(other.value, 'Our board asked us to formalize this.');
});

test('other answer cannot be empty', () => {
  const pkg = normalizeClarificationPackage(packageInput());
  assert.throws(
    () => normalizeProspectAnswers(pkg, [{
      question_id: 'q_trigger',
      value: { kind: 'OTHER', text: '   ' }
    }]),
    /ANSWER_OTHER_TEXT_INVALID/
  );
});

test('question budget fails closed above four questions', () => {
  const input = packageInput();
  input.questions = Array.from({ length: 5 }, (_, index) => guidedQuestion({
    question_id: `q_${index + 1}`
  }));
  const report = auditClarificationDraft(input);
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((item) => item.code === 'QUESTION_BUDGET_EXCEEDED'));
});
