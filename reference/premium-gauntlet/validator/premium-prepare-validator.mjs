const ALLOWED_DIMENSIONS = new Set(['TECHNICAL_SCOPE', 'DESIRED_OUTCOME']);
const FORBIDDEN_DISCOVERY = /\b(budget|timeline|deadline|urgency|why now|decision[- ]?maker|buyer authority|stakeholder|procurement|internal resources?|team capacity|maturity|compliance deadline|prior testing|success criteria)\b/i;

function words(text='') {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}
function arr(v) { return Array.isArray(v) ? v : []; }
function push(errors, code, path, message) { errors.push({code, path, message}); }

export function validatePremiumPrepare(artifact, opts={}) {
  const errors = [];
  const allowedServiceIds = new Set(opts.allowedServiceIds || []);
  const companyDomainHost = opts.companyDomainHost || null;
  const bookingText = opts.bookingText || '';
  if (!artifact || typeof artifact !== 'object') {
    return {ok:false, errors:[{code:'ARTIFACT_TYPE', path:'$', message:'Artifact must be an object.'}]};
  }
  if (artifact.schema_version !== 'CLARIS_PREMIUM_PREPARE_V3_5') push(errors,'SCHEMA_VERSION','schema_version','Expected CLARIS_PREMIUM_PREPARE_V3_5.');

  const dims = arr(artifact.open_dimensions);
  if (dims.length !== 2) push(errors,'DIMENSION_COUNT','open_dimensions','Exactly two dimensions are required for this sparse fixture.');
  const dimIds = new Set();
  const dimNames = new Set();
  for (const [i,d] of dims.entries()) {
    const p=`open_dimensions[${i}]`;
    if (!d || typeof d !== 'object') { push(errors,'DIMENSION_SHAPE',p,'Dimension must be an object.'); continue; }
    if (!d.dimension_id) push(errors,'DIMENSION_ID',`${p}.dimension_id`,'Missing dimension_id.'); else dimIds.add(d.dimension_id);
    if (!ALLOWED_DIMENSIONS.has(d.dimension)) push(errors,'DIMENSION_NOT_ALLOWED',`${p}.dimension`,`Forbidden/unexposed dimension: ${d.dimension}`); else dimNames.add(d.dimension);
    if (!arr(d.exposed_by).includes('BOOKING')) push(errors,'DIMENSION_AUTHORITY',`${p}.exposed_by`,'Dimension must be booking-exposed.');
  }
  for (const required of ALLOWED_DIMENSIONS) if (!dimNames.has(required)) push(errors,'DIMENSION_REQUIRED','open_dimensions',`Missing required dimension ${required}.`);

  const signals = arr(artifact.signals_that_matter);
  if (signals.length !== 4) push(errors,'SIGNAL_COUNT','signals_that_matter','Exactly four high-value signals required.');

  const hypotheses = arr(artifact.opportunity_hypotheses);
  if (hypotheses.length > 2) push(errors,'HYPOTHESIS_COUNT','opportunity_hypotheses','At most two hypotheses allowed; zero is valid.');
  for (const [i,h] of hypotheses.entries()) {
    if (!dimIds.has(h?.dimension_id)) push(errors,'HYPOTHESIS_DIMENSION',`opportunity_hypotheses[${i}].dimension_id`,'Hypothesis references an unadmitted dimension.');
  }

  const questions = arr(artifact.priority_questions);
  if (questions.length !== 2) push(errors,'QUESTION_COUNT','priority_questions','Exactly two priority questions required for this sparse fixture.');
  const questionDims = new Map();
  for (const [i,q] of questions.entries()) {
    const p=`priority_questions[${i}]`;
    if (!dimIds.has(q?.dimension_id)) push(errors,'QUESTION_DIMENSION',`${p}.dimension_id`,'Question references an unadmitted dimension.');
    questionDims.set(q?.dimension_id, (questionDims.get(q?.dimension_id)||0)+1);
    if (FORBIDDEN_DISCOVERY.test(String(q?.question||''))) push(errors,'GENERIC_DISCOVERY',`${p}.question`,'Question introduces a forbidden generic discovery dimension.');
  }
  for (const d of dims) {
    if ((questionDims.get(d.dimension_id)||0) > Number(d.max_questions ?? 1)) push(errors,'QUESTION_BUDGET','priority_questions',`Question budget exceeded for ${d.dimension_id}.`);
  }

  const unknowns = arr(artifact.critical_unknowns);
  if (unknowns.length !== dims.length) push(errors,'UNKNOWN_COUNT','critical_unknowns','Critical unknowns must mirror admitted dimensions exactly.');
  const unknownDims = new Set();
  for (const [i,u] of unknowns.entries()) {
    const p=`critical_unknowns[${i}]`;
    if (!dimIds.has(u?.dimension_id)) push(errors,'UNKNOWN_DIMENSION',`${p}.dimension_id`,'Unknown references an unadmitted dimension.'); else unknownDims.add(u.dimension_id);
    if (FORBIDDEN_DISCOVERY.test(String(u?.unknown||''))) push(errors,'GENERIC_UNKNOWN',`${p}.unknown`,'Unknown introduces a forbidden generic discovery dimension.');
  }
  for (const id of dimIds) if (!unknownDims.has(id)) push(errors,'UNKNOWN_MISSING','critical_unknowns',`Missing critical unknown for ${id}.`);

  const paths = arr(artifact.conditional_service_paths);
  if (paths.length > 3) push(errors,'SERVICE_PATH_COUNT','conditional_service_paths','At most three conditional service paths allowed.');
  for (const [i,pth] of paths.entries()) {
    const p=`conditional_service_paths[${i}]`;
    if (allowedServiceIds.size && !allowedServiceIds.has(pth?.service_id)) push(errors,'SERVICE_ID',`${p}.service_id`,`Unknown service_id: ${pth?.service_id}`);
    for (const d of arr(pth?.depends_on_dimensions)) if (!dimIds.has(d)) push(errors,'SERVICE_DIMENSION',`${p}.depends_on_dimensions`,`Service path depends on unadmitted dimension ${d}.`);
  }

  const blocks = artifact.expandable_blocks || {};
  const evidence = arr(blocks.evidence), reasoning = arr(blocks.reasoning), ub = arr(blocks.unknowns);
  const eIds = new Set(evidence.map(x=>x?.id).filter(Boolean));
  const rIds = new Set(reasoning.map(x=>x?.id).filter(Boolean));
  const uIds = new Set(ub.map(x=>x?.id).filter(Boolean));
  const allIds = new Set([...eIds,...rIds,...uIds]);
  for (const [i,e] of evidence.entries()) {
    const p=`expandable_blocks.evidence[${i}]`;
    if (!/^E\d+$/.test(e?.id||'')) push(errors,'EVIDENCE_ID',`${p}.id`,'Evidence id must match E#.');
    if (!arr(e?.sources).length) push(errors,'EVIDENCE_SOURCE',`${p}.sources`,'Evidence source required.');
    if (!arr(e?.used_for).length || !arr(e?.not_used_for).length) push(errors,'EVIDENCE_USAGE',p,'Evidence must state used_for and not_used_for.');
    if (companyDomainHost) for (const src of arr(e?.sources)) {
      if (src?.source_type === 'FIRST_PARTY') {
        try { const host = new URL(src.url).hostname; if (!(host===companyDomainHost || host.endsWith('.'+companyDomainHost))) push(errors,'FIRST_PARTY_DOMAIN',`${p}.sources`,'FIRST_PARTY source is not on canonical domain.'); } catch { push(errors,'SOURCE_URL',`${p}.sources`,'Invalid source URL.'); }
      }
    }
  }
  for (const [i,r] of reasoning.entries()) {
    const p=`expandable_blocks.reasoning[${i}]`;
    if (!/^R\d+$/.test(r?.id||'')) push(errors,'REASONING_ID',`${p}.id`,'Reasoning id must match R#.');
    if (!arr(r?.premises).length || !r?.observation || !arr(r?.not_a_claim_of).length) push(errors,'REASONING_SHAPE',p,'Reasoning requires premises, observation, not_a_claim_of.');
    for (const e of arr(r?.linked_evidence_ids)) if (!eIds.has(e)) push(errors,'REASONING_ROUTE',`${p}.linked_evidence_ids`,`Unknown evidence route ${e}.`);
  }
  for (const [i,u] of ub.entries()) {
    const p=`expandable_blocks.unknowns[${i}]`;
    if (!/^U\d+$/.test(u?.id||'')) push(errors,'UNKNOWN_BLOCK_ID',`${p}.id`,'Unknown block id must match U#.');
    if (!dimIds.has(u?.dimension_id)) push(errors,'UNKNOWN_BLOCK_DIMENSION',`${p}.dimension_id`,'Unknown block must reference admitted dimension.');
    if (!u?.why_unknown || !u?.what_would_resolve_it || !arr(u?.blocked_conclusions).length) push(errors,'UNKNOWN_BLOCK_SHAPE',p,'Unknown block requires why_unknown, what_would_resolve_it, blocked_conclusions.');
  }

  const routeOwners = [...signals, ...hypotheses, ...questions, ...paths, ...unknowns];
  for (const [i,o] of routeOwners.entries()) for (const ref of arr(o?.routes_to)) if (!allIds.has(ref)) push(errors,'ROUTE_INTEGRITY',`routes[${i}]`,`Unknown provenance reference ${ref}.`);

  const md = String(artifact.premium_brief_markdown||'');
  const wc = words(md);
  if (!md) push(errors,'MARKDOWN_REQUIRED','premium_brief_markdown','premium_brief_markdown is required.');
  if (wc < 420 || wc > 600) push(errors,'MARKDOWN_WORD_COUNT','premium_brief_markdown',`Main brief must be 420-600 words; got ${wc}.`);
  if (/\bHIPAA\b/i.test(md) && !/\bHIPAA\b/i.test(bookingText)) push(errors,'DORMANT_HIPAA','premium_brief_markdown','HIPAA is dormant context for this booking and must stay in expandable evidence.');
  if (FORBIDDEN_DISCOVERY.test(md)) push(errors,'GENERIC_DISCOVERY_MAIN','premium_brief_markdown','Main brief contains generic discovery concepts forbidden for this sparse booking.');

  return {ok:errors.length===0, word_count:wc, errors};
}
