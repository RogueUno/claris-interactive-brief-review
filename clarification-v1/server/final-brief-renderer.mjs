function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return null;
}

function numeric(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;

  const source = value.trim();
  const match = source.match(/^(-?\d+(?:\.\d+)?)(?:\s*(?:\/\s*100|%))?$/);
  if (!match) return null;

  const candidate = Number(match[1]);
  return Number.isFinite(candidate) ? candidate : null;
}

function parseArtifact(input) {
  if (
    typeof input !== 'string' &&
    (!input || typeof input !== 'object' || Array.isArray(input))
  ) {
    throw new Error('FINAL_ARTIFACT_REQUIRED');
  }

  let current = input;
  for (let depth = 0; depth < 2 && typeof current === 'string'; depth += 1) {
    const source = current.trim();
    if (!source) {
      throw new Error(depth === 0 ? 'FINAL_ARTIFACT_REQUIRED' : 'FINAL_ARTIFACT_INVALID');
    }
    try {
      current = JSON.parse(source);
    } catch {
      throw new Error('FINAL_ARTIFACT_INVALID_JSON');
    }
  }

  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error('FINAL_ARTIFACT_INVALID');
  }
  return current;
}

function unwrapArtifact(parsed) {
  const nested = object(parsed.claris_final_brief);
  return Object.keys(nested).length
    ? { artifact: nested, source_schema: 'claris_final_brief' }
    : { artifact: parsed, source_schema: 'legacy_or_flat' };
}

function serviceFromRelevance(artifact) {
  const entries = array(artifact.potential_service_relevance);
  const preferred = entries.find((entry) =>
    ['HIGH', 'DIRECT_MATCH', 'CONFIRMED_NEED'].includes(
      String(entry?.relevance || entry?.status || '').toUpperCase()
    )
  );
  return firstText(preferred?.service_id);
}

function serviceFromMatchBreakdown(matchClassifications) {
  const serviceNeed = object(matchClassifications.service_need_alignment);
  return array(serviceNeed.basis_ids)
    .map((value) => firstText(value))
    .find((value) => value?.startsWith('SVC_')) || null;
}

function normalizeUnknowns(artifact, matchClassifications) {
  const explicit = array(artifact?.unknowns_tracker?.remaining_unknowns)
    .map((item) => ({
      id: firstText(item?.unknown_id),
      description: firstText(item?.description),
      reason: null
    }))
    .filter((item) => item.id || item.description);

  if (explicit.length) return explicit;

  return Object.entries(matchClassifications)
    .filter(([, item]) => String(item?.status || '').toUpperCase() === 'UNKNOWN')
    .map(([id, item]) => ({
      id,
      description: null,
      reason: firstText(item?.reason, item?.rationale, item?.reasoning)
    }));
}

function normalizeConsultantContext(artifact) {
  const context = object(artifact.consultant_only_context);
  const sensitive = array(context.sensitive_public_context)
    .map((item) => ({
      evidence_id: firstText(item?.evidence_id),
      title: firstText(item?.title),
      summary: firstText(item?.summary),
      boundary_warning: firstText(item?.boundary_warning)
    }))
    .filter((item) => item.evidence_id || item.title || item.summary);

  const historical = array(context.historical_breach_intelligence)
    .map((item) => ({
      evidence_id: firstText(item?.evidence_id),
      title: firstText(item?.source_title),
      summary: firstText(item?.summary),
      boundary_warning: firstText(item?.usage_boundary)
    }))
    .filter((item) => item.evidence_id || item.title || item.summary);

  const historicalSignals = array(context.historical_signals)
    .map((item) => ({
      evidence_id: firstText(item?.evidence_id),
      title: firstText(item?.event, item?.title),
      summary: firstText(item?.details, item?.description, item?.summary),
      boundary_warning: firstText(item?.relevance, item?.relevance_limitations, item?.boundary_warning)
    }))
    .filter((item) => item.evidence_id || item.title || item.summary);

  const hypothesisSource = array(context.internal_hypotheses).length
    ? array(context.internal_hypotheses)
    : array(context.hypotheses);
  const hypotheses = hypothesisSource
    .map((item) => ({
      hypothesis_id: firstText(item?.hypothesis_id, item?.label),
      description: firstText(item?.description),
      status: firstText(item?.status, item?.risk_of_inference)
    }))
    .filter((item) => item.hypothesis_id || item.description);

  return {
    boundary_caveat: firstText(context.boundary_caveat),
    background_cyber_signals: firstText(
      context.background_cyber_signals,
      context.historical_context,
      context.non_admitted_context,
      context.internal_strategy_notes
    ),
    sensitive_items: sensitive.length ? sensitive : historical.length ? historical : historicalSignals,
    hypotheses
  };
}

