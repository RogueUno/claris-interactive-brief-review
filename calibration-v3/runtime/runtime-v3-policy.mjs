export const CURRENT_MAKE_SOT_VERSION = 'AGENTIC_TEST_1';

export const SUPPORTED_FIRST_CALL_RULES_V3 = Object.freeze([
  'documented service/problem alignment',
  'not affirmatively disqualified'
]);

export const PROFILE_ONLY_PATHS_V3 = Object.freeze([
  'practice.lead_service_id',
  'practice.paused_policies',
  'opportunity.buyer_roles',
  'opportunity.company_stage',
  'opportunity.geography_matters',
  'opportunity.geographies',
  'commercial.engagement_models',
  'commercial.hard_disqualifiers',
  'commercial.caution_signals',
  'judgment.positive_signals',
  'judgment.vanity_signals',
  'strategy.discovery_style',
  'strategy.brief_density',
  'strategy.preferred_next_move',
  'strategy.proof_points',
  'strategy.avoid_push',
  'exceptions'
]);

export const CLARIS_OWNED_RUNTIME_V3 = Object.freeze({
  ideal_client_profile: {
    unknown_is_acceptable: true
  },
  commercial_rules: {
    budget_rule: 'Direct evidence only; never infer budget.'
  },
  qualification_rules: {
    unknown_is_not_negative: true
  },
  evidence_policy: {
    score_eligible_authorities: [
      'VERIFIED_PUBLIC_FACT',
      'CORROBORATED_THIRD_PARTY',
      'PROSPECT_REPORTED',
      'BOOKING_TEXT',
      'CONSULTANT_SOT'
    ],
    never_score_from: ['INTERPRETATION', 'HYPOTHESIS', 'UNKNOWN', 'REJECTED'],
    non_observation_rule: 'UNKNOWN, never absence'
  },
  match_score: {
    weights: {
      service_need_alignment: 30,
      icp_company_fit: 20,
      business_trigger: 15,
      buyer_stakeholder_fit: 10,
      engagement_economics: 10,
      timing_urgency: 10,
      expansion_potential: 5
    }
  },
  evidence_completeness: {
    weights: {
      critical_question_coverage: 35,
      source_authority: 25,
      corroboration_depth: 15,
      freshness: 15,
      conflict_ambiguity_control: 10
    }
  }
});
