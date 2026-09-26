import { compileBriefPublishReady } from './publication-contract.mjs';

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

export function compileCertifiedBriefPublication(input = {}) {
  const prepare = parseMaybeJson(input.prepare, 'PREPARE_REQUIRED');
  const discovery = parseMaybeJson(input.discovery, 'DISCOVERY_REQUIRED');

  const premiumAudit = assertPass(input.premium_audit, 'PREMIUM_AUDIT_PASS_REQUIRED');
  const discoveryAudit = assertPass(input.discovery_audit, 'DISCOVERY_AUDIT_PASS_REQUIRED');
  const premiumValidation = assertValidation(input.premium_validation, 'PREMIUM_VALIDATION_PASS_REQUIRED');
  const discoveryValidation = assertValidation(input.discovery_validation, 'DISCOVERY_VALIDATION_PASS_REQUIRED');

  const compiled = compileBriefPublishReady({
    opportunity_id: input.opportunity_id,
    consultant_id: input.consultant_id,
    consultant_delivery_email: input.consultant_delivery_email,
    consultant_first_name: input.consultant_first_name,
    company: input.company,
    prospect_name: input.prospect_name,
    prospect_role: input.prospect_role,
    meeting_time: input.meeting_time,
    ttl_days: input.ttl_days,
    prepare,
    discovery,
    consultant_sot: input.consultant_sot
  });

  const certification = {
    schema_version: 'CLARIS_PRECALL_CERTIFICATION_V1',
    premium_semantic_pass: premiumAudit.audit_status === 'PASS',
    discovery_semantic_pass: discoveryAudit.audit_status === 'PASS',
    premium_deterministic_pass: premiumValidation.ok === true,
    discovery_deterministic_pass: discoveryValidation.ok === true
  };

  return {
    ...compiled,
    body: {
      ...compiled.body,
      certification
    }
  };
}
