const MATCH_DIMENSIONS = Object.freeze([
  { key: 'service_need_alignment', label: 'Service need', weight: 30 },
  { key: 'icp_company_fit', label: 'ICP fit', weight: 20 },
  { key: 'business_trigger', label: 'Business trigger', weight: 15 },
  { key: 'buyer_stakeholder_fit', label: 'Buyer / stakeholder', weight: 10 },
  { key: 'engagement_economics', label: 'Engagement economics', weight: 10 },
  { key: 'timing_urgency', label: 'Timing / urgency', weight: 10 },
  { key: 'expansion_potential', label: 'Expansion potential', weight: 5 }
]);
const EVIDENCE_DIMENSIONS = Object.freeze([
  { key: 'critical_question_coverage', label: 'Critical-question coverage', weight: 35 },
  { key: 'source_authority', label: 'Source authority', weight: 25 },
  { key: 'corroboration_depth', label: 'Corroboration depth', weight: 15 },
  { key: 'freshness', label: 'Freshness', weight: 15 },
  { key: 'conflict_ambiguity_control', label: 'Conflict / ambiguity control', weight: 10 }
]);
const MATCH_POINTS = Object.freeze({ MATCH: 1, PARTIAL_MATCH: 0.5, MISMATCH: 0, UNKNOWN: 0 });
const EVIDENCE_POINTS = Object.freeze({ COMPLETE: 1, PARTIAL: 0.6, WEAK: 0.25, MISSING: 0 });
const MATCH_STATUSES = new Set(Object.keys(MATCH_POINTS));
const EVIDENCE_STATUSES = new Set(Object.keys(EVIDENCE_POINTS));
const arr = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const round1 = value => Math.round((Number(value) + Number.EPSILON) * 10) / 10;
function classification(source, key, allowed, code) {
  const node = source?.[key];
  const status = text(node?.status);
  if (!allowed.has(status)) throw new Error(`${code}:${key}`);
  const basisIds = arr(node?.basis_ids).map(text).filter(Boolean);
  const reason = text(node?.reason);
  if (status !== 'UNKNOWN' && status !== 'MISSING' && !basisIds.length) throw new Error(`SCORE_BASIS_REQUIRED:${key}`);
  if (!reason) throw new Error(`SCORE_REASON_REQUIRED:${key}`);
  return { status, basis_ids: [...new Set(basisIds)], reason };
}
function gradeFor(rate, coverage) {
  if (!Number.isFinite(rate) || coverage < 40) return null;
  if (rate >= 85) return 'A';
  if (rate >= 70) return 'B';
  if (rate >= 55) return 'C';
  if (rate >= 40) return 'D';
  return 'E';
}
function fitDescriptor(rate, coverage) {
  if (!Number.isFinite(rate)) return 'Not yet scorable';
  if (coverage < 40) return 'Early evaluated signal';
  if (rate >= 85) return 'Very strong evaluated fit';
  if (rate >= 70) return 'Strong evaluated fit';
  if (rate >= 55) return 'Mixed evaluated fit';
  if (rate >= 40) return 'Weak evaluated fit';
  return 'Low evaluated fit';
}

function requireBasis(dimension, requiredIds) {
  if (dimension.status === 'UNKNOWN') return;
  for (const id of requiredIds) {
    if (!dimension.basis_ids.includes(id)) throw new Error(`SCORE_BASIS_COMPOSITION:${dimension.key}:${id}`);
  }
}

