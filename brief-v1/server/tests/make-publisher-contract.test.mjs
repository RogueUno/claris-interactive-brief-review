import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileCertifiedBriefPublication } from '../certified-publication-adapter.mjs';

const contract = JSON.parse(
  fs.readFileSync(
    new URL('../../../reference/premium-gauntlet/make-publisher-v1/contract.json', import.meta.url),
    'utf8'
  )
);

test('Make publisher remains a transport-only boundary', () => {
  assert.equal(contract.operation, 'brief_publish_ready');
  assert.equal(contract.role, 'transport_only');
  assert.deepEqual(contract.required_inputs, ['publish_ready_body_json']);
  assert.equal(contract.upstream_body_contract.make_may_reconstruct, false);
  assert.equal(contract.upstream_body_contract.make_may_synthesize_certification, false);
  assert.equal(contract.dedupe_contract.persistent_store_may_contain_private_url, false);
  assert.equal(contract.dedupe_contract.gmail_runs_only_when_key_absent, true);
  assert.equal(contract.dedupe_contract.receipt_written_only_after_gmail_success, true);
  assert.equal(contract.response_contract.first_publish_status, 201);
  assert.equal(contract.response_contract.identical_retry_status, 200);
});

test('certified upstream body is minimized before Make receives it', () => {
  const prepare = {
    schema_version: 'CLARIS_PREMIUM_PREPARE_V3_6',
    executive_readout: 'Dense readout.',
    open_dimensions: [{ dimension_id: 'D1', max_questions: 1 }]
  };
  const discovery = {
    schema_version: 'CLARIS_DISCOVERY_INTELLIGENCE_V1_2',
    authorized_dimensions: [{ dimension_id: 'D1', authority: 'PREPARE', policy_key: null }],
    commercial_target: [],
    primary_questions: [{
      question_id: 'Q1',
      dimension_id: 'D1',
      ask: 'Which surface is in scope?',
      linked_service_paths: [{ service_id: 'SVC_ADVISORY', condition: 'Guidance requested.' }],
      conditional_probes: []
    }],
    end_of_call_decision: {
      ready_for_next_step_if: ['Scope clear.'],
      remain_in_discovery_if: ['D1 unresolved.'],
      disqualify_or_deprioritize_if: ['Outside capabilities.']
    }
  };

  const compiled = compileCertifiedBriefPublication({
    opportunity_id: 'opp_contract_1',
    consultant_id: 'consultant_contract_1',
    consultant_delivery_email: 'consultant@example.com',
    company: 'Acme',
    prepare,
    discovery,
    consultant_sot: {
      services: [{
        service_id: 'SVC_ADVISORY',
        name: 'Advisory vCISO',
        private_margin_percent: 72,
        internal_note: 'Never expose'
      }],
      commercial_rules: {
        budget_required_before_first_call: false,
        minimum_viable_engagement_usd: 7500
      },
      private_strategy: { note: 'Profile-only' }
    },
    premium_audit: { audit_status: 'PASS' },
    discovery_audit: { audit_status: 'PASS' },
    premium_validation: { ok: true },
    discovery_validation: { ok: true }
  });

  const serialized = JSON.stringify(compiled.body);
  assert.equal(serialized.includes('7500'), false);
  assert.equal(serialized.includes('private_margin_percent'), false);
  assert.equal(serialized.includes('internal_note'), false);
  assert.equal(serialized.includes('Profile-only'), false);
  assert.equal(compiled.body.certification.schema_version, 'CLARIS_PRECALL_CERTIFICATION_V1');
  assert.equal(compiled.body.certification.premium_semantic_pass, true);
  assert.equal(compiled.body.certification.discovery_semantic_pass, true);
  assert.equal(compiled.body.certification.premium_deterministic_pass, true);
  assert.equal(compiled.body.certification.discovery_deterministic_pass, true);
});
