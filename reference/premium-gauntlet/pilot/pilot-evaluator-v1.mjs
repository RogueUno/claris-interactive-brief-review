const num=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const bool=v=>v===true;
const arr=v=>Array.isArray(v)?v:[];

export function evaluatePilotV1(input={}){
  const errors=[];
  const required=[
    'opportunity_id','company','consultant_id',
    'claris_review_minutes','baseline_manual_prep_minutes',
    'material_facts_not_in_booking','primary_questions_total',
    'primary_questions_helpful','trust_rating','live_usability_rating',
    'would_use_next_serious_call'
  ];
  for(const key of required){
    if(input[key]===undefined||input[key]===null||input[key]==='') errors.push({code:'FIELD_REQUIRED',path:key});
  }
  if(errors.length) return {ok:false,errors};

  const baseline=Math.max(0,num(input.baseline_manual_prep_minutes));
  const review=Math.max(0,num(input.claris_review_minutes));
  const saved=Math.max(0,baseline-review);
  const qTotal=Math.max(0,num(input.primary_questions_total));
  const qHelpful=Math.max(0,num(input.primary_questions_helpful));
  const helpfulRatio=qTotal?Math.min(1,qHelpful/qTotal):0;

  const hardFailures=[];
  if(num(input.material_wrong_fact_count)>0) hardFailures.push('MATERIAL_WRONG_FACT');
  if(bool(input.unsupported_inference_changed_call)) hardFailures.push('UNSUPPORTED_INFERENCE_CHANGED_CALL');
  if(bool(input.missed_critical_question_changed_call)) hardFailures.push('MISSED_CRITICAL_DIAGNOSIS');
  if(bool(input.private_data_exposure)) hardFailures.push('PRIVATE_DATA_EXPOSURE');
  if(bool(input.consultant_policy_violation)) hardFailures.push('CONSULTANT_POLICY_VIOLATION');

  const evidence={
    prep_minutes_saved:saved,
    prep_reduction_ratio:baseline?Math.min(1,saved/baseline):0,
    material_facts_not_in_booking:Math.max(0,num(input.material_facts_not_in_booking)),
    redundant_questions_avoided:Math.max(0,num(input.redundant_questions_avoided)),
    primary_question_helpful_ratio:helpfulRatio,
    conditional_probes_triggered:Math.max(0,num(input.conditional_probes_triggered)),
    useful_branching_observed:Math.max(0,num(input.conditional_probes_helpful))>0,
    trust_rating:num(input.trust_rating),
    live_usability_rating:num(input.live_usability_rating),
    diagnostic_confidence_rating:num(input.diagnostic_confidence_rating),
    would_use_next_serious_call:bool(input.would_use_next_serious_call),
    manual_prep_replacement:textChoice(input.manual_prep_replacement,['NONE','PARTIAL','MOSTLY','FULL'])
  };

  const valueSignals=[];
  if(saved>=20) valueSignals.push('SAVED_20_PLUS_MINUTES');
  if(evidence.material_facts_not_in_booking>=2) valueSignals.push('ADDED_MATERIAL_ACCOUNT_INTELLIGENCE');
  if(evidence.redundant_questions_avoided>=2) valueSignals.push('SUPPRESSED_REDUNDANT_DISCOVERY');
  if(helpfulRatio>=0.7) valueSignals.push('MOST_PRIMARY_QUESTIONS_HELPFUL');
  if(evidence.useful_branching_observed) valueSignals.push('LIVE_BRANCHING_HELPED');
  if(evidence.trust_rating>=4) valueSignals.push('HIGH_TRUST');
  if(evidence.live_usability_rating>=4) valueSignals.push('HIGH_LIVE_USABILITY');
  if(evidence.would_use_next_serious_call) valueSignals.push('WOULD_REUSE');

  const paidPilotCandidate=
    hardFailures.length===0 &&
    evidence.would_use_next_serious_call &&
    evidence.trust_rating>=4 &&
    evidence.live_usability_rating>=4 &&
    helpfulRatio>=0.7 &&
    saved>=20 &&
    evidence.material_facts_not_in_booking>=2;

  const fourFigureEvidenceStrong=
    paidPilotCandidate &&
    ['MOSTLY','FULL'].includes(evidence.manual_prep_replacement) &&
    valueSignals.length>=6;

  return {
    ok:true,
    schema_version:'CLARIS_PILOT_EVALUATION_V1',
    opportunity_id:String(input.opportunity_id),
    company:String(input.company),
    consultant_id:String(input.consultant_id),
    hard_failures:hardFailures,
    evidence,
    value_signals:valueSignals,
    decision:{
      safe_to_continue_pilot:hardFailures.length===0,
      paid_pilot_candidate:paidPilotCandidate,
      four_figure_value_evidence_strong:fourFigureEvidenceStrong
    },
    qualitative:{
      strongest_value:arr(input.strongest_value).map(String),
      missing_or_weak:arr(input.missing_or_weak).map(String),
      consultant_quote:String(input.consultant_quote||'').trim()||null,
      call_outcome:String(input.call_outcome||'').trim()||null
    }
  };
}

function textChoice(value,allowed){
  const v=String(value||'').toUpperCase();
  return allowed.includes(v)?v:null;
}
