import { normalizeClarificationEvidenceBundle } from './evidence.mjs';

const ACCEPTED_ARTIFACT_CONTRACTS = new Set(['V3_TRUTH_BOUNDARY_3']);
const ACCEPTED_COMPILER_CONTRACTS = new Set(['V3_CANONICAL_TRUTH_1']);
const ACCEPTED_SEMANTIC_STATUSES = new Set([
  'DUAL_CERTIFIED_PASS',
  'CONTROLLED_REPAIR_DUAL_CERTIFIED_PASS'
]);
const EXPECTED_AUTHORITY = 'MODULE_85_DETERMINISTIC_CANONICAL_TRUTH_COMPILER';

function parseJson(value, field) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) throw new Error(`${field}_REQUIRED`);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not-object');
    }
    return parsed;
  } catch {
    throw new Error(`${field}_INVALID_JSON`);
  }
}

function trueValue(value) {
  return value === true || String(value).trim().toLowerCase() === 'true';
}

function required(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field}_REQUIRED`);
  return text;
}

function optional(value) {
  const text = String(value || '').trim();
  return text || null;
}

function validateCertifiedCaseState(caseState) {
  const artifactContract = String(caseState?.artifact_contract_version || '').trim();
  const compilerContract = String(caseState?.compiler_contract_version || '').trim();
  const authority = String(caseState?.canonical_evidence_authority || '').trim();
  const semanticStatus = String(caseState?.p3_semantic_status || '').trim();

  if (!ACCEPTED_ARTIFACT_CONTRACTS.has(artifactContract)) {
    throw new Error('PREPARE_ARTIFACT_CONTRACT_UNSUPPORTED');
  }
  if (!ACCEPTED_COMPILER_CONTRACTS.has(compilerContract)) {
    throw new Error('PREPARE_COMPILER_CONTRACT_UNSUPPORTED');
  }
  if (authority !== EXPECTED_AUTHORITY) {
    throw new Error('PREPARE_CANONICAL_AUTHORITY_INVALID');
  }
  if (!trueValue(caseState?.p2_contract_gate_passed)) {
    throw new Error('PREPARE_P2_CONTRACT_NOT_CERTIFIED');
  }
  if (!ACCEPTED_SEMANTIC_STATUSES.has(semanticStatus)) {
    throw new Error('PREPARE_SEMANTIC_NOT_CERTIFIED');
  }
  const prepareAdvisory = caseState?.prepare_advisory;
  const prepareStage = prepareAdvisory && typeof prepareAdvisory === 'object'
    ? String(prepareAdvisory.stage || '').trim() || null
    : null;
  const prepareAdvisoryRef = prepareAdvisory != null && typeof prepareAdvisory !== 'object'
    ? String(prepareAdvisory).trim() || null
    : null;

  return {
    artifact_contract_version: artifactContract,
    compiler_contract_version: compilerContract,
    semantic_status: semanticStatus,
    repaired: caseState?.p3_repair_applied === true ||
      String(caseState?.p3_repair_applied || '').trim().toLowerCase() === 'true',
    prepare_stage: prepareStage,
    prepare_advisory_ref: prepareAdvisoryRef
  };
}

function bookingEvidence(canonicalTruth) {
  return (Array.isArray(canonicalTruth?.booking_evidence) ? canonicalTruth.booking_evidence : [])
    .filter((item) => String(item?.evidence_id || '').trim())
    .map((item) => ({
      evidence_id: String(item.evidence_id).trim(),
      source_type: 'BOOKING',
      subject: 'OPPORTUNITY',
      visibility: 'PROSPECT_SAFE',
      statement: required(item.statement || item.exact_basis, `PREPARE_${item.evidence_id}_STATEMENT`),
      ref: `prepare://${String(item.evidence_id).trim()}`,
      authority: optional(item.authority) || 'BOOKING_TEXT',
      strength: 'HIGH',
      freshness: 'CURRENT_BOOKING',
      source_date: null,
      channel: 'BOOKING_TEXT'
    }));
}

function publicEvidence(canonicalTruth) {
  const registry = Array.isArray(canonicalTruth?.canonical_evidence_registry)
    ? canonicalTruth.canonical_evidence_registry
    : [];

  return registry
    .filter((item) => String(item?.admission_status || '').trim() === 'ADMITTED')
    .map((item) => {
      const evidenceId = required(item?.evidence_id, 'PREPARE_FAC_ID');
      const sensitive = String(item?.sensitivity || '').trim() === 'SENSITIVE_CONSULTANT_ONLY';
      return {
        evidence_id: evidenceId,
        source_type: 'PUBLIC_WEB',
        subject: 'COMPANY',
        visibility: sensitive ? 'INTERNAL_ONLY' : 'PROSPECT_SAFE',
        statement: required(item?.source_excerpt, `PREPARE_${evidenceId}_EXCERPT`),
        ref: required(item?.source_url, `PREPARE_${evidenceId}_URL`),
        authority: optional(item?.authority),
        strength: optional(item?.strength),
        freshness: optional(item?.freshness),
        source_date: optional(item?.source_date),
        channel: optional(item?.channel)
      };
    });
}

function resolveCompany(canonicalTruth, prospect) {
  return optional(prospect?.company) || required(canonicalTruth?.company, 'PROSPECT_COMPANY');
}

export function adaptCertifiedPrepareToClarificationEvidence(input) {
  const caseState = parseJson(
    input?.case_state_json ?? input?.stage_output_json ?? input?.case_state,
    'PREPARE_CASE_STATE'
  );
  const certification = validateCertifiedCaseState(caseState);
  const canonicalTruth = parseJson(caseState.canonical_truth_json, 'PREPARE_CANONICAL_TRUTH');

  if (String(canonicalTruth?.compiler_contract_version || '').trim() !== certification.compiler_contract_version) {
    throw new Error('PREPARE_CANONICAL_TRUTH_VERSION_MISMATCH');
  }

  const consultant = input?.consultant || {};
  const prospect = input?.prospect || {};

  const bundle = normalizeClarificationEvidenceBundle({
    opportunity_id: required(input?.opportunity_id, 'OPPORTUNITY_ID'),
    consultant: {
      consultant_id: required(consultant.consultant_id, 'CONSULTANT_ID'),
      first_name: required(consultant.first_name, 'CONSULTANT_FIRST_NAME'),
      firm: required(consultant.firm, 'CONSULTANT_FIRM')
    },
    prospect: {
      first_name: required(prospect.first_name, 'PROSPECT_FIRST_NAME'),
      role: optional(prospect.role),
      company: resolveCompany(canonicalTruth, prospect)
    },
    evidence: [
      ...bookingEvidence(canonicalTruth),
      ...publicEvidence(canonicalTruth)
    ]
  });

  return {
    ...bundle,
    prepare_certification: {
      artifact_contract_version: certification.artifact_contract_version,
      compiler_contract_version: certification.compiler_contract_version,
      semantic_status: certification.semantic_status,
      repaired: certification.repaired,
      prepare_stage: certification.prepare_stage,
      prepare_advisory_ref: certification.prepare_advisory_ref
    }
  };
}

export const prepareClarificationAdapterPolicy = Object.freeze({
  accepted_artifact_contracts: [...ACCEPTED_ARTIFACT_CONTRACTS],
  accepted_compiler_contracts: [...ACCEPTED_COMPILER_CONTRACTS],
  accepted_semantic_statuses: [...ACCEPTED_SEMANTIC_STATUSES],
  canonical_evidence_authority: EXPECTED_AUTHORITY
});
