export const OPERATING_PROFILE_SCHEMA_VERSION = 'consultant_operating_profile_v1';

const uniq = (values = []) => [...new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean))];
const text = (value) => String(value ?? '').trim();

export function buildOperatingProfileV1(snapshot) {
  const source = snapshot || {};
  const consultant = source.consultant || {};
  const practice = source.practice || {};
  const opportunity = source.opportunity || {};
  const commercial = source.commercial || {};
  const judgment = source.judgment || {};
  const strategy = source.strategy || {};

  return {
    profile_schema_version: OPERATING_PROFILE_SCHEMA_VERSION,
    consultant: {
      consultant_id: text(consultant.consultantId ?? consultant.consultant_id),
      first_name: text(consultant.firstName ?? consultant.first_name),
      full_name: text(consultant.fullName ?? consultant.full_name),
      firm: text(consultant.firm)
    },
    practice: {
      services: (Array.isArray(practice.services) ? practice.services : []).map((service) => ({
        service_id: text(service.service_id),
        name: text(service.name),
        selected: Boolean(service.selected),
        state: text(service.state),
        preference: text(service.preference || 'CORE')
      })),
      lead_service_id: practice.leadServiceId ?? practice.lead_service_id ?? null,
      paused_policies: { ...(practice.pausedPolicies || practice.paused_policies || {}) }
    },
    opportunity: {
      company_types: uniq(opportunity.companyTypes ?? opportunity.company_types),
      buyer_roles: uniq(opportunity.buyerRoles ?? opportunity.buyer_roles),
      company_stage: text(opportunity.companyStage ?? opportunity.company_stage),
      geography_matters: Boolean(opportunity.geographyMatters ?? opportunity.geography_matters),
      geographies: uniq(opportunity.geographies)
    },
    commercial: {
      minimum_engagement: {
        amount: Number(commercial.minimumEngagement ?? commercial.minimum_engagement?.amount ?? 0),
        currency: text(commercial.currency ?? commercial.minimum_engagement?.currency).toUpperCase()
      },
      engagement_models: uniq(commercial.engagementModels ?? commercial.engagement_models),
      budget_required_before_first_call: Boolean(commercial.budgetRequired ?? commercial.budget_required_before_first_call),
      hard_disqualifiers: uniq(commercial.hardDisqualifiers ?? commercial.hard_disqualifiers),
      hard_disqualifiers_confirmed: Boolean(commercial.hardDisqualifiersConfirmed ?? commercial.hard_disqualifiers_confirmed),
      caution_signals: uniq(commercial.cautionSignals ?? commercial.caution_signals)
    },
    judgment: {
      first_call_rules: uniq(judgment.firstCallRules ?? judgment.first_call_rules),
      positive_signals: uniq(judgment.positiveSignals ?? judgment.positive_signals),
      vanity_signals: uniq(judgment.vanitySignals ?? judgment.vanity_signals)
    },
    strategy: {
      discovery_style: text(strategy.discoveryStyle ?? strategy.discovery_style),
      brief_density: text(strategy.briefDensity ?? strategy.brief_density),
      preferred_next_move: text(strategy.preferredNextMove ?? strategy.preferred_next_move),
      proof_points: uniq(strategy.proofPoints ?? strategy.proof_points),
      avoid_push: uniq(strategy.avoidPush ?? strategy.avoid_push)
    },
    exceptions: uniq(source.exceptions),
    locked_at: source.lockedAt ?? source.locked_at ?? null
  };
}

const ALLOWED = {
  '$': ['profile_schema_version', 'consultant', 'practice', 'opportunity', 'commercial', 'judgment', 'strategy', 'exceptions', 'locked_at'],
  '$.consultant': ['consultant_id', 'first_name', 'full_name', 'firm'],
  '$.practice': ['services', 'lead_service_id', 'paused_policies'],
  '$.practice.services[]': ['service_id', 'name', 'selected', 'state', 'preference'],
  '$.opportunity': ['company_types', 'buyer_roles', 'company_stage', 'geography_matters', 'geographies'],
  '$.commercial': ['minimum_engagement', 'engagement_models', 'budget_required_before_first_call', 'hard_disqualifiers', 'hard_disqualifiers_confirmed', 'caution_signals'],
  '$.commercial.minimum_engagement': ['amount', 'currency'],
  '$.judgment': ['first_call_rules', 'positive_signals', 'vanity_signals'],
  '$.strategy': ['discovery_style', 'brief_density', 'preferred_next_move', 'proof_points', 'avoid_push']
};

function unexpectedKeys(value, allowed, path, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`UNEXPECTED_FIELD:${path}.${key}`);
  }
}

function requireText(value, path, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`REQUIRED_TEXT:${path}`);
}

function requireStringArray(value, path, errors, { min = 0 } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`REQUIRED_ARRAY:${path}`);
    return;
  }
  if (value.length < min) errors.push(`MIN_ITEMS:${path}:${min}`);
  if (value.some((item) => typeof item !== 'string' || !item.trim())) errors.push(`INVALID_ARRAY_ITEM:${path}`);
}

