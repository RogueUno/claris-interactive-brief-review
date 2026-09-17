import { validateOperatingProfileV1 } from './operating-profile-v1.mjs';
import {
  CURRENT_MAKE_SOT_VERSION,
  SUPPORTED_FIRST_CALL_RULES_V3,
  PROFILE_ONLY_PATHS_V3,
  CLARIS_OWNED_RUNTIME_V3
} from './runtime-v3-policy.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueServices(services) {
  const seen = new Set();
  const output = [];
  for (const service of services) {
    if (seen.has(service.service_id)) continue;
    seen.add(service.service_id);
    output.push({ service_id: service.service_id, name: service.name });
  }
  return output;
}

export function compileConsultantRuntimeSotV3(profile) {
  const validation = validateOperatingProfileV1(profile);
  const errors = [...validation.errors];
  const warnings = [];

  if (!validation.ok) {
    return {
      ok: false,
      runtime_sot: null,
      report: {
        adapter_version: 'consultant_profile_to_runtime_v3@1',
        errors,
        warnings,
        mapped_paths: [],
        omitted_profile_only_paths: PROFILE_ONLY_PATHS_V3
      }
    };
  }

  const currency = profile.commercial.minimum_engagement.currency;
  if (currency !== 'USD') {
    errors.push(`UNSUPPORTED_RUNTIME_CURRENCY:${currency}`);
    errors.push('RUNTIME_V3_REQUIRES_EXPLICIT_USD_POLICY_OR_CERTIFIED_CONVERSION');
  }

  const supportedRules = profile.judgment.first_call_rules.filter((rule) => SUPPORTED_FIRST_CALL_RULES_V3.includes(rule));
  const unsupportedRules = profile.judgment.first_call_rules.filter((rule) => !SUPPORTED_FIRST_CALL_RULES_V3.includes(rule));
  if (unsupportedRules.length) warnings.push(`PROFILE_ONLY_FIRST_CALL_RULES:${unsupportedRules.join('|')}`);
  if (!supportedRules.length) errors.push('NO_RUNTIME_COMPATIBLE_QUALIFICATION_RULE');

  const currentServices = profile.practice.services.filter(
    (service) => service.selected && ['ACTIVE', 'SELECTIVE'].includes(service.state)
  );
  const omittedServices = profile.practice.services.filter(
    (service) => service.selected && ['PAUSED', 'NO_LONGER'].includes(service.state)
  );
  if (omittedServices.length) warnings.push(`NON_CURRENT_SERVICES_OMITTED:${omittedServices.map((service) => service.service_id).join('|')}`);

  if (errors.length) {
    return {
      ok: false,
      runtime_sot: null,
      report: {
        adapter_version: 'consultant_profile_to_runtime_v3@1',
        errors,
        warnings,
        mapped_paths: [],
        omitted_profile_only_paths: PROFILE_ONLY_PATHS_V3
      }
    };
  }

  const system = clone(CLARIS_OWNED_RUNTIME_V3);
  const runtimeSot = {
    sot_version: CURRENT_MAKE_SOT_VERSION,
    consultant: {
      consultant_name: profile.consultant.full_name,
      firm: profile.consultant.firm
    },
    services: uniqueServices(currentServices),
    ideal_client_profile: {
      preferred_company_types: [...profile.opportunity.company_types],
      unknown_is_acceptable: system.ideal_client_profile.unknown_is_acceptable
    },
    commercial_rules: {
      minimum_viable_engagement_usd: profile.commercial.minimum_engagement.amount,
      budget_required_before_first_call: profile.commercial.budget_required_before_first_call,
      budget_rule: system.commercial_rules.budget_rule
    },
    qualification_rules: {
      required_for_first_call: supportedRules,
      unknown_is_not_negative: system.qualification_rules.unknown_is_not_negative
    },
    evidence_policy: system.evidence_policy,
    match_score: system.match_score,
    evidence_completeness: system.evidence_completeness
  };

  return {
    ok: true,
    runtime_sot: runtimeSot,
    report: {
      adapter_version: 'consultant_profile_to_runtime_v3@1',
      errors: [],
      warnings,
      mapped_paths: [
        'consultant.full_name -> consultant.consultant_name',
        'consultant.firm -> consultant.firm',
        'practice.services[selected && ACTIVE|SELECTIVE] -> services',
        'opportunity.company_types -> ideal_client_profile.preferred_company_types',
        'commercial.minimum_engagement[USD] -> commercial_rules.minimum_viable_engagement_usd',
        'commercial.budget_required_before_first_call -> commercial_rules.budget_required_before_first_call',
        'judgment.first_call_rules[supported subset] -> qualification_rules.required_for_first_call'
      ],
      omitted_profile_only_paths: PROFILE_ONLY_PATHS_V3,
      claris_owned_runtime_paths: [
        'ideal_client_profile.unknown_is_acceptable',
        'commercial_rules.budget_rule',
        'qualification_rules.unknown_is_not_negative',
        'evidence_policy',
        'match_score',
        'evidence_completeness'
      ]
    }
  };
}
