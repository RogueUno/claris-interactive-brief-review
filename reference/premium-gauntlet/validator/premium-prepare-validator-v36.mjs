const DIMENSION_KINDS = new Set([
  'SUBJECT_SCOPE','DESIRED_OUTCOME','BUSINESS_TRIGGER_DETAIL','TIMING',
  'AUTHORITY','ECONOMICS','CONSULTANT_POLICY_REQUIRED','OTHER_EXPLICIT'
]);
const PUBLIC_AUTHORITIES = new Set(['FIRST_PARTY_PUBLIC','THIRD_PARTY_PUBLIC']);
const OPEN_AUTHORITIES = new Set(['BOOKING','PROSPECT','CONSULTANT_POLICY']);

function arr(v){ return Array.isArray(v)?v:[]; }
function words(s=''){ return String(s).trim().split(/\s+/).filter(Boolean).length; }
function norm(s=''){ return String(s).toLowerCase().replace(/\s+/g,' ').trim(); }
function err(errors,code,path,message){ errors.push({code,path,message}); }

export function validatePremiumPrepareV36(artifact, opts={}) {
  const errors=[];
  const bookingText=String(opts.bookingText||'');
  const prospectEvidence=arr(opts.prospectEvidence).map(String);
  const allowedPolicyKeys=new Set(arr(opts.allowedPolicyKeys));
  const allowedServiceIds=new Set(arr(opts.allowedServiceIds));
  const companyDomainHost=opts.companyDomainHost||null;

  if(!artifact || typeof artifact!=='object') return {ok:false,errors:[{code:'ARTIFACT_TYPE',path:'$',message:'Artifact must be an object.'}]};
  if(artifact.schema_version!=='CLARIS_PREMIUM_PREPARE_V3_6') err(errors,'SCHEMA_VERSION','schema_version','Expected CLARIS_PREMIUM_PREPARE_V3_6.');

  const dims=arr(artifact.open_dimensions);
  if(!dims.length) err(errors,'DIMENSION_COUNT','open_dimensions','At least one open dimension required.');
  const dimIds=new Set();
  for(const [i,d] of dims.entries()){
    const p=`open_dimensions[${i}]`;
    if(!d?.dimension_id) err(errors,'DIMENSION_ID',`${p}.dimension_id`,'Missing dimension_id.');
    else if(dimIds.has(d.dimension_id)) err(errors,'DIMENSION_DUPLICATE',`${p}.dimension_id`,`Duplicate dimension_id: ${d.dimension_id}`);
    else dimIds.add(d.dimension_id);
    if(!DIMENSION_KINDS.has(d?.dimension_kind)) err(errors,'DIMENSION_KIND',`${p}.dimension_kind`,`Unsupported dimension kind: ${d?.dimension_kind}`);
    if(!OPEN_AUTHORITIES.has(d?.authority)) err(errors,'DIMENSION_AUTHORITY',`${p}.authority`,'Only BOOKING, PROSPECT, or CONSULTANT_POLICY may open a dimension.');
    if(PUBLIC_AUTHORITIES.has(d?.authority)) err(errors,'PUBLIC_OPEN_DIMENSION',`${p}.authority`,'Public research cannot open a discovery dimension.');
    if(d?.authority==='BOOKING'){
      const q=norm(d.authority_quote||'');
      if(!q || !norm(bookingText).includes(q)) err(errors,'BOOKING_QUOTE',`${p}.authority_quote`,'BOOKING authority quote must be a literal substring of booking text.');
    }
    if(d?.authority==='PROSPECT'){
      const q=norm(d.authority_quote||'');
      if(!q || !prospectEvidence.some(x=>norm(x).includes(q))) err(errors,'PROSPECT_QUOTE',`${p}.authority_quote`,'PROSPECT authority quote must be grounded in supplied prospect evidence.');
    }
    if(d?.authority==='CONSULTANT_POLICY'){
      if(!d.policy_key || !allowedPolicyKeys.has(d.policy_key)) err(errors,'POLICY_KEY',`${p}.policy_key`,'Consultant-policy dimension must cite an allowed explicit policy key.');
    }
  }

  const questions=arr(artifact.priority_questions);
  const qCount=new Map();
  for(const [i,q] of questions.entries()){
    const p=`priority_questions[${i}]`;
    if(!dimIds.has(q?.dimension_id)) err(errors,'QUESTION_DIMENSION',`${p}.dimension_id`,'Question references an unadmitted dimension.');
    qCount.set(q?.dimension_id,(qCount.get(q?.dimension_id)||0)+1);
  }
  for(const d of dims){
    const count=qCount.get(d.dimension_id)||0;
    if(count<1) err(errors,'QUESTION_REQUIRED','priority_questions',`No priority question resolves ${d.dimension_id}.`);
    if(count>Number(d.max_questions ?? 1)) err(errors,'QUESTION_BUDGET','priority_questions',`Question budget exceeded for ${d.dimension_id}.`);
  }

  const unknowns=arr(artifact.critical_unknowns);
  const unknownCount=new Map();
  for(const [i,u] of unknowns.entries()){
    if(!dimIds.has(u?.dimension_id)) err(errors,'UNKNOWN_DIMENSION',`critical_unknowns[${i}].dimension_id`,'Unknown references an unadmitted dimension.');
    else unknownCount.set(u.dimension_id,(unknownCount.get(u.dimension_id)||0)+1);
  }
  for(const d of dims) if((unknownCount.get(d.dimension_id)||0)<1) err(errors,'CRITICAL_UNKNOWN_REQUIRED','critical_unknowns',`No critical unknown covers ${d.dimension_id}.`);
  const hypotheses=arr(artifact.opportunity_hypotheses);
  if(hypotheses.length>2) err(errors,'HYPOTHESIS_COUNT','opportunity_hypotheses','At most two hypotheses.');
  for(const [i,h] of hypotheses.entries()) if(!dimIds.has(h?.dimension_id)) err(errors,'HYPOTHESIS_DIMENSION',`opportunity_hypotheses[${i}].dimension_id`,'Hypothesis references an unadmitted dimension.');

  const paths=arr(artifact.conditional_service_paths);
  for(const [i,pth] of paths.entries()){
    const p=`conditional_service_paths[${i}]`;
    if(allowedServiceIds.size && !allowedServiceIds.has(pth?.service_id)) err(errors,'SERVICE_ID',`${p}.service_id`,`Unknown service_id: ${pth?.service_id}`);
    for(const d of arr(pth?.depends_on_dimensions)) if(!dimIds.has(d)) err(errors,'SERVICE_DIMENSION',`${p}.depends_on_dimensions`,`Unadmitted dimension: ${d}`);
  }

  const blocks=artifact.expandable_blocks||{};
  const ev=arr(blocks.evidence), rs=arr(blocks.reasoning), us=arr(blocks.unknowns);
  const eIds=new Set(ev.map(x=>x?.id).filter(Boolean));
  const rIds=new Set(rs.map(x=>x?.id).filter(Boolean));
  const uIds=new Set(us.map(x=>x?.id).filter(Boolean));
  const routeIds=new Set([...eIds,...rIds,...uIds]);

  for(const [i,e] of ev.entries()){
    const p=`expandable_blocks.evidence[${i}]`;
    if(!/^E\d+$/.test(e?.id||'')) err(errors,'EVIDENCE_ID',`${p}.id`,'Evidence id must match E#.');
    if(!arr(e?.sources).length || !arr(e?.used_for).length || !arr(e?.not_used_for).length) err(errors,'EVIDENCE_SHAPE',p,'Evidence needs sources, used_for, not_used_for.');
    if(companyDomainHost) for(const src of arr(e?.sources)) if(src?.source_type==='FIRST_PARTY'){
      try { const h=new URL(src.url).hostname; if(!(h===companyDomainHost||h.endsWith('.'+companyDomainHost))) err(errors,'FIRST_PARTY_DOMAIN',`${p}.sources`,'FIRST_PARTY source is not on canonical domain.'); }
      catch { err(errors,'SOURCE_URL',`${p}.sources`,'Invalid source URL.'); }
    }
  }
  for(const [i,r] of rs.entries()){
    const p=`expandable_blocks.reasoning[${i}]`;
    if(!/^R\d+$/.test(r?.id||'')) err(errors,'REASONING_ID',`${p}.id`,'Reasoning id must match R#.');
    if(!arr(r?.premises).length || !r?.observation || !arr(r?.not_a_claim_of).length) err(errors,'REASONING_SHAPE',p,'Reasoning needs premises, observation, not_a_claim_of.');
    for(const e of arr(r?.linked_evidence_ids)) if(!eIds.has(e)) err(errors,'REASONING_ROUTE',`${p}.linked_evidence_ids`,`Unknown evidence route ${e}.`);
  }
  const unknownBlockCount=new Map();
  for(const [i,u] of us.entries()){
    const p=`expandable_blocks.unknowns[${i}]`;
    if(!/^U\d+$/.test(u?.id||'')) err(errors,'UNKNOWN_ID',`${p}.id`,'Unknown id must match U#.');
    if(!dimIds.has(u?.dimension_id)) err(errors,'UNKNOWN_BLOCK_DIM',`${p}.dimension_id`,'Unknown block references unadmitted dimension.');
    else unknownBlockCount.set(u.dimension_id,(unknownBlockCount.get(u.dimension_id)||0)+1);
    if(!u?.why_unknown || !u?.what_would_resolve_it || !arr(u?.blocked_conclusions).length) err(errors,'UNKNOWN_SHAPE',p,'Unknown needs why_unknown, what_would_resolve_it, blocked_conclusions.');
  }
  for(const d of dims) if((unknownBlockCount.get(d.dimension_id)||0)<1) err(errors,'UNKNOWN_BLOCK_REQUIRED','expandable_blocks.unknowns',`No expandable unknown covers ${d.dimension_id}.`);
  for(const [i,o] of [...arr(artifact.signals_that_matter),...hypotheses,...questions,...paths,...unknowns].entries())
    for(const ref of arr(o?.routes_to)) if(!routeIds.has(ref)) err(errors,'ROUTE_INTEGRITY',`routes[${i}]`,`Unknown provenance reference ${ref}.`);

  const md=String(artifact.premium_brief_markdown||'');
  const wc=words(md);
  if(!md) err(errors,'MARKDOWN_REQUIRED','premium_brief_markdown','Main brief required.');
  if(wc<350 || wc>650) err(errors,'MARKDOWN_WORD_COUNT','premium_brief_markdown',`Expected 350-650 words; got ${wc}.`);

  return {ok:errors.length===0,word_count:wc,errors};
}
