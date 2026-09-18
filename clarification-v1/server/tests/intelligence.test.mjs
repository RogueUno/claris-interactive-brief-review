import test from 'node:test';
import assert from 'node:assert/strict';
import { createClarificationIntelligence } from '../intelligence.mjs';
import { goldenOpportunities } from '../fixtures/golden-opportunities.mjs';

function option(option_id, label, posture = 'GENERIC_SAFE', basis_ids = []) {
  return { option_id, label, posture, basis_ids };
}

function proposalFor(name) {
  if (name === 'soc2_customer_trigger') {
    return {
      decision: 'ASK',
      decision_basis_ids: ['ev_company_soc2', 'ev_booking_customer'],
      decision_rationale: 'Two compact confirmations resolve priority and trigger.',
      intro_context: 'We already have most of the context. Two quick checks will help us focus the conversation.',
      questions: [
        {
          question_id: 'q_priority',
          mode: 'CONFIRM',
          prompt: 'Is SOC 2 still the immediate priority?',
          display_context: 'We can see SOC 2 is part of the current security story, so we would rather confirm than assume.',
          response_type: 'SINGLE_CHOICE',
          allow_other: true,
          allow_unsure: true,
          options: [
            option('priority_soc2', 'Yes — SOC 2 is the priority', 'EVIDENCE_DERIVED', ['ev_company_soc2']),
            option('priority_other', 'Another requirement is more urgent'),
            option('priority_deciding', 'We are still deciding what comes first')
          ],
          evidence_ids: ['ev_company_soc2'],
          required: true
        },
        {
          question_id: 'q_trigger',
          mode: 'CONFIRM',
          prompt: 'Is the customer request the main reason this is moving now?',
          display_context: 'Your booking note points to a customer request, so we just want to confirm its importance.',
          response_type: 'SINGLE_CHOICE',
          allow_other: true,
          allow_unsure: true,
          options: [
            option('trigger_customer', 'Yes — the customer request is the main trigger', 'EVIDENCE_DERIVED', ['ev_booking_customer']),
            option('trigger_one_of_several', 'It is one of several reasons'),
            option('trigger_other', 'Something else is driving the timing')
          ],
          evidence_ids: ['ev_booking_customer'],
          required: true
        }
      ]
    };
  }

  if (name === 'framework_conflict') {
    return {
      decision: 'ASK',
      decision_basis_ids: ['ev_company_soc2', 'ev_booking_iso'],
      decision_rationale: 'Public and booking signals point to different immediate frameworks.',
      intro_context: 'We have most of the background. One quick check will help us avoid prioritizing the wrong framework.',
      questions: [{
        question_id: 'q_framework',
        mode: 'CONTRAST',
        prompt: 'Which framework is the more immediate priority for this conversation?',
        display_context: 'We are seeing both SOC 2 and ISO 27001 signals, so we would rather confirm than guess.',
        response_type: 'SINGLE_CHOICE',
        allow_other: true,
        allow_unsure: true,
        options: [
          option('framework_soc2', 'SOC 2', 'EVIDENCE_DERIVED', ['ev_company_soc2']),
          option('framework_iso', 'ISO 27001', 'EVIDENCE_DERIVED', ['ev_booking_iso']),
          option('framework_both', 'Both matter right now', 'INFERENCE', ['ev_company_soc2', 'ev_booking_iso'])
        ],
        evidence_ids: ['ev_company_soc2', 'ev_booking_iso'],
        required: true
      }]
    };
  }

  if (name === 'already_sufficient') {
    return {
      decision: 'SKIP',
      decision_basis_ids: ['ev_booking_priority', 'ev_booking_trigger', 'ev_booking_owner', 'ev_booking_timeline'],
      decision_rationale: 'The booking already states priority, trigger, owner, and timing.',
      intro_context: null,
      questions: []
    };
  }

  if (name === 'sparse_context') {
    return {
      decision: 'ASK',
      decision_basis_ids: ['ev_booking_general'],
      decision_rationale: 'Research is sparse, so two low-friction discovery choices are justified.',
      intro_context: 'We have the basics. Two quick choices will help us focus the conversation.',
      questions: [
        {
          question_id: 'q_goal',
          mode: 'DISCOVER',
          prompt: 'What would make this conversation most useful?',
          display_context: null,
          response_type: 'SINGLE_CHOICE',
          allow_other: true,
          allow_unsure: true,
          options: [
            option('goal_compliance', 'Clarifying a compliance path'),
            option('goal_security', 'Strengthening the security program'),
            option('goal_customer', 'Meeting customer security expectations'),
            option('goal_scope', 'Understanding what to tackle first')
          ],
          evidence_ids: [],
          required: true
        },
        {
          question_id: 'q_timing',
          mode: 'DISCOVER',
          prompt: 'What best describes the timing?',
          display_context: null,
          response_type: 'SINGLE_CHOICE',
          allow_other: true,
          allow_unsure: true,
          options: [
            option('timing_now', 'There is an active need right now'),
            option('timing_quarter', 'We want a plan for this quarter'),
            option('timing_exploring', 'We are exploring before committing')
          ],
          evidence_ids: [],
          required: true
        }
      ]
    };
  }

  if (name === 'sensitive_internal_signal') {
    return {
      decision: 'ASK',
      decision_basis_ids: ['ev_internal_incident', 'ev_booking_review'],
      decision_rationale: 'A security-priority clarification may be useful.',
      intro_context: 'We already have some context. One quick check will help us focus the conversation.',
      questions: [{
        question_id: 'q_trigger',
        mode: 'DISCOVER',
        prompt: 'What is driving the security review right now?',
        display_context: null,
        response_type: 'SINGLE_CHOICE',
        allow_other: true,
        allow_unsure: true,
        options: [
          option('trigger_incident', 'A recent security incident prompted this', 'INFERENCE', ['ev_internal_incident']),
          option('trigger_customer', 'Customer or partner expectations'),
          option('trigger_maturity', 'General security maturity')
        ],
        evidence_ids: ['ev_internal_incident', 'ev_booking_review'],
        required: true
      }]
    };
  }

  throw new Error(`UNKNOWN_FIXTURE:${name}`);
}

