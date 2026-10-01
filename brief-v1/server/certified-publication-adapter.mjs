import { compileBriefPublishReady } from './publication-contract.mjs';
import { compilePrecallScorecard } from './precall-scorecard.mjs';
import { resolvePrecallScoreBasis } from './precall-score-basis-resolver.mjs';
import { projectServiceAuthority } from './service-authority-projection.mjs';
import { validateCompanySnapshotV1 } from './company-snapshot-v1.mjs';

function parseMaybeJson(value, code) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  try { return JSON.parse(value); }
  catch { throw new Error(code); }
}

function assertPass(value, code) {
  const parsed = parseMaybeJson(value, code);
  if (parsed?.audit_status !== 'PASS') throw new Error(code);
  return parsed;
}

function assertValidation(value, code) {
  const parsed = parseMaybeJson(value, code);
  if (parsed?.ok !== true) throw new Error(code);
  return parsed;
}

function optionalCompanySnapshot(value, context) {
  if (value == null || value === '') return null;
  let parsed;
  try { parsed = parseMaybeJson(value, 'COMPANY_SNAPSHOT_INVALID'); }
  catch { return null; }
  const validation = validateCompanySnapshotV1(parsed, context);
  if (!validation.ok) return null;
  return { ...parsed, validation };
}

export function compileCertifiedBriefPublication(input = {}) {
  const prepare = parseMaybeJson(input.prepare, 'PREPARE_REQUIRED');
  const discovery = parseMaybeJson(input.discovery, 'DISCOVERY_REQUIRED');

  const premiumAudit = assertPass(input.premium_audit, 'PREMIUM_AUDIT_PASS_REQUIRED');
  const discoveryAudit = assertPass(input.discovery_audit, 'DISCOVERY_AUDIT_PASS_REQUIRED');
  const premiumValidation = assertValidation(input.premium_validation, 'PREMIUM_VALIDATION_PASS_REQUIRED');
  const discoveryValidation = assertValidation(input.discovery_validation, 'DISCOVERY_VALIDATION_PASS_REQUIRED');

  const certification = {
    schema_version: 'CLARIS_PRECALL_CERTIFICATION_V1',
    premium_semantic_pass: premiumAudit.audit_status === 'PASS',
    discovery_semantic_pass: discoveryAudit.audit_status === 'PASS',
    premium_deterministic_pass: premiumValidation.ok === true,
    discovery_deterministic_pass: discoveryValidation.ok === true
  };

  const consultantSot = parseMaybeJson(input.consultant_sot, 'CONSULTANT_SOT_REQUIRED');
  const scoreBasis = input.precall_score_basis == null
    ? null
    : parseMaybeJson(input.precall_score_basis, 'PRECALL_SCORE_BASIS_INVALID');

  let scorecard = null;
  if (scoreBasis) {
    const researchEvidence = parseMaybeJson(input.precall_research_evidence, 'PRECALL_RESEARCH_EVIDENCE_REQUIRED');
    const resolvedScoreBasis = resolvePrecallScoreBasis({
      score_basis: scoreBasis,
      booking_text: input.booking_text,
      consultant_sot: consultantSot,
      research_evidence: researchEvidence,
      prepare,
      discovery
    });
    scorecard = compilePrecallScorecard({
      score_basis: resolvedScoreBasis,
      prepare,
      discovery,
      certification
    });
  }

  const projected = projectServiceAuthority({
    prepare,
    discovery,
    scorecard,
    consultant_sot: consultantSot
  });

  const companySnapshot = optionalCompanySnapshot(input.company_snapshot_v1 || input.company_snapshot, {
    domain_host: input.domain_host,
    prospect_name: input.prospect_name,
    company: input.company
  });

  const compiled = compileBriefPublishReady({
    opportunity_id: input.opportunity_id,
    consultant_id: input.consultant_id,
    consultant_delivery_email: input.consultant_delivery_email,
    consultant_first_name: input.consultant_first_name,
    company: input.company,
    prospect_name: input.prospect_name,
    prospect_role: input.prospect_role,
    meeting_time: input.meeting_time,
    booking_text: input.booking_text,
    ttl_days: input.ttl_days,
    prepare: projected.prepare,
    discovery: projected.discovery,
    scorecard: projected.scorecard,
    company_snapshot_v1: companySnapshot,
    consultant_sot: consultantSot
  });

  return {
    ...compiled,
    body: {
      ...compiled.body,
      certification
    }
  };
}
