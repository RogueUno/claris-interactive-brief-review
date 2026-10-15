// Read-only structural audit of FINALIZE's internal evidence-completeness score.
// DOES NOT revise a provider score, certify external facts or authorize delivery.
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const arr=x=>Array.isArray(x)?x:[];
const val=x=>typeof x==='number'&&Number.isFinite(x)?x:typeof x==='string'&&x.trim()!==''?Number(x):NaN;
const spec=[
  ['critical_question_coverage',35],
  ['source_authority',25],
  ['corroboration_depth',15],
  ['freshness',15],
  ['conflict_ambiguity_control',10]
];
const fraction={COMPLETE:1,PARTIAL:.6,WEAK:.25,MISSING:0};
const hasOpenBuyerRequirement=review=>review?.buyer_deliverable_fork?.open===true;
export function reviewEvidenceScore(finalOutput,{evidenceRegistry=[],acceptedManifest=null,commercialReview=null}={}){
  const raw=obj(finalOutput);
  const dimensions=obj(Object.keys(obj(raw.completeness_classifications)).length
    ?raw.completeness_classifications:raw.completeness_score_explanation);
  const metrics=obj(Object.keys(obj(raw.deterministic_metrics)).length
    ?raw.deterministic_metrics:raw.engagement_metadata?.deterministic_metrics);
  const providerScore=val(metrics.evidence_completeness);
  const warnings=[];
  const warn=(code,category,explanation,ids=[])=>warnings.push({code,category,explanation,basis_ids:ids});
  const index=new Map(arr(evidenceRegistry).filter(x=>typeof x.evidence_id==='string').map(x=>[x.evidence_id,x]));
  const accepted=new Set(arr(acceptedManifest?.entries).map(x=>x.evidence_id));
  let expectedSum=0,validStatus=true;
  const breakdown=spec.map(([key,weight])=>{
    const data=obj(dimensions[key]),status=String(data.status||'');
    const basis=arr(data.basis_ids).filter(x=>typeof x==='string');
    const correct=Object.hasOwn(fraction,status);
    validStatus&&=correct;
    const expected=correct?weight*fraction[status]:null;
    if(expected!=null)expectedSum+=expected;
    const reported=Number.isFinite(val(data.score))?val(data.score):null;
    if(!correct)warn('INVALID_COMPLETENESS_STATUS',key,'Completeness category has a missing or unrecognized status.',basis);
    if(reported!=null&&expected!=null&&Math.abs(reported-expected)>0.001)
      warn('DIMENSION_POINTS_MISMATCH',key,'Provider-explained points disagree with frozen Make category weights.',basis);
    for(const id of basis){
      if(id==='BOOK-001')continue;
      if(/^PROS-\d{3}(?:-[A-Z])?$/.test(id)){
        const family=id.match(/^PROS-\d{3}/)?.[0];
        if(acceptedManifest?.ok!==true||!accepted.has(family))
          warn('PROSPECT_BASIS_UNBOUND',key,'Prospect claim lacks a corresponding persisted accepted answer.',[id]);
        else if(id!==family)
          warn('PROSPECT_SUBCLAIM_NOT_INDEPENDENT',key,'This reconciled prospect subclaim derives from an accepted answer; it is not separate source corroboration.',[id]);
        continue;
      }
      const record=index.get(id);
      if(!record||record.admission_status!=='ADMITTED'||record.sensitivity!=='STANDARD')
        warn('FAC_BASIS_NOT_ADMISSIBLE',key,'FAC basis is absent, rejected, or restricted under the public-evidence boundary.',[id]);
      else if(typeof record.source_url!=='string'||!/^https:\/\/[a-z0-9]/i.test(record.source_url))
        warn('FAC_BASIS_NO_SAFE_SOURCE_LINK',key,'Admitted FAC has no safe original HTTPS citation.',[id]);
    }
    return {key,status:correct?status:'INVALID',max_points:weight,
      expected_points:expected,provider_explained_points:reported,basis_ids:basis};
  });
  if(!Number.isFinite(providerScore)||providerScore<0||providerScore>100)
    warn('PROVIDER_SCORE_INVALID','overall','Internal evidence score is absent or outside 0–100.');
  else if(!validStatus||Math.abs(expectedSum-providerScore)>0.001)
    warn('PROVIDER_SCORE_SUM_MISMATCH','overall','The internal score does not agree with category-weight arithmetic.');
  const byKey=Object.fromEntries(breakdown.map(x=>[x.key,x]));
  const fork=hasOpenBuyerRequirement(commercialReview);
  if(fork&&byKey.critical_question_coverage?.status==='COMPLETE')
    warn('FULL_CRITICAL_COVERAGE_WITH_OPEN_BUYER_DECISION','critical_question_coverage',
      '35/35 was granted although the buyer-required assurance deliverable remains unresolved. Full coverage needs human adjudication.',
      ['BOOK-001']);
  if(fork&&byKey.conflict_ambiguity_control?.status==='COMPLETE')
    warn('FULL_AMBIGUITY_CONTROL_WITH_OPEN_DECISION','conflict_ambiguity_control',
      'Absence of contradictory evidence does not establish that the remaining material buyer ambiguity is resolved.',
      ['BOOK-001']);
  if(byKey.freshness?.status==='COMPLETE'&&
      byKey.freshness.basis_ids.length>0&&byKey.freshness.basis_ids.every(id=>id==='BOOK-001'))
    warn('FRESHNESS_IS_BOOKING_RECENCY_ONLY','freshness',
      'Full freshness points rely solely on booking recency, not independently dated external sources.',
      ['BOOK-001']);
  if(providerScore===100&&warnings.length)
    warn('PERFECT_SCORE_NOT_INDEPENDENTLY_SUPPORTED','overall',
      'The 100/100 is the frozen provider/scorer output, not an independently established evidence-quality grade.');
  const unique=[...new Map(warnings.map(w=>[w.code+':'+w.category+':'+w.basis_ids.join(','),w])).values()];
  const hardErrors=unique.filter(w=>['INVALID_COMPLETENESS_STATUS','DIMENSION_POINTS_MISMATCH',
    'PROVIDER_SCORE_INVALID','PROVIDER_SCORE_SUM_MISMATCH','PROSPECT_BASIS_UNBOUND',
    'FAC_BASIS_NOT_ADMISSIBLE'].includes(w.code));
  return {
    schema_version:'claris_v5_evidence_score_review_v1',
    provider_score:Number.isFinite(providerScore)?providerScore:null,
    provider_score_preserved:true,
    independent_quality_score:null,
    independent_grade:null,
    assurance:hardErrors.length?'INTEGRITY_REVIEW_REQUIRED':
      unique.length?'SEMANTIC_REVIEW_REQUIRED':'STRUCTURAL_CHECK_ONLY',
    mathematically_consistent:!unique.some(w=>['INVALID_COMPLETENESS_STATUS',
      'DIMENSION_POINTS_MISMATCH','PROVIDER_SCORE_INVALID','PROVIDER_SCORE_SUM_MISMATCH'].includes(w.code)),
    scoring_dimensions:breakdown,
    warnings:unique,
    review_required:unique.length>0,
    source_provenance_limit:'PROS subclaim IDs from one accepted answer are not independent corroboration; reconciliation claim wording was not externally certified.',
    no_provider_reexecution:true,
    commercial_certification:false,
    note:'Read-only non-AI structural and semantic-risk screen. No arbitrary rescore, no delivery authorization.'
  };
}
