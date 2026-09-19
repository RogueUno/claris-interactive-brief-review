function objectValue(value, field) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) throw new Error(`${field}_REQUIRED`);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not-object');
    return parsed;
  } catch {
    throw new Error(`${field}_INVALID_JSON`);
  }
}

function text(value, max = 240) {
  const out = String(value || '').trim();
  return out ? out.slice(0, max) : null;
}

function bool(value, field) {
  if (value === true || value === false) return value;
  throw new Error(`${field}_BOOLEAN_REQUIRED`);
}

function stringArray(value, field, maxItems = 20) {
  if (!Array.isArray(value)) throw new Error(`${field}_ARRAY_REQUIRED`);
  return [...new Set(
    value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, maxItems)
  )];
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function services(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((service) => ({
    service_id: text(service?.service_id, 120),
    name: text(service?.name, 240)
  })).filter((service) => service.service_id && service.name);
}

export function normalizeClarificationConsultantPolicy(input) {
  const sot = objectValue(input, 'CONSULTANT_SOT');
  const qualification = sot.qualification_rules && typeof sot.qualification_rules === 'object'
    ? sot.qualification_rules
    : {};
  const commercial = sot.commercial_rules && typeof sot.commercial_rules === 'object'
    ? sot.commercial_rules
    : {};
  const icp = sot.ideal_client_profile && typeof sot.ideal_client_profile === 'object'
    ? sot.ideal_client_profile
    : {};

  const requiredForFirstCall = stringArray(
    qualification.required_for_first_call,
    'CONSULTANT_SOT_REQUIRED_FOR_FIRST_CALL'
  );
  if (!requiredForFirstCall.length) {
    throw new Error('CONSULTANT_SOT_FIRST_CALL_RULE_REQUIRED');
  }

  return {
    schema_version: 'claris_clarification_consultant_policy_v1',
    source_class: 'CONSULTANT_POLICY',
    sot_version: text(sot.sot_version, 120),
    services: services(sot.services),
    ideal_client_profile: {
      preferred_company_types: Array.isArray(icp.preferred_company_types)
        ? stringArray(icp.preferred_company_types, 'CONSULTANT_SOT_COMPANY_TYPES')
        : [],
      unknown_is_acceptable: bool(icp.unknown_is_acceptable, 'CONSULTANT_SOT_UNKNOWN_ACCEPTABLE')
    },
    commercial_rules: {
      minimum_viable_engagement_usd: finiteNumber(commercial.minimum_viable_engagement_usd),
      budget_required_before_first_call: bool(
        commercial.budget_required_before_first_call,
        'CONSULTANT_SOT_BUDGET_BEFORE_CALL'
      ),
      budget_rule: text(commercial.budget_rule, 500)
    },
    qualification_rules: {
      required_for_first_call: requiredForFirstCall,
      unknown_is_not_negative: bool(
        qualification.unknown_is_not_negative,
        'CONSULTANT_SOT_UNKNOWN_NOT_NEGATIVE'
      )
    }
  };
}

export function consultantPolicyAuditView(policy) {
  return {
    schema_version: policy.schema_version,
    source_class: policy.source_class,
    sot_version: policy.sot_version,
    commercial_rules: {
      minimum_viable_engagement_usd: policy.commercial_rules.minimum_viable_engagement_usd,
      budget_required_before_first_call: policy.commercial_rules.budget_required_before_first_call
    },
    qualification_rules: {
      required_for_first_call: [...policy.qualification_rules.required_for_first_call],
      unknown_is_not_negative: policy.qualification_rules.unknown_is_not_negative
    },
    ideal_client_profile: {
      unknown_is_acceptable: policy.ideal_client_profile.unknown_is_acceptable
    }
  };
}