export function validateOperatingProfileV1(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return { ok: false, errors: ['PROFILE_NOT_OBJECT'] };

  unexpectedKeys(profile, ALLOWED['$'], '$', errors);
  unexpectedKeys(profile.consultant, ALLOWED['$.consultant'], '$.consultant', errors);
  unexpectedKeys(profile.practice, ALLOWED['$.practice'], '$.practice', errors);
  unexpectedKeys(profile.opportunity, ALLOWED['$.opportunity'], '$.opportunity', errors);
  unexpectedKeys(profile.commercial, ALLOWED['$.commercial'], '$.commercial', errors);
  unexpectedKeys(profile.commercial?.minimum_engagement, ALLOWED['$.commercial.minimum_engagement'], '$.commercial.minimum_engagement', errors);
  unexpectedKeys(profile.judgment, ALLOWED['$.judgment'], '$.judgment', errors);
  unexpectedKeys(profile.strategy, ALLOWED['$.strategy'], '$.strategy', errors);

  if (profile.profile_schema_version !== OPERATING_PROFILE_SCHEMA_VERSION) errors.push('INVALID_PROFILE_SCHEMA_VERSION');
  requireText(profile.consultant?.consultant_id, '$.consultant.consultant_id', errors);
  requireText(profile.consultant?.first_name, '$.consultant.first_name', errors);
  requireText(profile.consultant?.full_name, '$.consultant.full_name', errors);
  requireText(profile.consultant?.firm, '$.consultant.firm', errors);

  if (!Array.isArray(profile.practice?.services) || !profile.practice.services.length) {
    errors.push('MIN_ITEMS:$.practice.services:1');
  } else {
    for (const service of profile.practice.services) {
      unexpectedKeys(service, ALLOWED['$.practice.services[]'], '$.practice.services[]', errors);
      requireText(service.service_id, '$.practice.services[].service_id', errors);
      requireText(service.name, '$.practice.services[].name', errors);
      if (typeof service.selected !== 'boolean') errors.push('REQUIRED_BOOLEAN:$.practice.services[].selected');
      if (!['ACTIVE', 'SELECTIVE', 'PAUSED', 'NO_LONGER'].includes(service.state)) errors.push('INVALID_SERVICE_STATE');
      requireText(service.preference, '$.practice.services[].preference', errors);
    }
  }

  const currentServices = (profile.practice?.services || []).filter((service) => service.selected && ['ACTIVE', 'SELECTIVE'].includes(service.state));
  if (!currentServices.length) errors.push('NO_CURRENT_RUNTIME_SERVICE');

  requireStringArray(profile.opportunity?.company_types, '$.opportunity.company_types', errors, { min: 1 });
  requireStringArray(profile.opportunity?.buyer_roles, '$.opportunity.buyer_roles', errors);
  requireStringArray(profile.opportunity?.geographies, '$.opportunity.geographies', errors);
  if (typeof profile.opportunity?.geography_matters !== 'boolean') errors.push('REQUIRED_BOOLEAN:$.opportunity.geography_matters');
  if (profile.opportunity?.geography_matters && !profile.opportunity.geographies.length) errors.push('GEOGRAPHY_REQUIRED_WHEN_MATERIAL');

  const amount = profile.commercial?.minimum_engagement?.amount;
  const currency = profile.commercial?.minimum_engagement?.currency;
  if (!Number.isFinite(amount) || amount <= 0) errors.push('INVALID_MINIMUM_ENGAGEMENT');
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) errors.push('INVALID_CURRENCY');
  if (typeof profile.commercial?.budget_required_before_first_call !== 'boolean') errors.push('REQUIRED_BOOLEAN:$.commercial.budget_required_before_first_call');
  if (profile.commercial?.hard_disqualifiers_confirmed !== true) errors.push('HARD_DISQUALIFIERS_NOT_CONFIRMED');
  requireStringArray(profile.commercial?.engagement_models, '$.commercial.engagement_models', errors);
  requireStringArray(profile.commercial?.hard_disqualifiers, '$.commercial.hard_disqualifiers', errors);
  requireStringArray(profile.commercial?.caution_signals, '$.commercial.caution_signals', errors);

  requireStringArray(profile.judgment?.first_call_rules, '$.judgment.first_call_rules', errors, { min: 1 });
  requireStringArray(profile.judgment?.positive_signals, '$.judgment.positive_signals', errors);
  requireStringArray(profile.judgment?.vanity_signals, '$.judgment.vanity_signals', errors);

  requireStringArray(profile.strategy?.proof_points, '$.strategy.proof_points', errors);
  requireStringArray(profile.strategy?.avoid_push, '$.strategy.avoid_push', errors);
  if (!Array.isArray(profile.exceptions)) errors.push('REQUIRED_ARRAY:$.exceptions');

  return { ok: errors.length === 0, errors };
}
