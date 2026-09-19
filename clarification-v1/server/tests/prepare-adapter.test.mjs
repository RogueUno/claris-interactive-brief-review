import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptCertifiedPrepareToClarificationEvidence } from '../prepare-adapter.mjs';

function certifiedCaseState(overrides = {}) {
  return {
    prepare_advisory: {
      stage: 'AWAITING_PROSPECT_INPUT'
    },
    p3_repair_applied: false,
    p3_semantic_status: 'DUAL_CERTIFIED_PASS',
    p2_contract_gate_passed: true,
    artifact_contract_version: 'V3_TRUTH_BOUNDARY_3',
    compiler_contract_version: 'V3_CANONICAL_TRUTH_1',
    canonical_evidence_authority: 'MODULE_85_DETERMINISTIC_CANONICAL_TRUTH_COMPILER',
    canonical_truth_json: JSON.stringify({
      company: 'Acme',
      domain: 'https://acme.example',
      compiler_contract_version: 'V3_CANONICAL_TRUTH_1',
      booking_evidence: [{
        evidence_id: 'BOOK-001',
        authority: 'BOOKING_TEXT',
        statement: 'A customer is asking for security documentation.',
        exact_basis: 'A customer is asking for security documentation.',
        resolvable: true
      }],
      canonical_evidence_registry: [
        {
          evidence_id: 'FAC-001',
          admission_status: 'ADMITTED',
          sensitivity: 'STANDARD',
          channel: 'IDENTITY_PRODUCT',
          authority: 'VERIFIED_PUBLIC_FACT',
          strength: 'HIGH',
          freshness: 'UNKNOWN',
          source_date: 'UNKNOWN',
          source_url: 'https://acme.example/security',
          source_excerpt: 'Acme publishes a security page describing SOC 2 readiness.'
        },
        {
          evidence_id: 'FAC-007',
          admission_status: 'ADMITTED',
          sensitivity: 'SENSITIVE_CONSULTANT_ONLY',
          channel: 'CYBER_PUBLIC_SIGNAL',
          authority: 'THIRD_PARTY_REPORTED',
          strength: 'MEDIUM',
          freshness: 'DATED',
          source_date: '2026-02-01',
          source_url: 'https://news.example/acme',
          source_excerpt: 'A third-party report describes a historical security event.'
        },
        {
          evidence_id: 'FAC-009',
          admission_status: 'REJECTED',
          sensitivity: 'NONE',
          channel: 'CYBER_PUBLIC_SIGNAL',
          authority: 'REJECTED',
          strength: 'NONE',
          freshness: 'UNKNOWN',
          source_date: 'UNKNOWN',
          source_url: '',
          source_excerpt: ''
        }
      ]
    }),
    ...overrides
  };
}

function input(caseState = certifiedCaseState()) {
  return {
    opportunity_id: 'opp_prepare_001',
    case_state_json: JSON.stringify(caseState),
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

test('certified PREPARE maps BOOK and admitted FAC records into clarification evidence', () => {
  const bundle = adaptCertifiedPrepareToClarificationEvidence(input());
  assert.equal(bundle.evidence.length, 3);
  assert.equal(bundle.evidence[0].evidence_id, 'BOOK-001');
  assert.equal(bundle.evidence[0].source_type, 'BOOKING');
  assert.equal(bundle.evidence[1].evidence_id, 'FAC-001');
  assert.equal(bundle.evidence[1].authority, 'VERIFIED_PUBLIC_FACT');
  assert.equal(bundle.evidence[1].channel, 'IDENTITY_PRODUCT');
});

test('rejected FAC records are omitted rather than exposed as empty evidence', () => {
  const bundle = adaptCertifiedPrepareToClarificationEvidence(input());
  assert.equal(bundle.evidence.some((item) => item.evidence_id === 'FAC-009'), false);
});

test('sensitive consultant-only FAC records become INTERNAL_ONLY', () => {
  const bundle = adaptCertifiedPrepareToClarificationEvidence(input());
  const sensitive = bundle.evidence.find((item) => item.evidence_id === 'FAC-007');
  assert.equal(sensitive.visibility, 'INTERNAL_ONLY');
  assert.equal(sensitive.source_type, 'PUBLIC_WEB');
});

test('adapter preserves PREPARE certification metadata without turning advisory output into evidence', () => {
  const bundle = adaptCertifiedPrepareToClarificationEvidence(input());
  assert.equal(bundle.prepare_certification.semantic_status, 'DUAL_CERTIFIED_PASS');
  assert.equal(bundle.prepare_certification.prepare_stage, 'AWAITING_PROSPECT_INPUT');
  assert.equal(bundle.evidence.some((item) => item.evidence_id.startsWith('Q-')), false);
});

test('controlled repaired PREPARE is accepted only when dual-certified', () => {
  const state = certifiedCaseState({
    p3_repair_applied: true,
    p3_semantic_status: 'CONTROLLED_REPAIR_DUAL_CERTIFIED_PASS'
  });
  const bundle = adaptCertifiedPrepareToClarificationEvidence(input(state));
  assert.equal(bundle.prepare_certification.repaired, true);
});

test('uncertified PREPARE fails closed', () => {
  const state = certifiedCaseState({ p3_semantic_status: 'FAILED' });
  assert.throws(
    () => adaptCertifiedPrepareToClarificationEvidence(input(state)),
    /PREPARE_SEMANTIC_NOT_CERTIFIED/
  );
});

test('unknown PREPARE artifact contract fails closed', () => {
  const state = certifiedCaseState({ artifact_contract_version: 'V4_UNKNOWN' });
  assert.throws(
    () => adaptCertifiedPrepareToClarificationEvidence(input(state)),
    /PREPARE_ARTIFACT_CONTRACT_UNSUPPORTED/
  );
});

test('canonical truth compiler version must match certified case state', () => {
  const state = certifiedCaseState();
  const truth = JSON.parse(state.canonical_truth_json);
  truth.compiler_contract_version = 'V2_OLD';
  state.canonical_truth_json = JSON.stringify(truth);

  assert.throws(
    () => adaptCertifiedPrepareToClarificationEvidence(input(state)),
    /PREPARE_CANONICAL_TRUTH_VERSION_MISMATCH/
  );
});

test('company can be derived from canonical truth when caller omits it', () => {
  const value = input();
  value.prospect.company = '';
  const bundle = adaptCertifiedPrepareToClarificationEvidence(value);
  assert.equal(bundle.prospect.company, 'Acme');
});


test('frozen PREPARE module reference is trace-only and does not block canonical evidence adaptation', () => {
  const state = certifiedCaseState({ prepare_advisory: 104 });
  const bundle = adaptCertifiedPrepareToClarificationEvidence(input(state));
  assert.equal(bundle.prepare_certification.prepare_stage, null);
  assert.equal(bundle.prepare_certification.prepare_advisory_ref, '104');
  assert.equal(bundle.evidence.some((item) => item.evidence_id === 'BOOK-001'), true);
  assert.equal(bundle.evidence.some((item) => item.evidence_id === 'FAC-001'), true);
});
