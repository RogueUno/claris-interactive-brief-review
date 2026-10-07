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
import { triggerFinalizeContinuation } from '../finalize-continuation.mjs';

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
  assert.equal(submitted.opportunity_id, 'opp_finalize_001');

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
  assert.equal(bundle.finalize_provenance.schema_version, 'claris_finalize_provenance_v1');
  assert.equal(bundle.finalize_provenance.opportunity_id, 'opp_finalize_001');
  assert.equal(bundle.finalize_provenance.opportunity_version, loaded.etag);
  assert.equal(bundle.finalize_provenance.accepted_answer_count, 1);
  assert.equal(bundle.finalize_provenance.clarification_required, true);
  assert.match(bundle.finalize_provenance.prospect_answers_sha256, /^[a-f0-9]{64}$/);
  assert.match(bundle.finalize_provenance_digest, /^[a-f0-9]{64}$/);
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


test('FINALIZE continuation posts only canonical opportunity id', async () => {
  let captured = null;
  const result = await triggerFinalizeContinuation(' opp_finalize_001 ', {
    webhookUrl: 'https://example.test/finalize',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 200 };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(captured.url, 'https://example.test/finalize');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(captured.options.body), { opportunity_id: 'opp_finalize_001' });
});

test('FINALIZE continuation reports unavailable configuration without throwing', async () => {
  const result = await triggerFinalizeContinuation('opp_finalize_001', { webhookUrl: '' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'FINALIZE_WEBHOOK_NOT_CONFIGURED');
});


test('FINALIZE delivery owner is bound server-side and never exposed to prospect views', async () => {
  const { repository, service } = fixture();
  const finalizeContext = buildFinalizeContext({
    case_state_json: caseState,
    consultant_sot_json: sot,
    consultant: { consultant_id: 'consultant_1' },
    consultant_id: 'consultant_1',
    consultant_delivery_email: 'SARAH@EXAMPLE.COM'
  }, { now: 1000 });
  // Older fixture uses a two-character option ID ("no"), invalid under the
  // current contract; repair only this test's local package, not the baseline fixture.
  const ownedPackage = pkg();
  ownedPackage.questions[0].options[1].option_id = 'nope';
  await service.createPackage(ownedPackage, { now: 1000, ttlMs: 60000, finalizeContext });
  const loaded = await repository.loadEnvelopeWithMeta('opp_finalize_001');
  assert.equal(loaded.envelope.finalize_context.consultant_id, 'consultant_1');
  assert.equal(loaded.envelope.finalize_context.consultant_delivery_email, 'sarah@example.com');
  const safe = publicClarificationPackage(loaded.envelope.package);
  assert.doesNotMatch(JSON.stringify(safe), /sarah@example.com|finalize_context|consultant_delivery_email/);
  const created = await service.reissueInvite('opp_finalize_001', { now: 1001, ttlMs: 60_000 });
  const resolved = await service.resolveInvite(created.invite_token, { now: 1002 });
  assert.equal(resolved.ok, true);
  const submitted = await service.submit(
    resolved.session_token,
    [{ question_id: 'q_budget', value: 'yes' }],
    { now: 1003, expectedVersion: resolved.opportunity_version }
  );
  assert.equal(submitted.ok, true);
  const updated = await repository.loadEnvelopeWithMeta('opp_finalize_001');
  const bundle = buildFinalizeBundle(updated.envelope, updated.etag);
  assert.equal(bundle.ok, true);
  assert.equal(bundle.consultant_id, 'consultant_1');
  assert.equal(bundle.consultant_delivery_email, 'sarah@example.com');
  assert.doesNotMatch(bundle.prospect_answers_json, /sarah@example.com/);
});

test('FINALIZE owner mismatch or invalid email fails closed', () => {
  assert.throws(() => buildFinalizeContext({
    case_state_json: caseState, consultant_sot_json: sot,
    consultant: { consultant_id: 'consultant_1' },
    consultant_id: 'consultant_2',
    consultant_delivery_email: 'sarah@example.com'
  }), /FINALIZE_CONSULTANT_ID_MISMATCH/);
  assert.throws(() => buildFinalizeContext({
    case_state_json: caseState, consultant_sot_json: sot,
    consultant_id: 'consultant_1',
    consultant_delivery_email: 'not-an-email'
  }), /FINALIZE_DELIVERY_EMAIL_INVALID/);
  assert.throws(() => buildFinalizeContext({
    case_state_json: caseState, consultant_sot_json: sot,
    consultant_delivery_email: 'sarah@example.com'
  }), /FINALIZE_CONSULTANT_ID_REQUIRED/);
});

test('legacy clarification envelopes do not infer an email address', () => {
  const context = buildFinalizeContext({ case_state_json: caseState, consultant_sot_json: sot });
  assert.equal(context.consultant_delivery_email, null);
  assert.equal(context.consultant_id, null);
});

test('FINALIZE bundle refuses persisted owner mismatch against the package', async () => {
  const { repository, service } = fixture();
  const ownerPkg = pkg();
  ownerPkg.questions[0].options[1].option_id = 'nope';
  const ctx = buildFinalizeContext({
    case_state_json: caseState,
    consultant_sot_json: sot,
    consultant_id: 'consultant_1',
    consultant_delivery_email: 'first@example.com'
  });
  const created = await service.createPackage(ownerPkg, { now: 1000, ttlMs: 60000, finalizeContext: ctx });
  const resolved = await service.resolveInvite(created.invite_token, { now: 1001 });
  const submitted = await service.submit(
    resolved.session_token,
    [{ question_id: 'q_budget', value: 'yes' }],
    { now: 1002, expectedVersion: resolved.opportunity_version }
  );
  assert.equal(submitted.ok, true);

  const loaded = await repository.loadEnvelopeWithMeta('opp_finalize_001');
  const tampered = {
    ...loaded.envelope,
    finalize_context: { ...loaded.envelope.finalize_context, consultant_id: 'consultant_2' }
  };
  const result = buildFinalizeBundle(tampered, loaded.etag);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'FINALIZE_CONSULTANT_ID_MISMATCH');
  assert.equal(result.http_status, 409);
});


