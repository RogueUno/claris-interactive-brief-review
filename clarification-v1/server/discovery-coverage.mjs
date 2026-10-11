import { normalizeFinalArtifact } from './final-brief-renderer.mjs';

// Diagnostic only: lexical coverage does not prove a question is relevant or good.
// Always inspect the actual question and its evidence before using it commercially.
const TOPICS = Object.freeze({
  buyer_outcome: /\b(decision|business goal|business objective|desired outcome|procurement|customer assessment|why now|business driver|buyer goal|unlock)\b/i,
  technical_scope: /\b(scope|in.scope|system boundary|infrastructure|application|applications|environment|environments|system|systems|product|products|assets|cloud accounts)\b/i,
  existing_evidence: /\b(evidence|readiness|controls?|audit trail|documentation|documents|policies|risk assessment|access reviews|change management|incident response|gap assessment)\b/i,
  stakeholder_authority: /\b(who owns|ownership|stakeholders?|decision.maker|decision authority|approve|approval|approver|responsible|accountable|sign.off|internal owner)\b/i,
  commercial_feasibility: /\b(budget|funding|financial|investment|spend|commercial feasibility|commercial qualification|pricing|purchase approval)\b/i,
  timing: /\b(deadline|due date|timeline|timeframe|actual required date|milestone|urgency|when must|go.live date|target date)\b/i
});
const orderedTopics = Object.keys(TOPICS);
function fingerprint(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g,' ');
}

export function assessDiscoveryCoverage(input) {
  const questions = normalizeFinalArtifact(input).discovery_questions;
  const covered = Object.fromEntries(orderedTopics.map(topic => [topic,false]));
  const seen = new Set();
  const duplicated_indices = [];
  const question_topics = questions.map((item,index) => {
    const question = String(item.question || '');
    const intent = String(item.intent || '');
    // Intent can clarify the actual question. Never infer coverage from general
    // prospect narrative, qualification, or facts not in the question plan.
    const candidate = question + ' ' + intent;
    const topics = orderedTopics.filter(topic => TOPICS[topic].test(candidate));
    topics.forEach(topic => { covered[topic] = true; });
    const normalized = fingerprint(question);
    if (normalized && seen.has(normalized)) duplicated_indices.push(index + 1);
    seen.add(normalized);
    return { index:index+1, topics };
  });
  const missing = orderedTopics.filter(topic => !covered[topic]);
  const covered_count = orderedTopics.length - missing.length;
  // Heuristic breadth, not consultant-quality certification or SEND approval.
  const broad_enough = covered_count >= 4 &&
    (covered.buyer_outcome || covered.timing) &&
    (covered.technical_scope || covered.existing_evidence) &&
    (covered.stakeholder_authority || covered.commercial_feasibility) &&
    duplicated_indices.length === 0;
  return {
    status:broad_enough ? 'BREADTH_CANDIDATE' : 'BREADTH_REVIEW_REQUIRED',
    question_count:questions.length,
    covered_count, total_topics:orderedTopics.length,
    covered, missing, question_topics, duplicated_indices
  };
}
