import test from 'node:test';
import assert from 'node:assert/strict';
import { publicClarificationPackage } from '../contract.mjs';
import { createClarificationRepository } from '../repository.mjs';
import { createClarificationService } from '../service.mjs';
import {
  buildFinalizeBundle,
  buildFinalizeContext,
  buildFinalizeProspectAnswers
} from '../finalize-handoff.mjs';

function memoryStorage() {
  const map = new Map();
  let version = 0;
  return {
    async getJson(path) {
      return map.has(path) ? structuredClone(map.get(path).value) : null;
    },
    async getJsonWithMeta(path) {
      if (!map.has(path)) return { value: null, etag: null };
      const item = map.get(path);
      return { value: structuredClone(item.value), etag: item.etag };
    },
    async putJson(path, value, { ifMatch = null } = {}) {
      const current = map.get(path);
      if (ifMatch && current?.etag !== ifMatch) {
        const error = new Error('BLOB_PRECONDITION_FAILED');
        error.code = 'BLOB_PRECONDITION_FAILED';
        throw error;
      }
      const etag = `etag-${++version}`;
      map.set(path, { value: structuredClone(value), etag });
      return { etag };
    }
  };
}

function pkg() {
  return {
    opportunity_id: 'opp_finalize_001',
    consultant: { consultant_id: 'consultant_1', first_name: 'Sarah', firm: 'Northstar' },
    prospect: { first_name: 'Alex', role: 'VP Engineering', company: 'Acme' },
    intro_context: null,
    questions: [{
      question_id: 'q_budget',
      mode: 'DISCOVER',
      prompt: 'Does the planned budget meet our minimum engagement?',
      response_type: 'SINGLE_CHOICE',
      options: [
        { option_id: 'yes', label: 'Yes', posture: 'GENERIC_SAFE', basis_ids: [] },
        { option_id: 'no', label: 'No', posture: 'GENERIC_SAFE', basis_ids: [] }
      ],
      allow_other: true,
      allow_unsure: true,
      required: true,
      evidence_refs: []
    }]
  };
}

function fixture() {
  const repository = createClarificationRepository(memoryStorage());
  const service = createClarificationService({
    repository,
    sessionSecret: 'claris-test-secret-that-is-definitely-long-enough'
  });
  return { repository, service };
}

const caseState = JSON.stringify({
  artifact_contract_version: 'V3_TRUTH_BOUNDARY_3',
  compiler_contract_version: 'V3_CANONICAL_TRUTH_1',
  canonical_truth_json: '{}'
});
const sot = JSON.stringify({ sot_version: 'AGENTIC_TEST_1' });

test('FINALIZE context is private and never appears in prospect-safe package', async () => {
  const { repository, service } = fixture();
  const finalizeContext = buildFinalizeContext({ case_state_json: caseState, consultant_sot_json: sot }, { now: 1000 });
  await service.createPackage(pkg(), { now: 1000, ttlMs: 60000, finalizeContext });
  const loaded = await repository.loadEnvelopeWithMeta('opp_finalize_001');

  assert.equal(loaded.envelope.finalize_context.case_state_json, caseState);
  const safe = publicClarificationPackage(loaded.envelope.package);
  assert.equal('finalize_context' in safe, false);
  assert.equal(JSON.stringify(safe).includes('V3_TRUTH_BOUNDARY_3'), false);
});

test('FINALIZE bundle fails closed while clarification is pending', async () => {
  const { repository, service } = fixture();
  const finalizeContext = buildFinalizeContext({ case_state_json: caseState, consultant_sot_json: sot });
  await service.createPackage(pkg(), { now: 2000, ttlMs: 60000, finalizeContext });
  const loaded = await repository.loadEnvelopeWithMeta('opp_finalize_001');
  const result = buildFinalizeBundle(loaded.envelope, loaded.etag);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'CLARIFICATION_PENDING');
  assert.equal(result.http_status, 409);
});

test('submitted prospect response becomes deterministic FINALIZE input', async () => {
  const { repository, service } = fixture();
  const finalizeContext = buildFinalizeContext({ case_state_json: caseState, consultant_sot_json: sot });
  const created = await service.createPackage(pkg(), { now: 3000, ttlMs: 60000, finalizeContext });
  const resolved = await service.resolveInvite(created.invite_token, { now: 3500 });
  const submitted = await service.submit(
    resolved.session_token,
    [{ question_id: 'q_budget', value: 'yes' }],
    { now: 4000, expectedVersion: resolved.opportunity_version }
  );
  assert.equal(submitted.ok, true);

  const loaded = await repository.loadEnvelopeWithMeta('opp_finalize_001');
  const bundle = buildFinalizeBundle(loaded.envelope, loaded.etag);
  assert.equal(bundle.ok, true);
  assert.equal(bundle.case_state_json, caseState);
  assert.equal(bundle.consultant_sot_json, sot);

  const answers = JSON.parse(bundle.prospect_answers_json);
  assert.equal(answers.source_class, 'PROSPECT_REPORTED');
  assert.equal(answers.answers.length, 1);
  assert.equal(answers.answers[0].question_id, 'q_budget');
  assert.equal(answers.answers[0].answer_exact, 'Yes');
  assert.equal(answers.answers[0].selected_option_id, 'yes');
  assert.deepEqual(answers.answers[0].selected_option_postures, ['GENERIC_SAFE']);
});

test('zero-question FINALIZE adapter creates an empty answer set without fabrication', () => {
  const adapted = buildFinalizeProspectAnswers({
    opportunity_id: 'opp_zero',
    clarification_result: {
      required: false,
      source_class: null,
      submitted_at: null,
      answers: []
    }
  });

  assert.equal(adapted.clarification_required, false);
  assert.equal(adapted.source_class, null);
  assert.deepEqual(adapted.answers, []);
});
