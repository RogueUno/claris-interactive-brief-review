const KIND_TO_ONTOLOGY={
  SUBJECT_SCOPE:'D02 technical_or_service_scope',
  DESIRED_OUTCOME:'D06 desired_outcome',
  BUSINESS_TRIGGER_DETAIL:'D01 conversation_reason',
  TIMING:'D11 timing_trigger',
  AUTHORITY:'D09 ownership_stakeholders',
  ECONOMICS:'D10 economics'
};
const ONTOLOGY=new Set([
  'D01 conversation_reason','D02 technical_or_service_scope','D03 current_state','D04 problem_or_gap','D05 implication',
  'D06 desired_outcome','D07 prior_attempts','D08 constraints_dependencies','D09 ownership_stakeholders','D10 economics',
  'D11 timing_trigger','D12 decision_process','D13 assurance_requirements','D14 delivery_fit','D15 next_move'
]);
const arr=v=>Array.isArray(v)?v:[];

export function compileAuthorizedDimensions(prepare,sot={}){
  const errors=[]; const dimensions=[]; const seen=new Set();
  const addError=(code,path,message)=>errors.push({code,path,message});
  for(const [i,d] of arr(prepare?.open_dimensions).entries()){
    const p=`open_dimensions[${i}]`;
    if(!d?.dimension_id){addError('DIMENSION_ID',p,'Missing dimension_id.');continue;}
    if(seen.has(d.dimension_id)){addError('DUPLICATE_DIMENSION',p,`Duplicate ${d.dimension_id}.`);continue;}
    seen.add(d.dimension_id);
    let ontology=KIND_TO_ONTOLOGY[d.dimension_kind];
    if(d.dimension_kind==='CONSULTANT_POLICY_REQUIRED'){
      addError('PREPARE_POLICY_KIND',p,'Consultant policy dimensions must be compiled from SOT, not PREPARE.');
      continue;
    }
    if(d.dimension_kind==='OTHER_EXPLICIT') ontology=d.ontology_intent;
    if(!ontology||!ONTOLOGY.has(ontology)){
      addError('ONTOLOGY_MAP',p,`No deterministic ontology mapping for ${d.dimension_kind}.`);
      continue;
    }
    dimensions.push({
      dimension_id:d.dimension_id,
      ontology_intent:ontology,
      authority:'PREPARE',
      policy_key:null,
      source_authority:d.authority,
      authority_quote:d.authority_quote??null,
      reason:d.why_open||'',
      max_questions:Number(d.max_questions??1)
    });
  }

  if(sot?.commercial_rules?.budget_required_before_first_call===true){
    if(seen.has('P_ECONOMICS')) addError('POLICY_ID_COLLISION','consultant_sot','P_ECONOMICS collides with PREPARE dimension id.');
    else dimensions.push({
      dimension_id:'P_ECONOMICS',
      ontology_intent:'D10 economics',
      authority:'CONSULTANT_POLICY',
      policy_key:'commercial_rules.budget_required_before_first_call',
      source_authority:'CONSULTANT_POLICY',
      authority_quote:null,
      reason:'Consultant policy requires direct budget evidence before advancing from the first call.',
      max_questions:1
    });
  }
  return {ok:errors.length===0,dimensions,errors};
}
