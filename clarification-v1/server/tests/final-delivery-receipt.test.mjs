import test from 'node:test';
import assert from 'node:assert/strict';
import { createClarificationRepository } from '../repository.mjs';
import { createClarificationService } from '../service.mjs';
import { buildFinalizeContext } from '../finalize-handoff.mjs';
import { claimFinalDelivery, acknowledgeFinalDelivery,
  checkFinalDeliveryEligibility, inspectFinalDeliveryReceipt } from '../final-delivery-receipt.mjs';

const consultantId = 'consultant_claim';
const ownerEmail = 'claim@example.com';
const sot = { consultant: { consultant_name: 'Chris Person', firm: 'Claim Advisory' }, services: [] };
const audit = { audit_status: 'PASS', violations: [], repair_required: false };
const validFinal = {
  opportunity_id: 'opportunity_claim_001',
  status: 'FINALIZED',
  final_audit_json: JSON.stringify(audit),
  final_brief_markdown: '# Certified CLARIS Brief\nVerified evidence.'
};

function fixture() {
  const map = new Map();
  let rev = 0;
  const storage = {
    async getJson(path) { return map.has(path) ? structuredClone(map.get(path).value) : null; },
    async getJsonWithMeta(path) {
      const stored = map.get(path);
      return stored
        ? { value: structuredClone(stored.value), etag: stored.etag }
        : { value: null, etag: null };
    },
    async putJson(path, value, { ifMatch = null } = {}) {
      const current = map.get(path);
      if (ifMatch && (!current || current.etag !== ifMatch)) {
        const e = new Error('BLOB_PRECONDITION_FAILED');
        e.code = 'BLOB_PRECONDITION_FAILED';
        throw e;
      }
      const etag = 'e-' + ++rev;
      map.set(path, { value: structuredClone(value), etag });
      return { etag };
    }
  };
  const repository = createClarificationRepository(storage);
  const service = createClarificationService({
    repository, sessionSecret: 'test-secret-32-byte-minimum-value'
  });
  const consultantRepository = {
    async loadIdentity() { return { consultant_id: consultantId, delivery_email: ownerEmail }; },
    async loadProfileEnvelopeWithMeta() {
      return {
        etag: 'profile-etag',
        envelope: {
          consultant_id: consultantId,
          lifecycle_record: {
            consultant_id: consultantId, status: 'LOCKED',
            runtime_v3: {
              status: 'READY', consultant_sot_json: sot,
              report: { errors: [], warnings: [] }
            }
          }
        }
      };
    }
  };
  return { map, storage, repository, service, consultantRepository };
}

function pkg() {
  return {
    opportunity_id: validFinal.opportunity_id,
    consultant: { consultant_id: consultantId, first_name: 'Chris', firm: 'Claim Advisory' },
    prospect: { first_name: 'Robin', company: 'Example', role: 'Engineering' },
    questions: [{
      question_id: 'q_budget',
      mode: 'DISCOVER',
      prompt: 'Do you have an authorized security budget?',
      response_type: 'SINGLE_CHOICE',
      options: [
        { option_id: 'yes', label: 'Yes', posture: 'GENERIC_SAFE', basis_ids: [] },
        { option_id: 'nope', label: 'No', posture: 'GENERIC_SAFE', basis_ids: [] }
      ],
      allow_other: true, allow_unsure: true, required: true, evidence_refs: []
    }]
  };
}

async function prepared({ legacy = false } = {}) {
  const f = fixture();
  const context = buildFinalizeContext({
    case_state_json: JSON.stringify({ truth: 'frozen' }),
    consultant_sot_json: JSON.stringify(sot),
    ...(!legacy ? { consultant_id: consultantId, consultant_delivery_email: ownerEmail } : {})
  }, { now: 1000 });
  const c = await f.service.createPackage(pkg(), {
    now: 1000, ttlMs: 360000, finalizeContext: context
  });
  const opened = await f.service.resolveInvite(c.invite_token, { now: 1100 });
  assert.equal(opened.ok, true);
  const answer = await f.service.submit(
    opened.session_token,
    [{ question_id: 'q_budget', value: 'yes' }],
    { now: 1200, expectedVersion: opened.opportunity_version }
  );
  assert.equal(answer.ok, true);
  return f;
}

