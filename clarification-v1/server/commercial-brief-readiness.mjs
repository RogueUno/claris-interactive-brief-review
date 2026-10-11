import { normalizeFinalArtifact } from './final-brief-renderer.mjs';
import { assessDiscoveryCoverage } from './discovery-coverage.mjs';

export function isExplicitSyntheticRehearsal(_artifact, { trustedBookingText = '' } = {}) {
  // Never infer consent/contact restrictions from AI-generated lineage.
  const booking = String(trustedBookingText || '').toLowerCase();
  return (booking.includes('synthetic') || booking.includes('rehearsal')) &&
    booking.includes('do not contact the prospect');
}

export function assessCommercialBrief(input, { synthetic = false } = {}) {
  const n = normalizeFinalArtifact(input);
  const discovery_strategy = assessDiscoveryCoverage(input);
  const checks = {
    narrative: Boolean(n.preliminary_brief_markdown),
    service: Boolean(n.primary_service_id) && !['NONE_APPLICABLE','NOT_APPLICABLE','NONE','UNKNOWN','N/A'].includes(String(n.primary_service_id).trim().toUpperCase()),
    recommended_action: Boolean(n.recommended_action),
    rationale: Boolean(n.rationale),
    evidence_fit: Object.values(n.match_classifications).some(item => item && typeof item === 'object' && ['MATCH','PARTIAL','PARTIAL_MATCH','MISMATCH'].includes(String(item.status || '').toUpperCase()) && Array.isArray(item.basis_ids) && item.basis_ids.length > 0),
    metrics: n.metrics.supported_match !== null && n.metrics.scorable_coverage !== null,
    discovery: n.discovery_questions.length >= 3,
    discovery_breadth: discovery_strategy.status === 'BREADTH_CANDIDATE',
    talking_points: n.talking_points.length >= 2,
    risk_or_unknown: n.risk_factors.length > 0 || n.remaining_unknowns.length > 0,
    evidence_lineage: n.intelligence_lineage.length > 0 && n.intelligence_lineage.every(item => Boolean(item.source_id))
  };
  const missing = Object.keys(checks).filter(key => !checks[key]);
  return { status: synthetic ? 'NOT_COMMERCIAL_BENCHMARK' : missing.length ? 'REVIEW_REQUIRED' : 'DEPTH_CANDIDATE', missing, checks, discovery_strategy };
}