test('FINALIZE provenance digest is deterministic for one exact accepted-answer version', async()=>{
  const {repository,service}=fixture();
  const ctx=buildFinalizeContext({
    case_state_json:caseState,consultant_sot_json:sot,
    consultant_id:'consultant_1',consultant_delivery_email:'sarah@example.com'
  });
  const p=pkg();p.questions[0].options[1].option_id='nope';
  const created=await service.createPackage(p,{now:5000,ttlMs:60000,finalizeContext:ctx});
  const opened=await service.resolveInvite(created.invite_token,{now:5100});
  await service.submit(opened.session_token,[{question_id:'q_budget',value:'yes'}],{
    now:5200,expectedVersion:opened.opportunity_version
  });
  const loaded=await repository.loadEnvelopeWithMeta('opp_finalize_001');
  const a=buildFinalizeBundle(loaded.envelope,loaded.etag);
  const b=buildFinalizeBundle(loaded.envelope,loaded.etag);
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  assert.equal(a.finalize_provenance_digest,b.finalize_provenance_digest);
});

test('changing accepted answers or opportunity version changes FINALIZE provenance digest', async()=>{
  const {repository,service}=fixture();
  const ctx=buildFinalizeContext({
    case_state_json:caseState,consultant_sot_json:sot,
    consultant_id:'consultant_1',consultant_delivery_email:'sarah@example.com'
  });
  const p=pkg();p.questions[0].options[1].option_id='nope';
  const created=await service.createPackage(p,{now:6000,ttlMs:60000,finalizeContext:ctx});
  const opened=await service.resolveInvite(created.invite_token,{now:6100});
  await service.submit(opened.session_token,[{question_id:'q_budget',value:'yes'}],{
    now:6200,expectedVersion:opened.opportunity_version
  });
  const loaded=await repository.loadEnvelopeWithMeta('opp_finalize_001');
  const original=buildFinalizeBundle(loaded.envelope,loaded.etag);
  const changed=structuredClone(loaded.envelope);
  changed.response.answers[0].value='No';
  const changedAnswers=buildFinalizeBundle(changed,loaded.etag);
  const changedVersion=buildFinalizeBundle(loaded.envelope,loaded.etag+'-other');
  assert.notEqual(original.finalize_provenance_digest,changedAnswers.finalize_provenance_digest);
  assert.notEqual(original.finalize_provenance_digest,changedVersion.finalize_provenance_digest);
});