test('preflight → claim → provider acknowledgment → duplicate is a no-send', async () => {
  const f = await prepared();
  const services = { repository: f.repository, consultantRepository: f.consultantRepository };
  const preflight = await checkFinalDeliveryEligibility(validFinal, services);
  assert.equal(preflight.status, 'ELIGIBLE');

  const claim = await claimFinalDelivery(validFinal, services);
  assert.equal(claim.ok, true);
  assert.equal(claim.status, 'CLAIMED');
  assert.equal(claim.consultant_delivery_email, ownerEmail);
  assert.match(claim.claim_token, /^[a-f0-9]{64}$/);
  assert.match(claim.digest, /^[a-f0-9]{64}$/);
  assert.match(claim.email_subject, /CLARIS/);
  assert.match(claim.email_html, /Certified CLARIS Brief/);
  assert.doesNotMatch(claim.email_html, /<script|<img/i);

  const persisted = await f.repository.loadEnvelopeWithMeta(validFinal.opportunity_id);
  assert.equal(persisted.envelope.final_delivery_receipt.status, 'RESERVED');
  assert.ok(!JSON.stringify(persisted.envelope.final_delivery_receipt).includes('Verified evidence.'));
  const repeat = await claimFinalDelivery(validFinal, services);
  assert.equal(repeat.status, 'RECONCILIATION_REQUIRED');
  assert.equal((await checkFinalDeliveryEligibility(validFinal, services)).status, 'RECONCILIATION_REQUIRED');

  const unauthorizedAck = await acknowledgeFinalDelivery({
    opportunity_id: validFinal.opportunity_id,
    claim_token: 'f'.repeat(64),
    provider_message_id: 'msg-1'
  }, { repository: f.repository });
  assert.equal(unauthorizedAck.status, 'BLOCKED');

  const ack = await acknowledgeFinalDelivery({
    opportunity_id: validFinal.opportunity_id,
    claim_token: claim.claim_token,
    provider_message_id: 'msg-1'
  }, { repository: f.repository });
  assert.equal(ack.status, 'ACKNOWLEDGED');
  assert.equal(ack.reused, false);
  const repeatedAck = await acknowledgeFinalDelivery({
    opportunity_id: validFinal.opportunity_id,
    claim_token: claim.claim_token,
    provider_message_id: 'msg-1'
  }, { repository: f.repository });
  assert.equal(repeatedAck.status, 'ACKNOWLEDGED');
  assert.equal(repeatedAck.reused, true);
  const forgedAck = await acknowledgeFinalDelivery({
    opportunity_id: validFinal.opportunity_id,
    claim_token: claim.claim_token,
    provider_message_id: 'another-message'
  }, { repository: f.repository });
  assert.equal(forgedAck.status, 'BLOCKED');
  const duplicate = await claimFinalDelivery(validFinal, services);
  assert.equal(duplicate.status, 'SKIPPED_ALREADY_SENT');
  assert.equal((await checkFinalDeliveryEligibility(validFinal, services)).status, 'SKIPPED_ALREADY_SENT');
  assert.equal(inspectFinalDeliveryReceipt(
    (await f.repository.loadEnvelopeWithMeta(validFinal.opportunity_id)).envelope
  ).status, 'SENT');
});

test('provider-unknown reservation never auto-retries or expires', async () => {
  const f = await prepared();
  const opts = { repository: f.repository, consultantRepository: f.consultantRepository };
  const claim = await claimFinalDelivery(validFinal, { ...opts, now: 1000 });
  assert.equal(claim.status, 'CLAIMED');
  assert.equal((await claimFinalDelivery(validFinal, { ...opts, now: 1000 + 365 * 86400000 })).status,
    'RECONCILIATION_REQUIRED');
});

test('no delivery reservation for legacy no-owner or wrong tenant', async () => {
  const legacy = await prepared({ legacy: true });
  assert.equal((await checkFinalDeliveryEligibility(validFinal, {
    repository: legacy.repository, consultantRepository: legacy.consultantRepository
  })).status, 'BLOCKED');
  assert.equal((await claimFinalDelivery(validFinal, {
    repository: legacy.repository, consultantRepository: legacy.consultantRepository
  })).status, 'BLOCKED');

  const f = await prepared();
  const other = {
    ...f.consultantRepository,
    async loadIdentity() { return { consultant_id: 'somebody_else', delivery_email: ownerEmail }; }
  };
  assert.equal((await claimFinalDelivery(validFinal, {
    repository: f.repository, consultantRepository: other
  })).status, 'BLOCKED');
});

test('failed audit, missing brief and wrong status cannot reserve', async () => {
  const f = await prepared();
  const opts = { repository: f.repository, consultantRepository: f.consultantRepository };
  const bads = [
    { final_audit_json: JSON.stringify({ audit_status: 'PASS', violations: [1], repair_required: false }) },
    { final_audit_json: JSON.stringify({ audit_status: 'FAIL', violations: [], repair_required: false }) },
    { final_audit_json: 'not-json' }, { status: 'READY' }, { final_brief_markdown: ' ' }
  ];
  for (const updates of bads) {
    const result = await claimFinalDelivery({ ...validFinal, ...updates }, opts);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.error, 'FINAL_DELIVERY_NOT_CERTIFIED');
  }
  assert.equal((await checkFinalDeliveryEligibility(validFinal, opts)).status, 'ELIGIBLE');
});

