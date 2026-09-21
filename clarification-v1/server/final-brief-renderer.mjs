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
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function parseArtifact(input) {
  if (typeof input === 'string') {
    const source = input.trim();
    if (!source) throw new Error('FINAL_ARTIFACT_REQUIRED');
    try {
      const parsed = JSON.parse(source);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('FINAL_ARTIFACT_INVALID');
      }
      return parsed;
    } catch (error) {
      if (error?.message === 'FINAL_ARTIFACT_INVALID') throw error;
      throw new Error('FINAL_ARTIFACT_INVALID_JSON');
    }
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('FINAL_ARTIFACT_REQUIRED');
  }
  return input;
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
      reason: firstText(item?.reason)
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

  return {
    boundary_caveat: firstText(context.boundary_caveat),
    background_cyber_signals: firstText(context.background_cyber_signals),
    sensitive_items: sensitive.length ? sensitive : historical
  };
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
    const reason = firstText(item?.reason);
    return `- **${humanize(key)}:** ${status}${reason ? ` — ${reason}` : ''}`;
  });
}

export function normalizeFinalArtifact(input) {
  const artifact = parseArtifact(input);
  const clarisMetadata = object(artifact.claris_brief_metadata);
  const briefMetadata = object(artifact.brief_metadata);
  const targetFirm = object(briefMetadata.target_firm);
  const consultant = object(briefMetadata.consultant);
  const clientProfile = object(artifact.client_profile);
  const strategicGuidance = object(artifact.strategic_guidance);
  const strategicRecommendations = object(artifact.strategic_recommendations);
  const scopeAnalysis = object(artifact.scope_analysis);
  const deterministicMetrics = Object.keys(object(artifact.deterministic_metrics)).length
    ? object(artifact.deterministic_metrics)
    : object(artifact.metrics);
  const matchClassifications = Object.keys(object(artifact.match_classifications)).length
    ? object(artifact.match_classifications)
    : object(artifact.canonical_match_classifications);
  const completenessClassifications = Object.keys(object(artifact.completeness_classifications)).length
    ? object(artifact.completeness_classifications)
    : object(artifact.canonical_completeness_classifications);

  const talkingPoints = array(
    strategicGuidance.key_talking_points ??
    strategicRecommendations.key_talking_points ??
    artifact.talking_points
  ).map(text).filter(Boolean);

  const riskFactors = array(
    strategicGuidance.risk_factors ??
    strategicRecommendations.risk_factors
  ).map(text).filter(Boolean);

  return {
    schema_version: 'claris_final_brief_render_v1',
    company: firstText(
      clarisMetadata.target_company,
      targetFirm.company_name,
      clientProfile.company_name
    ),
    domain: firstText(
      clarisMetadata.target_domain,
      targetFirm.domain,
      clientProfile.domain
    ),
    consultant_name: firstText(
      clarisMetadata.consultant_name,
      consultant.consultant_name
    ),
    firm: firstText(
      clarisMetadata.firm,
      consultant.firm
    ),
    qualification_status: firstText(
      strategicGuidance.qualification_status,
      artifact.qualification_status
    ),
    primary_service_id: firstText(
      strategicGuidance.primary_service_id,
      scopeAnalysis.primary_service_id,
      serviceFromRelevance(artifact)
    ),
    recommended_action: firstText(
      strategicGuidance.recommended_action,
      strategicRecommendations.recommended_action
    ),
    rationale: firstText(strategicGuidance.rationale),
    metrics: {
      supported_match: numeric(
        deterministicMetrics.supported_match_score ??
        deterministicMetrics.supported_match
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
    consultant_only_context: normalizeConsultantContext(artifact)
  };
}

export function renderFinalBrief(input) {
  const normalized = normalizeFinalArtifact(input);
  const lines = ['# CLARIS Opportunity Brief', ''];

  if (normalized.company || normalized.domain) {
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
  lines.push(`- Supported Match: ${formatMetric(normalized.metrics.supported_match, '/100')}`);
  lines.push(`- Scorable Coverage: ${formatMetric(normalized.metrics.scorable_coverage, '/100')}`);
  lines.push(`- Evaluated Fit Rate: ${formatMetric(normalized.metrics.evaluated_fit_rate, '%')}`);
  lines.push(`- Evidence Completeness: ${formatMetric(normalized.metrics.evidence_completeness, '/100')}`);
  lines.push('');

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
    consultantContext.sensitive_items.length
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
    if (consultantContext.boundary_caveat) {
      lines.push(`- Boundary: ${consultantContext.boundary_caveat}`);
    }
    lines.push('');
  }

  return {
    ok: true,
    normalized,
    brief_markdown: lines.join('\n').trim()
  };
}
