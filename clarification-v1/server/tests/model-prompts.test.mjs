import test from 'node:test';
import assert from 'node:assert/strict';
import { createClarificationModelAgents } from '../model-agents.mjs';
import {
  buildClarificationProposerMessages,
  buildClarificationRepairMessages,
  buildClarificationVerifierMessages
} from '../model-prompts.mjs';

const evidenceBundle = {
  opportunity_id: 'opp_prompt_001',
  evidence: [{
    evidence_id: 'ev_booking',
    source_type: 'BOOKING',
    subject: 'OPPORTUNITY',
    visibility: 'PROSPECT_SAFE',
    statement: 'A customer is asking for security documentation.'
  }]
};

test('proposer prompt encodes zero-question, friction and evidence rules', () => {
  const text = buildClarificationProposerMessages({ evidence_bundle: evidenceBundle })
    .map((message) => message.content)
    .join('\n');
  assert.match(text, /ASK\/SKIP is governed by CONSULTANT_POLICY/);
  assert.match(text, /Prefer SINGLE_CHOICE/);
  assert.match(text, /use mode DISCOVER/);
  assert.match(text, /GENERIC_SAFE answer categories must use basis_ids: \[\]/);
  assert.match(text, /INTERNAL_ONLY/);
  assert.match(text, /Do not invent deadlines, incidents, failed audits, budgets, owners, frameworks, customers, or motives/);
});

test('verifier prompt independently checks unsupported specificity and consultant-voice claims', () => {
  const text = buildClarificationVerifierMessages({
    evidence_bundle: evidenceBundle,
    proposal: { decision: 'ASK', questions: [] }
  }).map((message) => message.content).join('\n');
  assert.match(text, /unsupported specificity/i);
  assert.match(text, /Do not repair or rewrite/);
  assert.match(text, /falsely implying consultant manual review/);
  assert.match(text, /FAIL any EVIDENCE_DERIVED or INFERENCE option whose label is merely a generic answer category/);
  assert.match(text, /policy-driven missing facts should normally be DISCOVER questions/);
});

test('repair prompt is constrained to exact defects and canonical evidence', () => {
  const text = buildClarificationRepairMessages({
    evidence_bundle: evidenceBundle,
    prior_proposal: { decision: 'ASK' },
    repair_plan: { instructions: [{ code: 'UNSUPPORTED_SPECIFICITY' }] }
  }).map((message) => message.content).join('\n');
  assert.match(text, /Repair only the defects/);
  assert.match(text, /Never introduce a fact, evidence ID, or factual specificity/);
  assert.match(text, /change posture to GENERIC_SAFE and clear basis_ids/);
  assert.match(text, /Do not attach an unrelated evidence ID just to satisfy structure/);
  assert.match(text, /complete repaired proposal/i);
});

test('provider adapter keeps proposer, verifier and repair calls isolated and deterministic', async () => {
  const calls = [];
  const agents = createClarificationModelAgents({
    generateJson: async (request) => {
      calls.push(request);
      if (request.task === 'clarification_verifier') return { verdict: 'PASS', issues: [] };
      return { decision: 'SKIP', decision_basis_ids: [], decision_rationale: 'Enough context', questions: [] };
    }
  });

  await agents.proposer({ evidence_bundle: evidenceBundle });
  await agents.verifier({ evidence_bundle: evidenceBundle, proposal: {} });
  await agents.repairer({ evidence_bundle: evidenceBundle, prior_proposal: {}, repair_plan: {} });

  assert.deepEqual(calls.map((call) => call.task), [
    'clarification_proposer',
    'clarification_verifier',
    'clarification_repair'
  ]);
  assert.ok(calls.every((call) => call.temperature === 0));
  assert.ok(calls.every((call) => call.response_format === 'json_object'));
});

test('provider adapter fails closed on non-object model output', async () => {
  const agents = createClarificationModelAgents({
    generateJson: async () => 'not-json-object'
  });

  await assert.rejects(
    () => agents.proposer({ evidence_bundle: evidenceBundle }),
    /CLARIFICATION_PROPOSER_OUTPUT_INVALID/
  );
});