test('concurrent claims: only one CAS writer can win', async () => {
  const f = await prepared();
  const opts = { repository: f.repository, consultantRepository: f.consultantRepository };
  const results = await Promise.all([
    claimFinalDelivery(validFinal, opts),
    claimFinalDelivery(validFinal, opts)
  ]);
  assert.equal(results.filter(x => x.status === 'CLAIMED').length, 1);
  assert.equal(results.filter(x => x.status === 'CLAIM_CONFLICT' ||
    x.status === 'RECONCILIATION_REQUIRED').length, 1);
});

test('unversioned storage and a corrupt receipt always fail closed', async () => {
  const f = await prepared();
  const brokenRepo = {
    ...f.repository,
    async loadEnvelopeWithMeta(id) {
      const loaded = await f.repository.loadEnvelopeWithMeta(id);
      return { ...loaded, etag: null };
    }
  };
  assert.equal((await claimFinalDelivery(validFinal, {
    repository: brokenRepo, consultantRepository: f.consultantRepository
  })).error, 'FINAL_DELIVERY_ATOMIC_WRITE_UNAVAILABLE');
  const loaded = await f.repository.loadEnvelopeWithMeta(validFinal.opportunity_id);
  await f.repository.saveEnvelopeWithMeta(validFinal.opportunity_id, {
    ...loaded.envelope,
    final_delivery_receipt: { status: 'SENT', schema_version: 'untrusted' }
  }, { ifMatch: loaded.etag });
  assert.equal((await claimFinalDelivery(validFinal, {
    repository: f.repository, consultantRepository: f.consultantRepository
  })).error, 'FINAL_DELIVERY_RECEIPT_INVALID');
});

test('email HTML escapes model-provided markup instead of executing it', async () => {
  const f = await prepared();
  const malicious = '<script>alert("hello")</script> <img src=x onerror="evil()">';
  const claim = await claimFinalDelivery({
    ...validFinal, final_brief_markdown: '# Brief\\n' + malicious
  }, { repository: f.repository, consultantRepository: f.consultantRepository });
  assert.equal(claim.status, 'CLAIMED');
  assert.ok(claim.email_html.includes('&lt;script&gt;'));
  assert.ok(claim.email_html.includes('&lt;img'));
  assert.doesNotMatch(claim.email_html, /<script|<img/i);
});

test('protected submitted delivery requires a matching rendered final artifact', async () => {
 const f = await prepared();
 const opts = {repository:f.repository, consultantRepository:f.consultantRepository};
 const input = {...validFinal, require_rendered_artifact:true};
 assert.equal((await claimFinalDelivery(input, opts)).error, 'FINAL_DELIVERY_ARTIFACT_REQUIRED');
 const incomplete = {...input, final_stage_output_json: JSON.stringify({consultant_prep_strategy:{primary_service_id:'SVC_SOC2'}})};
 assert.equal((await claimFinalDelivery(incomplete, opts)).status, 'BLOCKED');
 const validArtifact={preliminary_brief:{summary_markdown:'Rehearsal-only briefing'}, match_analysis:{supported_match_score:15,scorable_coverage:30,classifications:{scope:{status:'PARTIAL_MATCH'}}}, consultant_prep_strategy:{recommended_action:'Perform rehearsal',key_talking_points:['Respect scope'],qualification_status:'UNQUALIFIED_SYNTHETIC'},prospect_question_plan:[{question:'What is in scope?'}]};
 const mismatched={...input,final_stage_output_json:JSON.stringify(validArtifact)};
 assert.equal((await claimFinalDelivery(mismatched,opts)).error,'FINAL_DELIVERY_RENDER_MISMATCH');
 assert.equal((await checkFinalDeliveryEligibility(input,opts)).status,'ELIGIBLE');
});

test('exact October 9 historical artifact can be claimed only with matching full rendered brief', async () => {
  const {readFileSync} = await import('node:fs');
  const {renderFinalBrief} = await import('../final-brief-renderer.mjs');
  const raw = readFileSync(new URL('./fixtures/oct09-finalize-actual.json', import.meta.url), 'utf8');
  const rendered = renderFinalBrief(raw);
  assert.ok(rendered.brief_markdown.length > 1500);
  const f = await prepared();
  const opts = {repository: f.repository, consultantRepository: f.consultantRepository};
  const input = {...validFinal, require_rendered_artifact: 'true',
    final_stage_output_json: raw, final_brief_markdown: rendered.brief_markdown};
  const claim = await claimFinalDelivery(input, opts);
  assert.equal(claim.status, 'CLAIMED');
  assert.match(claim.email_html, /Maintain rehearsal scope separation/);
  assert.equal((await claimFinalDelivery(input, opts)).status, 'RECONCILIATION_REQUIRED');
  const ack = await acknowledgeFinalDelivery({
    opportunity_id: validFinal.opportunity_id, claim_token: claim.claim_token,
    provider_message_id: 'offline-no-send'
  }, {repository: f.repository});
  assert.equal(ack.status, 'ACKNOWLEDGED');
  assert.equal((await claimFinalDelivery(input, opts)).status, 'SKIPPED_ALREADY_SENT');
});