function requireAnyEvidenceBasis(dimension) {
  if (dimension.status === 'UNKNOWN') return;
  if (!dimension.basis_ids.some(id => /^E\d+$/.test(id) || /^PE-/.test(id))) {
    throw new Error(`SCORE_BASIS_COMPOSITION:${dimension.key}:PUBLIC_EVIDENCE`);
  }
}
function evidenceDescriptor(score) {
  if (score >= 85) return 'Very strong evidence basis';
  if (score >= 70) return 'Strong evidence basis';
  if (score >= 55) return 'Usable evidence basis';
  if (score >= 40) return 'Thin evidence basis';
  return 'Insufficient evidence basis';
}
function readiness(prepare, discovery, certification) {
  const flags = ['premium_semantic_pass','discovery_semantic_pass','premium_deterministic_pass','discovery_deterministic_pass'];
  const certified = certification?.schema_version === 'CLARIS_PRECALL_CERTIFICATION_V1' && flags.every(key => certification?.[key] === true);
  const openIds = new Set(arr(prepare?.open_dimensions).map(item => text(item?.dimension_id)).filter(Boolean));
  for (const dimension of arr(discovery?.authorized_dimensions)) {
    if (dimension?.authority === 'CONSULTANT_POLICY') openIds.add(text(dimension?.dimension_id));
  }
  const questionCounts = new Map();
  for (const question of arr(discovery?.primary_questions)) {
    const id = text(question?.dimension_id);
    if (id) questionCounts.set(id, (questionCounts.get(id) || 0) + 1);
  }
  const uncovered = [...openIds].filter(id => !(questionCounts.get(id) > 0));
  return {
    status: certified && !uncovered.length && openIds.size > 0 ? 'READY' : 'NOT_READY',
    open_variables: openIds.size,
    uncovered_dimensions: uncovered,
    certified
  };
}
export function compilePrecallScorecard(input = {}) {
  const gate = text(input?.score_basis?.gate_status);
  if (!['PASS','CORRECTED'].includes(gate)) throw new Error('SCORE_BASIS_GATE_NOT_PASSED');
  if (input?.score_basis?.basis_resolution?.all_scored_basis_resolvable !== true) throw new Error('SCORE_BASIS_NOT_RESOLVABLE');
  const fitSource = input.score_basis.canonical_match_classifications;
  const evidenceSource = input.score_basis.canonical_completeness_classifications;
  if (!fitSource || typeof fitSource !== 'object') throw new Error('MATCH_CLASSIFICATIONS_REQUIRED');
  if (!evidenceSource || typeof evidenceSource !== 'object') throw new Error('COMPLETENESS_CLASSIFICATIONS_REQUIRED');
  let supportedMatch = 0;
  let scorableCoverage = 0;
  const fitDimensions = MATCH_DIMENSIONS.map(def => {
    const item = classification(fitSource, def.key, MATCH_STATUSES, 'MATCH_STATUS_INVALID');
    const scorable = item.status !== 'UNKNOWN';
    const supportedPoints = round1(def.weight * MATCH_POINTS[item.status]);
    const scorablePoints = scorable ? def.weight : 0;
    supportedMatch += supportedPoints;
    scorableCoverage += scorablePoints;
    return { ...def, ...item, supported_points: supportedPoints, scorable_points: scorablePoints };
  });

  const fitByKey = Object.fromEntries(fitDimensions.map(item => [item.key, item]));
  requireBasis(fitByKey.service_need_alignment, ['BOOK-001', 'SOT:services']);
  requireBasis(fitByKey.business_trigger, ['BOOK-001']);
  requireBasis(fitByKey.buyer_stakeholder_fit, ['BOOK-001']);
  requireBasis(fitByKey.engagement_economics, ['BOOK-001']);
  requireBasis(fitByKey.timing_urgency, ['BOOK-001']);
  requireBasis(fitByKey.expansion_potential, ['BOOK-001', 'SOT:services']);
  if (fitByKey.icp_company_fit.status !== 'UNKNOWN') {
    requireBasis(fitByKey.icp_company_fit, ['SOT:icp']);
    requireAnyEvidenceBasis(fitByKey.icp_company_fit);
  }

  supportedMatch = round1(supportedMatch);
  scorableCoverage = round1(scorableCoverage);
  const evaluatedFitRate = scorableCoverage > 0 ? round1(100 * supportedMatch / scorableCoverage) : null;
  let evidenceScore = 0;
  const evidenceDimensions = EVIDENCE_DIMENSIONS.map(def => {
    const item = classification(evidenceSource, def.key, EVIDENCE_STATUSES, 'EVIDENCE_STATUS_INVALID');
    const points = round1(def.weight * EVIDENCE_POINTS[item.status]);
    evidenceScore += points;
    return { ...def, ...item, points };
  });
  evidenceScore = round1(evidenceScore);
  const strategySource = input.score_basis.corrected_strategy || {};
  const strategy = {
    recommended_action: text(strategySource.recommended_action) || null,
    primary_service_id: text(strategySource.primary_service_id) || null,
    qualification_status: text(strategySource.qualification_status) || null,
    rationale: text(strategySource.rationale) || null
  };

  return {
    schema_version: 'CLARIS_PRECALL_SCORECARD_V1',
    lead_fit: {
      grade: gradeFor(evaluatedFitRate, scorableCoverage),
      descriptor: fitDescriptor(evaluatedFitRate, scorableCoverage),
      scorable_coverage: scorableCoverage,
      dimensions: fitDimensions
    },
    evidence_coverage: {
      score: evidenceScore,
      descriptor: evidenceDescriptor(evidenceScore),
      dimensions: evidenceDimensions
    },
    call_readiness: readiness(input.prepare, input.discovery, input.certification),
    strategy
  };
}
export const precallScorecardContract = Object.freeze({
  schema_version: 'CLARIS_PRECALL_SCORECARD_V1',
  match_dimensions: MATCH_DIMENSIONS,
  evidence_dimensions: EVIDENCE_DIMENSIONS
});
