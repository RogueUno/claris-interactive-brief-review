const arr=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value.trim():'';
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function serviceCatalog(sot={}){
  return new Map(arr(sot?.services).map(service=>[
    text(service?.service_id),
    {service_id:text(service?.service_id),name:text(service?.name)}
  ]).filter(([id,service])=>id&&service.name));
}

function hypothesisPath(path,catalog){
  const id=text(path?.service_id);
  const service=catalog.get(id);
  if(!service) return null;
  return {
    service_id:id,
    service_name:service.name,
    condition_to_confirm:text(path?.condition_to_confirm ?? path?.condition) || null,
    why_relevant_if_confirmed:text(path?.why_relevant_if_confirmed) || null,
    do_not_assume:text(path?.do_not_assume) || 'Do not treat this as a consultant-approved service mapping until the consultant delivery model explicitly confirms the fit.',
    depends_on_dimensions:arr(path?.depends_on_dimensions).map(text).filter(Boolean),
    authority:'HYPOTHESIS_ONLY',
    display_label:'Possible path if confirmed'
  };
}

function scrubRecommendedAction(action,catalog){
  const raw=text(action);
  if(!raw) return null;
  const lower=raw.toLowerCase();
  for(const service of catalog.values()){
    if(service.name && lower.includes(service.name.toLowerCase())) return null;
    if(service.service_id && lower.includes(service.service_id.toLowerCase())) return null;
  }
  return raw;
}

export function projectServiceAuthority(input={}){
  const prepare=clone(input.prepare||{});
  const discovery=clone(input.discovery||{});
  const scorecard=input.scorecard==null?null:clone(input.scorecard);
  const catalog=serviceCatalog(input.consultant_sot||{});

  const preparePaths=arr(prepare?.conditional_service_paths)
    .map(path=>hypothesisPath(path,catalog))
    .filter(Boolean);
  delete prepare.conditional_service_paths;
  prepare.possible_service_paths=preparePaths;
  prepare.service_authority={
    mode:'HYPOTHESIS_ONLY',
    reason:'Current consultant SOT confirms available service names but does not define consultant-owned service scope, boundaries or delivery shapes.'
  };

  for(const question of arr(discovery?.primary_questions)){
    const projected=arr(question?.linked_service_paths)
      .map(path=>hypothesisPath(path,catalog))
      .filter(Boolean);
    delete question.linked_service_paths;
    question.possible_service_paths=projected;
  }
  discovery.service_authority={
    mode:'HYPOTHESIS_ONLY',
    reason:'Service labels alone do not authorize consultant-specific delivery mappings.'
  };

  if(scorecard?.strategy){
    const suppressed=text(scorecard.strategy.primary_service_id);
    scorecard.strategy.primary_service_id=null;
    scorecard.strategy.recommended_action=scrubRecommendedAction(scorecard.strategy.recommended_action,catalog);
    scorecard.strategy.service_authority={
      mode:'HYPOTHESIS_ONLY',
      suppressed_primary_service_id:suppressed||null
    };
  }

  return {prepare,discovery,scorecard};
}
