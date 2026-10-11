import { normalizeFinalArtifact } from './final-brief-renderer.mjs';

export function isExplicitSyntheticRehearsal(input) {
  const artifact = typeof input === 'string' ? JSON.parse(input) : input;
  const source = artifact?.claris_final_brief ?? artifact;
  const lineage = Array.isArray(source?.intelligence_lineage) ? source.intelligence_lineage : [];
  // Only trusted, explicitly labelled booking evidence can grant the rehearsal exemption.
  return lineage.some(item => {
    const authority = String(item?.authority ?? item?.source ?? '').toUpperCase();
    const statement = String(item?.statement ?? item?.usage ?? '').toLowerCase();
    return (authority === 'BOOKING_TEXT' || authority === 'BOOKING') &&
      (statement.includes('synthetic') || statement.includes('rehearsal')) &&
      statement.includes('do not contact');
  });
}

export function assessCommercialBrief(input, { synthetic = false } = {}) {
  const n = normalizeFinalArtifact(input);
  const checks = {
    narrative: Boolean(n.preliminary_brief_markdown),
    service: Boolean(n.primary_service_id),
    recommended_action: Boolean(n.recommended_action),
    rationale: Boolean(n.rationale),
    evidence_fit: Object.keys(n.match_classifications).length > 0,
    metrics: n.metrics.supported_match !== null && n.metrics.scorable_coverage !== null,
    discovery: n.discovery_questions.length >= 3,
    talking_points: n.talking_points.length >= 2,
    risk_or_unknown: n.risk_factors.length > 0 || n.remaining_unknowns.length > 0,
    evidence_lineage: n.intelligence_lineage.length > 0
  };
  const missing = Object.keys(checks).filter(key => !checks[key]);
  return { status: synthetic ? 'NOT_COMMERCIAL_BENCHMARK' : missing.length ? 'REVIEW_REQUIRED' : 'DEPTH_CANDIDATE', missing, checks };
}