function normalizeDiscoveryQuestions(artifact) {
  const discoveryPlan = object(artifact.discovery_plan);
  const source = array(artifact.discovery_question_plan).length
    ? array(artifact.discovery_question_plan)
    : array(artifact.discovery_questions).length
      ? array(artifact.discovery_questions)
      : array(discoveryPlan.priority_questions).length
        ? array(discoveryPlan.priority_questions)
        : array(discoveryPlan.high_priority_questions);

  return source
    .map((item) => typeof item === 'string'
      ? { question: firstText(item), intent: null, alignment_id: null }
      : {
          question: firstText(item?.question),
          intent: firstText(item?.intent, item?.objective, item?.target_dimension),
          alignment_id: firstText(item?.alignment_id)
        })
    .filter((item) => item.question);
}

function normalizeLineage(artifact) {
  const evidenceLog = object(artifact.evidence_log);
  const nestedLineage = object(artifact.intelligence_lineage);
  const consultantContext = object(artifact.consultant_only_context);
  const source = array(artifact.intelligence_lineage).length
    ? array(artifact.intelligence_lineage)
    : array(evidenceLog.intelligence_lineage).length
      ? array(evidenceLog.intelligence_lineage)
      : array(artifact.evidence_registry).length
        ? array(artifact.evidence_registry)
        : array(artifact.canonical_evidence_ledger).length
          ? array(artifact.canonical_evidence_ledger)
          : array(nestedLineage.admissible_evidence).length
            ? array(nestedLineage.admissible_evidence)
            : array(consultantContext.intelligence_lineage);

  return source
    .map((item) => typeof item === 'string'
      ? { source_id: firstText(item), authority: null, usage: null }
      : {
          source_id: firstText(item?.source_id, item?.evidence_id),
          authority: firstText(item?.authority, item?.source),
          usage: firstText(item?.usage, item?.description, item?.statement)
        })
    .filter((item) => item.source_id || item.usage);
}

function formatMetric(value, suffix = '') {
  return value === null ? 'n/a' : `${value}${suffix}`;
}

