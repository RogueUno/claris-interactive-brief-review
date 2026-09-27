const arr=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value.trim():'';

const MATCH_KEYS=['service_need_alignment','icp_company_fit','business_trigger','buyer_stakeholder_fit','engagement_economics','timing_urgency','expansion_potential'];
const COMPLETENESS_KEYS=['critical_question_coverage','source_authority','corroboration_depth','freshness','conflict_ambiguity_control'];
const MATCH_STATUSES=new Set(['MATCH','PARTIAL_MATCH','MISMATCH','UNKNOWN']);
const COMPLETENESS_STATUSES=new Set(['COMPLETE','PARTIAL','WEAK','MISSING']);
const BASIS_ALIASES=new Map([
  ['BOOKING TRUTH','BOOK-001'],
  ['BOOKING','BOOK-001']
]);

function clone(value){return JSON.parse(JSON.stringify(value));}
function normalizeIds(ids=[]){return [...new Set(arr(ids).map(id=>BASIS_ALIASES.get(String(id))||String(id)).filter(Boolean))];}
function fail(code,path=''){throw new Error(path?code+':'+path:code);}
function requireReason(node,key){if(!text(node?.reason))fail('SCORE_REASON_REQUIRED',key);}
function requireIds(node,key,missingStatus){
  if(node?.status!==missingStatus && !normalizeIds(node?.basis_ids).length) fail('SCORE_BASIS_REQUIRED',key);
}
function requireBasis(node,key,required){
  if(node?.status==='UNKNOWN') return;
  const ids=new Set(normalizeIds(node?.basis_ids));
  for(const id of required) if(!ids.has(id)) fail('SCORE_BASIS_COMPOSITION',key+':'+id);
}

export function resolvePrecallScoreBasis(input={}){
  const basis=clone(input.score_basis||{});
  const sot=input.consultant_sot||{};
  const research=input.research_evidence||{};
  const prepare=input.prepare||{};
  const discovery=input.discovery||{};

  const fit=basis.canonical_match_classifications||{};
  const completeness=basis.canonical_completeness_classifications||{};

  for(const key of MATCH_KEYS){
    const node=fit[key];
    if(!node || !MATCH_STATUSES.has(text(node.status))) fail('MATCH_STATUS_INVALID',key);
    node.basis_ids=node.status==='UNKNOWN' ? [] : normalizeIds(node.basis_ids);
    requireReason(node,key);
    requireIds(node,key,'UNKNOWN');
  }
  for(const key of COMPLETENESS_KEYS){
    const node=completeness[key];
    if(node?.status==='MISSING') node.basis_ids=[];
    if(!node || !COMPLETENESS_STATUSES.has(text(node.status))) fail('COMPLETENESS_STATUS_INVALID',key);
    node.basis_ids=normalizeIds(node.basis_ids);
    requireReason(node,key);
    requireIds(node,key,'MISSING');
  }

  const allowed=new Set(['BOOK-001']);
  if(arr(sot?.services).length) allowed.add('SOT:services');
  if(sot?.icp || sot?.target_company_types || sot?.company_types || sot?.ideal_customer_profile) allowed.add('SOT:icp');
  if(sot?.buyers || sot?.buyer_roles || sot?.target_buyers) allowed.add('SOT:buyers');
  if(sot?.commercial_rules) allowed.add('SOT:commercial_rules');
  if(sot?.first_call || sot?.first_call_requirements || sot?.discovery_rules) allowed.add('SOT:first_call');

  const eIds=arr(prepare?.expandable_blocks?.evidence).map(x=>text(x?.id)).filter(Boolean).sort();
  const rIds=arr(prepare?.expandable_blocks?.reasoning).map(x=>text(x?.id)).filter(Boolean).sort();
  const uIds=arr(prepare?.expandable_blocks?.unknowns).map(x=>text(x?.id)).filter(Boolean).sort();
  const peIds=arr(research?.findings).map(x=>text(x?.evidence_id)).filter(Boolean).sort();
  const dimIds=[...new Set([
    ...arr(prepare?.open_dimensions).map(x=>text(x?.dimension_id)),
    ...arr(discovery?.authorized_dimensions).map(x=>text(x?.dimension_id))
  ].filter(Boolean))].sort();
  const qIds=arr(discovery?.primary_questions).map(x=>text(x?.question_id)).filter(Boolean).sort();

  for(const id of [...eIds,...rIds,...uIds,...peIds]) allowed.add(id);
  for(const id of dimIds) allowed.add('DIM:'+id);
  for(const id of qIds) allowed.add('Q:'+id);

  // Fit basis is authority-bearing: validate exactly after alias normalization.
  for(const key of MATCH_KEYS){
    for(const id of fit[key].basis_ids){
      if(!allowed.has(id)) fail('SCORE_BASIS_UNRESOLVED','fit.'+key+':'+id);
    }
  }

  requireBasis(fit.service_need_alignment,'service_need_alignment',['BOOK-001','SOT:services']);
  requireBasis(fit.business_trigger,'business_trigger',['BOOK-001']);
  requireBasis(fit.buyer_stakeholder_fit,'buyer_stakeholder_fit',['BOOK-001']);
  requireBasis(fit.engagement_economics,'engagement_economics',['BOOK-001']);
  requireBasis(fit.timing_urgency,'timing_urgency',['BOOK-001']);
  requireBasis(fit.expansion_potential,'expansion_potential',['BOOK-001','SOT:services']);

  if(fit.icp_company_fit.status!=='UNKNOWN'){
    requireBasis(fit.icp_company_fit,'icp_company_fit',['SOT:icp']);
    if(!fit.icp_company_fit.basis_ids.some(id=>/^E\d+$/.test(id)||/^PE-/.test(id))) {
      fail('SCORE_BASIS_COMPOSITION','icp_company_fit:PUBLIC_EVIDENCE');
    }
  }

  // Completeness provenance is presentation traceability, not authority. Normalize deterministically.
  if(completeness.critical_question_coverage.status!=='MISSING') {
    completeness.critical_question_coverage.basis_ids=[
      ...dimIds.map(id=>'DIM:'+id),
      ...qIds.map(id=>'Q:'+id)
    ];
  }
  if(completeness.source_authority.status!=='MISSING') {
    completeness.source_authority.basis_ids=peIds.length?peIds:eIds;
  }
  if(completeness.corroboration_depth.status!=='MISSING') {
    completeness.corroboration_depth.basis_ids=peIds.length?peIds:eIds;
  }
  if(completeness.freshness.status==='MISSING') {
    completeness.freshness.basis_ids=[];
  }
  if(completeness.conflict_ambiguity_control.status!=='MISSING') {
    completeness.conflict_ambiguity_control.basis_ids=[...rIds,...uIds];
  }

  for(const key of COMPLETENESS_KEYS){
    for(const id of completeness[key].basis_ids){
      if(!allowed.has(id)) fail('SCORE_BASIS_UNRESOLVED','completeness.'+key+':'+id);
    }
  }

  basis.basis_resolution={
    all_scored_basis_resolvable:true,
    unresolved_basis_ids:[]
  };
  return basis;
}
