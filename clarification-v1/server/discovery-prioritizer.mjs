import { normalizeFinalArtifact } from './final-brief-renderer.mjs';
import { assessDiscoveryCoverage } from './discovery-coverage.mjs';

// No generated questions, asserted prospect facts, provider calls, or delivery decisions.
// Topic classification is a lexical heuristic; provenance refers to question origins
// and explicit FINALIZE classification data, not a verified claim about the buyer.
const TOPIC_DIMENSIONS = Object.freeze({
  buyer_outcome: ['business_trigger', 'buyer_outcome', 'business_objective'],
  technical_scope: ['service_need_alignment', 'technical_scope', 'scope_alignment'],
  existing_evidence: ['evidence_readiness', 'control_readiness', 'evidence_completeness'],
  stakeholder_authority: ['buyer_stakeholder_fit', 'decision_authority', 'stakeholder_fit'],
  commercial_feasibility: ['engagement_economics', 'budget_fit', 'commercial_fit'],
  timing: ['timing_urgency', 'business_trigger', 'timeline']
});
const TOPIC_BASE = Object.freeze({
  buyer_outcome: 5,
  technical_scope: 4,
  existing_evidence: 4,
  stakeholder_authority: 6,
  commercial_feasibility: 6,
  timing: 5
});
const OPEN_STATUSES = new Set(['UNKNOWN', 'PARTIAL', 'PARTIAL_MATCH', 'MISMATCH', 'GAP', 'UNVERIFIED']);
const STATUS_BONUS = Object.freeze({
  UNKNOWN: 6, UNVERIFIED: 6, GAP: 5, MISMATCH: 5, PARTIAL: 4, PARTIAL_MATCH: 4
});

function fingerprint(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function listedBasis(item, declaredSourceIds) {
  return Array.isArray(item?.basis_ids)
    ? [...new Set(item.basis_ids.filter(id => typeof id === 'string' && declaredSourceIds.has(id)))]
    : [];
}

export function prioritizeDiscoveryQuestions(input) {
  const normalized = normalizeFinalArtifact(input);
  const coverage = assessDiscoveryCoverage(input);
  // FINALIZE lineage is a declared reference set, not independent source verification.
  const declaredSourceIds = new Set(normalized.intelligence_lineage.map(item => item.source_id).filter(Boolean));
  const unresolved = Object.entries(normalized.match_classifications)
    .filter(([, item]) => item && typeof item === 'object' &&
      OPEN_STATUSES.has(String(item.status || '').toUpperCase()))
    .map(([dimension, item]) => ({
      dimension,
      status: String(item.status).toUpperCase(),
      declared_evidence_refs: listedBasis(item, declaredSourceIds)
    }));
  const byDimension = new Map(unresolved.map(item => [item.dimension, item]));
  const missing_unknowns = normalized.remaining_unknowns.map(item => ({
    dimension: item.id || null,
    description: item.description || null,
    // These are explicitly flagged as unknown, never rephrased as facts.
    reason: item.reason || null
  }));
  const seen = new Set();
  let duplicates_skipped = 0;
  let uncategorized_skipped = 0;
  const candidate = normalized.discovery_questions.flatMap((item, index) => {
    const text = String(item.question || '').trim();
    if (!text) return [];
    const fp = fingerprint(text);
    if (seen.has(fp)) {
      duplicates_skipped++;
      return [];
    }
    seen.add(fp);
    const topics = coverage.question_topics[index]?.topics || [];
    // A single narrow, possibly scope-specific question remains visible for review.
    // Longer generic lists with no relevance signals are not rewarded.
    if (!topics.length && normalized.discovery_questions.length !== 1) {
      uncategorized_skipped++;
      return [];
    }
    const gap_dimensions = [...new Set(topics.flatMap(topic =>
      TOPIC_DIMENSIONS[topic].filter(key => byDimension.has(key))))];
    const gap_items = gap_dimensions.map(key => byDimension.get(key));
    const declared_evidence_refs = [...new Set(gap_items.flatMap(gap => gap.declared_evidence_refs))];
    return [{
      original_index: index + 1,
      question: text,
      intent: item.intent || null,
      topics,
      unresolved_dimensions: gap_items.map(gap => ({dimension:gap.dimension,status:gap.status})),
      declared_evidence_refs,
      origin: 'FINALIZE_QUESTION_PLAN'
    }];
  });

  const selected = [];
  const remaining = [...candidate];
  const covered = new Set();
  while (remaining.length && selected.length < 5) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const q = remaining[i];
      const newTopics = q.topics.filter(topic => !covered.has(topic));
      const score = newTopics.reduce((sum, topic) => {
        const dimensions = TOPIC_DIMENSIONS[topic].map(key => byDimension.get(key)).filter(Boolean);
        const bonus = dimensions.length ? Math.max(...dimensions.map(d => STATUS_BONUS[d.status] || 0)) : 0;
        return sum + TOPIC_BASE[topic] + bonus;
      }, 0) + (q.topics.length ? 1 : 0);
      if (score > bestScore ||
          (score === bestScore && q.original_index < remaining[best]?.original_index)) {
        best = i;
        bestScore = score;
      }
    }
    const chosen = remaining.splice(best,1)[0];
    chosen.topics.forEach(topic => covered.add(topic));
    selected.push(chosen);
  }

  const missing_topics = Object.keys(TOPIC_DIMENSIONS).filter(topic => !covered.has(topic));
  const breadth = covered.size >= 4 &&
    (covered.has('buyer_outcome') || covered.has('timing')) &&
    (covered.has('technical_scope') || covered.has('existing_evidence')) &&
    (covered.has('stakeholder_authority') || covered.has('commercial_feasibility'));
  return {
    status: selected.length >= 3 && breadth ? 'PRIORITIZED_FOR_REVIEW' : 'INSUFFICIENT_GROUNDED_QUESTIONS',
    source_question_count: normalized.discovery_questions.length,
    selected_count: selected.length,
    selected,
    missing_topics,
    unresolved_dimensions: unresolved,
    explicit_unknowns: missing_unknowns,
    duplicates_skipped,
    uncategorized_skipped,
    limitations: 'Question selection is advisory. No missing questions were generated; AI-declared source IDs are not independently verified; validate question relevance and all source claims before a call.'
  };
}