function humanize(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classificationLines(classifications) {
  return Object.entries(classifications).map(([key, item]) => {
    const status = firstText(item?.status) || 'UNKNOWN';
    const reason = firstText(item?.reason, item?.rationale, item?.reasoning);
    return `- **${humanize(key)}:** ${status}${reason ? ` — ${reason}` : ''}`;
  });
}

function assertRenderable(normalized) {
  const metricValues = Object.values(normalized.metrics);
  const hasAnyMetric = metricValues.some((value) => value !== null);
  const hasSubstantiveContent = Boolean(
    normalized.company ||
    normalized.domain ||
    normalized.consultant_name ||
    normalized.firm ||
    normalized.qualification_status ||
    normalized.primary_service_id ||
    normalized.recommended_action ||
    normalized.rationale ||
    normalized.preliminary_brief_markdown ||
    Object.keys(normalized.match_classifications).length ||
    Object.keys(normalized.completeness_classifications).length ||
    normalized.talking_points.length ||
    normalized.risk_factors.length ||
    normalized.remaining_unknowns.length ||
    normalized.discovery_questions.length ||
    normalized.intelligence_lineage.length ||
    normalized.consultant_only_context.sensitive_items.length ||
    normalized.consultant_only_context.hypotheses.length
  );

  if (!hasAnyMetric && !hasSubstantiveContent) {
    throw new Error('FINAL_ARTIFACT_UNRECOGNIZED');
  }

  if (normalized.source_schema === 'claris_final_brief') {
    const allMetricsPresent = metricValues.every((value) => value !== null);
    const hasCurrentContractContent = Boolean(
      normalized.qualification_status &&
      (
        normalized.preliminary_brief_markdown ||
        Object.keys(normalized.match_classifications).length ||
        normalized.rationale ||
        normalized.discovery_questions.length
      )
    );

    if (!allMetricsPresent || !hasCurrentContractContent) {
      throw new Error('FINAL_ARTIFACT_CONTRACT_MISMATCH');
    }
  }
}

export function normalizeFinalArtifact(input) {
  const parsed = parseArtifact(input);
  const { artifact, source_schema: sourceSchema } = unwrapArtifact(parsed);
  const clarisMetadata = object(artifact.claris_brief_metadata);
  const briefMetadata = object(artifact.brief_metadata);
  const targetFirm = object(briefMetadata.target_firm);
  const consultant = object(briefMetadata.consultant);
  const clientProfile = object(artifact.client_profile);
  const metadata = object(artifact.metadata);
  const clientIntel = object(artifact.client_intel);
  const companyProfile = object(clientIntel.company_profile);
  const strategicIntelligence = object(artifact.strategic_intelligence);
  const statedNeed = object(strategicIntelligence.stated_need);
  const strategicService = array(strategicIntelligence.potential_service_relevance)[0] || {};
  const matchScoreSummary = object(artifact.match_score_summary);
  const consultantInfo = object(artifact.consultant_info);
  const prospectInfo = object(artifact.prospect_info);
  const prospectOverview = object(artifact.prospect_overview);
  const canonicalTruthSummary = object(artifact.canonical_truth_summary);
  const companyIdentifiers = object(canonicalTruthSummary.company_identifiers);
  const engagementSummary = object(artifact.engagement_summary);
  const matchSummary = object(artifact.match_summary);
  const matchDiagnostics = object(artifact.match_diagnostics);
  const strategicAssessment = object(artifact.strategic_assessment);
  const strategySummary = object(strategicAssessment.strategy_summary);
  const strategicBrief = object(artifact.strategic_brief);
  const discoveryPlan = object(artifact.discovery_plan);
  const discoveryGuidance = Object.keys(object(artifact.discovery_guidance)).length
    ? object(artifact.discovery_guidance)
    : object(strategicAssessment.discovery_guidance);
  const strategicGuidance = object(artifact.strategic_guidance);
  const strategicRecommendations = object(artifact.strategic_recommendations);
  const scopeAnalysis = object(artifact.scope_analysis);
  const matchScoreExplanation = object(artifact.match_score_explanation);
  const matchBreakdown = object(matchScoreExplanation.match_breakdown);
  const deterministicMetrics = Object.keys(object(artifact.deterministic_metrics)).length
    ? object(artifact.deterministic_metrics)
    : Object.keys(object(matchSummary.deterministic_metrics)).length
      ? object(matchSummary.deterministic_metrics)
      : Object.keys(object(strategicAssessment.deterministic_metrics)).length
        ? object(strategicAssessment.deterministic_metrics)
        : Object.keys(object(matchDiagnostics.deterministic_metrics)).length
          ? object(matchDiagnostics.deterministic_metrics)
          : Object.keys(object(artifact.match_score_metrics)).length
            ? object(artifact.match_score_metrics)
            : Object.keys(matchScoreSummary).length
              ? matchScoreSummary
              : object(artifact.metrics);
  const matchClassifications = Object.keys(object(artifact.match_classifications)).length
    ? object(artifact.match_classifications)
    : Object.keys(object(artifact.canonical_match_classifications)).length
      ? object(artifact.canonical_match_classifications)
      : Object.keys(object(strategicAssessment.match_classifications)).length
        ? object(strategicAssessment.match_classifications)
        : Object.keys(object(matchDiagnostics.match_classifications)).length
          ? object(matchDiagnostics.match_classifications)
          : Object.keys(object(artifact.match_dimension_analysis)).length
            ? object(artifact.match_dimension_analysis)
            : Object.keys(object(artifact.canonical_alignment)).length
              ? object(artifact.canonical_alignment)
              : matchBreakdown;
  const completenessClassifications = Object.keys(object(artifact.completeness_classifications)).length
    ? object(artifact.completeness_classifications)
    : Object.keys(object(artifact.canonical_completeness_classifications)).length
      ? object(artifact.canonical_completeness_classifications)
      : object(artifact.evidence_completeness_analysis);

  const talkingPoints = array(
    strategicGuidance.key_talking_points ??
    strategicRecommendations.key_talking_points ??
    discoveryGuidance.key_talking_points ??
    strategicBrief.key_talking_points ??
    strategySummary.key_talking_points ??
    discoveryPlan.key_talking_points ??
    strategicIntelligence.strategic_recommendations ??
    artifact.talking_points
  ).map(text).filter(Boolean);

  const riskFactors = array(
    strategicGuidance.risk_factors ??
    strategicRecommendations.risk_factors ??
    discoveryGuidance.risk_factors ??
    strategicBrief.risk_factors ??
    strategySummary.risk_factors ??
    discoveryPlan.risk_factors ??
    strategicIntelligence.risk_factors
  ).map(text).filter(Boolean);

  return {
    schema_version: 'claris_final_brief_render_v1',
    source_schema: sourceSchema,
    company: firstText(
      prospectOverview.company_name,
      prospectInfo.company_name,
      engagementSummary.prospect_name,
      briefMetadata.prospect_company,
      companyProfile.name,
      companyIdentifiers.legal_name,
      clarisMetadata.target_company,
      targetFirm.company_name,
      clientProfile.company_name,
      metadata.target_company,
      briefMetadata.target_company
    ),
    domain: firstText(
      prospectOverview.domain,
      prospectInfo.domain,
      engagementSummary.website,
      companyProfile.domain,
      companyIdentifiers.domain,
      clarisMetadata.target_domain,
      targetFirm.domain,
      clientProfile.domain,
      metadata.target_domain,
      briefMetadata.target_domain
    ),
    consultant_name: firstText(
      clarisMetadata.consultant_name,
      consultantInfo.name,
      consultant.consultant_name,
      metadata.consultant_name,
      briefMetadata.consultant_name,
      briefMetadata.lead_consultant
    ),
    firm: firstText(
      clarisMetadata.firm,
      consultantInfo.firm,
      consultant.firm,
      metadata.firm_name,
      briefMetadata.firm_name,
      briefMetadata.firm
    ),
    qualification_status: firstText(
      strategicGuidance.qualification_status,
      matchSummary.qualification_status,
      strategicBrief.qualification_status,
      engagementSummary.qualification_status,
      strategySummary.qualification_status,
      artifact.qualification_status,
      briefMetadata.report_status
    ),
    primary_service_id: firstText(
      strategicGuidance.primary_service_id,
      strategicBrief.primary_service_id,
      strategySummary.primary_service_id,
      scopeAnalysis.primary_service_id,
      serviceFromRelevance(strategicAssessment),
      serviceFromRelevance(artifact),
      serviceFromMatchBreakdown(matchClassifications),
      array(canonicalTruthSummary.potential_service_relevance)[0],
      strategicService.service_id,
      statedNeed.primary_requirement,
      engagementSummary.primary_service_intent,
      prospectOverview.primary_interest
    ),
    recommended_action: firstText(
      strategicGuidance.recommended_action,
      strategicRecommendations.recommended_action,
      discoveryGuidance.recommended_action,
      array(strategicIntelligence.strategic_recommendations)[0],
      strategicBrief.recommended_action,
      strategySummary.recommended_action
    ),
    rationale: firstText(
      strategicGuidance.rationale,
      matchSummary.fit_rationale,
      strategicBrief.rationale,
      engagementSummary.narrative,
      matchScoreExplanation.overall_assessment
    ),
    metrics: {
      supported_match: numeric(
        deterministicMetrics.supported_match_score ??
        deterministicMetrics.supported_match
      ),
      overall_match: numeric(
        deterministicMetrics.overall_match_score ??
        deterministicMetrics.overall_match
      ),
      scorable_coverage: numeric(
        deterministicMetrics.scorable_coverage_score ??
        deterministicMetrics.scorable_coverage
      ),
      evaluated_fit_rate: numeric(deterministicMetrics.evaluated_fit_rate),
      evidence_completeness: numeric(
        deterministicMetrics.evidence_completeness_score ??
        deterministicMetrics.evidence_completeness
      )
    },
    match_classifications: matchClassifications,
    completeness_classifications: completenessClassifications,
    talking_points: talkingPoints,
    risk_factors: riskFactors,
    remaining_unknowns: normalizeUnknowns(artifact, matchClassifications),
    preliminary_brief_markdown: firstText(artifact.preliminary_brief_markdown),
    discovery_questions: normalizeDiscoveryQuestions(artifact),
    intelligence_lineage: normalizeLineage(artifact),
    consultant_only_context: normalizeConsultantContext(artifact)
  };
}

export function renderFinalBrief(input) {
  const normalized = normalizeFinalArtifact(input);
  assertRenderable(normalized);
  const lines = ['# CLARIS Opportunity Brief', ''];

  if (normalized.company || normalized.domain || normalized.consultant_name || normalized.firm) {
    lines.push('## Opportunity');
    if (normalized.company) lines.push(`- Company: ${normalized.company}`);
    if (normalized.domain) lines.push(`- Domain: ${normalized.domain}`);
    if (normalized.consultant_name) lines.push(`- Consultant: ${normalized.consultant_name}`);
    if (normalized.firm) lines.push(`- Firm: ${normalized.firm}`);
    lines.push('');
  }

  lines.push('## Qualification');
  lines.push(`- Status: ${normalized.qualification_status || 'Not explicitly classified'}`);
  lines.push(`- Primary service: ${normalized.primary_service_id || 'Not explicitly classified'}`);
  if (normalized.recommended_action) lines.push(`- Recommended action: ${normalized.recommended_action}`);
  if (normalized.rationale) lines.push(`- Rationale: ${normalized.rationale}`);
  lines.push('');

  lines.push('## Deterministic Metrics');
  if (normalized.metrics.supported_match !== null) {
    lines.push(`- Supported Match: ${formatMetric(normalized.metrics.supported_match, '/100')}`);
  }
  if (normalized.metrics.overall_match !== null) {
    lines.push(`- Overall Match: ${formatMetric(normalized.metrics.overall_match, '/100')}`);
  }
  if (normalized.metrics.scorable_coverage !== null) {
    lines.push(`- Scorable Coverage: ${formatMetric(normalized.metrics.scorable_coverage, '/100')}`);
  }
  if (normalized.metrics.evaluated_fit_rate !== null) {
    lines.push(`- Evaluated Fit Rate: ${formatMetric(normalized.metrics.evaluated_fit_rate, '%')}`);
  }
  if (normalized.metrics.evidence_completeness !== null) {
    lines.push(`- Evidence Completeness: ${formatMetric(normalized.metrics.evidence_completeness, '/100')}`);
  }
  lines.push('');

  if (normalized.preliminary_brief_markdown) {
    lines.push('## Engagement Intelligence');
    lines.push(normalized.preliminary_brief_markdown);
    lines.push('');
  }

  if (Object.keys(normalized.match_classifications).length) {
    lines.push('## Evidence-Based Fit');
    lines.push(...classificationLines(normalized.match_classifications));
    lines.push('');
  }

  if (normalized.talking_points.length) {
    lines.push('## Key Talking Points');
    lines.push(...normalized.talking_points.map((item) => `- ${item}`));
    lines.push('');
  }

  if (normalized.risk_factors.length) {
    lines.push('## Risk Factors');
    lines.push(...normalized.risk_factors.map((item) => `- ${item}`));
    lines.push('');
  }

  if (normalized.discovery_questions.length) {
    lines.push('## Discovery Questions');
    lines.push(...normalized.discovery_questions.map((item) => {
      const intent = item.intent ? ` — ${item.intent}` : '';
      return `- ${item.question}${intent}`;
    }));
    lines.push('');
  }

  if (normalized.remaining_unknowns.length) {
    lines.push('## Remaining Unknowns');
    lines.push(...normalized.remaining_unknowns.map((item) => {
      const label = item.description || humanize(item.id);
      return `- ${label}${item.reason ? ` — ${item.reason}` : ''}`;
    }));
    lines.push('');
  }

  const consultantContext = normalized.consultant_only_context;
  if (
    consultantContext.boundary_caveat ||
    consultantContext.background_cyber_signals ||
    consultantContext.sensitive_items.length ||
    consultantContext.hypotheses.length
  ) {
    lines.push('## Consultant-Only Context');
    if (consultantContext.background_cyber_signals) {
      lines.push(consultantContext.background_cyber_signals);
    }
    for (const item of consultantContext.sensitive_items) {
      const label = item.title || item.evidence_id || 'Sensitive context';
      const detail = item.summary ? ` — ${item.summary}` : '';
      lines.push(`- **${label}:**${detail}`);
      if (item.boundary_warning) lines.push(`  - Boundary: ${item.boundary_warning}`);
    }
    if (consultantContext.hypotheses.length) {
      lines.push('- **Internal hypotheses:**');
      for (const item of consultantContext.hypotheses) {
        const status = item.status ? ` (${item.status})` : '';
        lines.push(`  - ${item.description || item.hypothesis_id}${status}`);
      }
    }
    if (consultantContext.boundary_caveat) {
      lines.push(`- Boundary: ${consultantContext.boundary_caveat}`);
    }
    lines.push('');
  }

  if (normalized.intelligence_lineage.length) {
    lines.push('## Evidence Lineage');
    lines.push(...normalized.intelligence_lineage.map((item) => {
      const authority = item.authority ? ` (${item.authority})` : '';
      const usage = item.usage ? ` — ${item.usage}` : '';
      return `- ${item.source_id || 'Source'}${authority}${usage}`;
    }));
    lines.push('');
  }

  return {
    ok: true,
    normalized,
    brief_markdown: lines.join('\n').trim()
  };
}