function verifierPass() {
  return { verdict: 'PASS', issues: [] };
}

test('golden SOC 2 customer-trigger fixture produces two governed questions', async () => {
  const fixture = goldenOpportunities.soc2_customer_trigger;
  const intelligence = createClarificationIntelligence({
    proposer: async () => proposalFor('soc2_customer_trigger'),
    verifier: async () => verifierPass(),
    repairer: async () => { throw new Error('repair should not run'); }
  });

  const result = await intelligence.plan(fixture.bundle, { now: 1_000_000, ttlMs: 60_000 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'READY');
  assert.equal(result.package.questions.length, 2);
  assert.equal(result.package.questions[1].options[0].basis_ids[0], 'ev_booking_customer');
});

test('conflicting framework signals produce a single contrast question', async () => {
  const fixture = goldenOpportunities.framework_conflict;
  const intelligence = createClarificationIntelligence({
    proposer: async () => proposalFor('framework_conflict'),
    verifier: async () => verifierPass(),
    repairer: async () => { throw new Error('repair should not run'); }
  });

  const result = await intelligence.plan(fixture.bundle, { now: 2_000_000, ttlMs: 60_000 });
  assert.equal(result.ok, true);
  assert.equal(result.package.questions.length, 1);
  assert.equal(result.package.questions[0].mode, 'CONTRAST');
  assert.deepEqual(
    result.package.questions[0].evidence_refs.map((item) => item.evidence_id).sort(),
    ['ev_booking_iso', 'ev_company_soc2']
  );
});

test('sufficient booking evidence takes the zero-question path', async () => {
  const fixture = goldenOpportunities.already_sufficient;
  const intelligence = createClarificationIntelligence({
    proposer: async () => proposalFor('already_sufficient'),
    verifier: async () => verifierPass(),
    repairer: async () => { throw new Error('repair should not run'); }
  });

  const result = await intelligence.plan(fixture.bundle, { now: 3_000_000, ttlMs: 60_000 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'NO_CLARIFICATION');
  assert.equal(result.package.questions.length, 0);
  assert.equal(result.package.status, 'NO_CLARIFICATION');
});

test('sparse research still produces guided choices instead of free-text homework', async () => {
  const fixture = goldenOpportunities.sparse_context;
  const intelligence = createClarificationIntelligence({
    proposer: async () => proposalFor('sparse_context'),
    verifier: async () => verifierPass(),
    repairer: async () => { throw new Error('repair should not run'); }
  });

  const result = await intelligence.plan(fixture.bundle, { now: 4_000_000, ttlMs: 60_000 });
  assert.equal(result.ok, true);
  assert.equal(result.package.questions.length, 2);
  assert.ok(result.package.questions.every((question) => question.response_type === 'SINGLE_CHOICE'));
});

test('internal-only evidence cannot directly ground a prospect-visible option and is repaired', async () => {
  const fixture = goldenOpportunities.sensitive_internal_signal;
  let repairs = 0;
  const intelligence = createClarificationIntelligence({
    proposer: async () => proposalFor('sensitive_internal_signal'),
    verifier: async () => verifierPass(),
    repairer: async ({ repair_plan }) => {
      repairs += 1;
      assert.ok(repair_plan.instructions.some((item) => item.code === 'OPTION_USES_INTERNAL_ONLY_EVIDENCE'));
      return {
        decision: 'ASK',
        decision_basis_ids: ['ev_internal_incident', 'ev_booking_review'],
        decision_rationale: 'Ask neutrally about current priorities without exposing the incident signal.',
        intro_context: 'We already have some context. One quick check will help us focus the conversation.',
        questions: [{
          question_id: 'q_priority',
          mode: 'DISCOVER',
          prompt: 'What best describes the security priority behind this conversation?',
          display_context: null,
          response_type: 'SINGLE_CHOICE',
          allow_other: true,
          allow_unsure: true,
          options: [
            option('priority_customer', 'Customer or partner expectations'),
            option('priority_maturity', 'Strengthening the security program'),
            option('priority_review', 'Reviewing what to tackle first', 'EVIDENCE_DERIVED', ['ev_booking_review'])
          ],
          evidence_ids: ['ev_booking_review'],
          required: true
        }]
      };
    }
  });

  const result = await intelligence.plan(fixture.bundle, { now: 5_000_000, ttlMs: 60_000 });
  assert.equal(result.ok, true);
  assert.equal(repairs, 1);
  assert.equal(result.trace.length, 2);
  assert.equal(result.package.questions[0].evidence_refs[0].evidence_id, 'ev_booking_review');
  assert.equal(JSON.stringify(result.package).includes('incident'), false);
});

test('semantic verifier catches unsupported specificity even when evidence IDs are structurally valid', async () => {
  const fixture = goldenOpportunities.soc2_customer_trigger;
  let verificationCalls = 0;
  let repairCalls = 0;

  const intelligence = createClarificationIntelligence({
    proposer: async () => ({
      decision: 'ASK',
      decision_basis_ids: ['ev_booking_customer'],
      decision_rationale: 'Clarify the trigger.',
      intro_context: 'One quick check.',
      questions: [{
        question_id: 'q_trigger',
        mode: 'CONFIRM',
        prompt: 'Did a failed customer security audit trigger this?',
        display_context: 'We want to make sure we understand the immediate trigger.',
        response_type: 'SINGLE_CHOICE',
        allow_other: true,
        allow_unsure: true,
        options: [
          option('failed_audit', 'Yes — we failed a customer audit', 'INFERENCE', ['ev_booking_customer']),
          option('other_trigger', 'No — something else triggered it')
        ],
        evidence_ids: ['ev_booking_customer'],
        required: true
      }]
    }),
    verifier: async ({ proposal }) => {
      verificationCalls += 1;
      const text = JSON.stringify(proposal);
      if (text.includes('failed customer')) {
        return {
          verdict: 'FAIL',
          issues: [{
            code: 'UNSUPPORTED_SPECIFICITY',
            path: 'questions[0]',
            detail: 'The booking evidence says a customer requested documentation; it does not say an audit failed.',
            evidence_ids: ['ev_booking_customer']
          }]
        };
      }
      return verifierPass();
    },
    repairer: async ({ repair_plan }) => {
      repairCalls += 1;
      assert.ok(repair_plan.instructions.some((item) => item.code === 'UNSUPPORTED_SPECIFICITY'));
      return {
        decision: 'ASK',
        decision_basis_ids: ['ev_booking_customer'],
        decision_rationale: 'Confirm whether the customer request is the main trigger.',
        intro_context: 'One quick check.',
        questions: [{
          question_id: 'q_trigger',
          mode: 'CONFIRM',
          prompt: 'Is the customer request the main reason this is moving now?',
          display_context: 'Your booking note points to a customer request, so we would rather confirm than assume.',
          response_type: 'SINGLE_CHOICE',
          allow_other: true,
          allow_unsure: true,
          options: [
            option('customer_main', 'Yes — the customer request is the main trigger', 'EVIDENCE_DERIVED', ['ev_booking_customer']),
            option('customer_partial', 'It is one of several reasons')
          ],
          evidence_ids: ['ev_booking_customer'],
          required: true
        }]
      };
    }
  });

  const result = await intelligence.plan(fixture.bundle, { now: 6_000_000, ttlMs: 60_000 });
  assert.equal(result.ok, true);
  assert.equal(verificationCalls, 2);
  assert.equal(repairCalls, 1);
  assert.equal(JSON.stringify(result.package).includes('failed customer'), false);
});

test('repeated semantic failure blocks package creation after the repair budget', async () => {
  const fixture = goldenOpportunities.framework_conflict;
  const intelligence = createClarificationIntelligence({
    proposer: async () => proposalFor('framework_conflict'),
    verifier: async () => ({
      verdict: 'FAIL',
      issues: [{
        code: 'LEADING_CHOICE_SET',
        path: 'questions[0].options',
        detail: 'The options are too leading.',
        evidence_ids: ['ev_company_soc2', 'ev_booking_iso']
      }]
    }),
    repairer: async ({ prior_proposal }) => prior_proposal,
    maxRepairs: 1
  });

  const result = await intelligence.plan(fixture.bundle, { now: 7_000_000, ttlMs: 60_000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.error, 'CLARIFICATION_INTELLIGENCE_BLOCKED');
  assert.equal(result.trace.length, 2);
  assert.ok(result.repair_plan.instructions.some((item) => item.code === 'LEADING_CHOICE_SET'));
});

test('verifier cannot cite evidence that does not exist in the canonical bundle', async () => {
  const fixture = goldenOpportunities.soc2_customer_trigger;
  const intelligence = createClarificationIntelligence({
    proposer: async () => proposalFor('soc2_customer_trigger'),
    verifier: async () => ({
      verdict: 'FAIL',
      issues: [{
        code: 'UNSUPPORTED_CLAIM',
        path: 'questions[0]',
        detail: 'Claim needs support.',
        evidence_ids: ['ev_invented']
      }]
    }),
    repairer: async ({ repair_plan }) => {
      assert.ok(repair_plan.instructions.some((item) => item.code === 'VERIFIER_EVIDENCE_UNKNOWN'));
      return proposalFor('soc2_customer_trigger');
    },
    maxRepairs: 1
  });

  const result = await intelligence.plan(fixture.bundle, { now: 8_000_000, ttlMs: 60_000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.trace[0].semantic_verification.structural_issues.some(
    (item) => item.code === 'VERIFIER_EVIDENCE_UNKNOWN'
  ));
});
