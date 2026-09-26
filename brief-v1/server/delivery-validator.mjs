const arr=v=>Array.isArray(v)?v:[];
const ECON=/\b(budget|pricing|price|commercial floor|minimum engagement|minimum viable engagement|ability to pay|spend|allocated funds?)\b/i;
const GENERIC=/\b(tell me about your company|what keeps you up at night|who is the decision maker|what is your budget|what is your timeline|why now)\b/i;
const branchRules={
  'D10 economics':/(budget|price|pricing|cost|spend|funds?|allocated|commercial)/i,
  'D11 timing_trigger':/(deadline|timeline|date|launch|renewal|quarter|month|week|ship|rollout|before)/i,
  'D13 assurance_requirements':/(customer|buyer|questionnaire|security review|assurance|evidence|audit|compliance|trust center|procurement)/i,
  'D09 ownership_stakeholders':/(owner|ownership|stakeholder|decision[- ]?maker|approver|responsible team|security team|engineering team)/i,
  'D05 implication':/(problem|gap|issue|friction|challenge|vulnerab|incident|breach|blocked|delay|slow|impact|time|hours|deal|revenue|cost)/i,
  'D04 problem_or_gap':/(problem|gap|issue|friction|challenge|vulnerab|incident|breach|uncertain|concern|cross-tenant|over-broad|unauthoriz|unexpected access)/i
};

export function validateBriefForDelivery(payload, context={}){
  const errors=[]; const add=(code,path,message)=>errors.push({code,path,message});
  const prepare=payload?.prepare, discovery=payload?.discovery;
  if(prepare?.schema_version!=='CLARIS_PREMIUM_PREPARE_V3_6') add('PREPARE_SCHEMA','prepare.schema_version','Expected V3.6.');
  if(discovery?.schema_version!=='CLARIS_DISCOVERY_INTELLIGENCE_V1_2') add('DISCOVERY_SCHEMA','discovery.schema_version','Expected V1.2.');
  if(errors.length) return {ok:false,errors};

  const prepIds=new Set(arr(prepare.open_dimensions).map(d=>d?.dimension_id).filter(Boolean));
  if(!prepIds.size) add('PREP_DIMENSIONS','prepare.open_dimensions','At least one governed dimension required.');
  const services=arr(context?.services);
  const serviceIds=new Set(services.map(s=>s?.service_id).filter(Boolean));
  if(!serviceIds.size) add('VALIDATION_SERVICES','validation_context.services','Allowed services required.');
  const budgetRequired=context?.commercial_rules?.budget_required_before_first_call===true;
  const auth=new Map();

  for(const [i,d] of arr(discovery.authorized_dimensions).entries()){
    const p=`discovery.authorized_dimensions[${i}]`;
    if(!d?.dimension_id){ add('AUTH_DIM_ID',p,'Missing dimension id.'); continue; }
    auth.set(d.dimension_id,d);
    if(d.authority==='PREPARE'){
      if(!prepIds.has(d.dimension_id)) add('AUTH_PREPARE_UNKNOWN',p,'Dimension absent from governed PREPARE.');
    }else if(d.authority==='CONSULTANT_POLICY'){
      if(d.dimension_id!=='P_ECONOMICS'||!budgetRequired||d.policy_key!=='commercial_rules.budget_required_before_first_call') add('POLICY_DIM_INVALID',p,'Unauthorized consultant-policy dimension.');
    }else add('AUTHORITY_INVALID',`${p}.authority`,'Only PREPARE or CONSULTANT_POLICY is allowed at delivery.');
  }
  for(const id of prepIds) if(!auth.has(id)) add('PREP_DIM_MISSING','discovery.authorized_dimensions',`Missing PREPARE dimension ${id}.`);
  if(budgetRequired&&!auth.has('P_ECONOMICS')) add('POLICY_DIM_MISSING','discovery.authorized_dimensions','Budget policy requires P_ECONOMICS.');
  if(!budgetRequired&&auth.has('P_ECONOMICS')) add('POLICY_DIM_STICKY','discovery.authorized_dimensions','Economics dimension present while policy off.');

  const questions=arr(discovery.primary_questions);
  if(!questions.length||questions.length>6) add('QUESTION_COUNT','discovery.primary_questions','Expected 1-6 primary questions.');
  const counts=new Map();
  for(const [i,q] of questions.entries()){
    const p=`discovery.primary_questions[${i}]`;
    if(!auth.has(q?.dimension_id)) add('QUESTION_DIMENSION',`${p}.dimension_id`,'Question references unauthorized dimension.');
    counts.set(q?.dimension_id,(counts.get(q?.dimension_id)||0)+1);
    if(GENERIC.test(String(q?.ask||''))) add('GENERIC_PRIMARY',`${p}.ask`,'Generic first-call question.');
    for(const [j,sp] of arr(q?.linked_service_paths).entries()) if(!serviceIds.has(sp?.service_id)) add('SERVICE_ID',`${p}.linked_service_paths[${j}].service_id`,`Unknown service ${sp?.service_id}.`);
    for(const [j,probe] of arr(q?.conditional_probes).entries()){
      const pp=`${p}.conditional_probes[${j}]`, rule=branchRules[probe?.opens_ontology_intent];
      if(rule&&!rule.test(String(probe?.trigger_if||''))) add('BRANCH_AUTHORITY',`${pp}.trigger_if`,`Trigger does not introduce ${probe?.opens_ontology_intent}.`);
    }
  }
  for(const d of arr(prepare.open_dimensions)){
    const max=Math.max(1,Number(d?.max_questions??1));
    const n=counts.get(d?.dimension_id)||0;
    if(n<1) add('QUESTION_REQUIRED','discovery.primary_questions',`No primary question resolves ${d?.dimension_id}.`);
    if(n>max) add('QUESTION_BUDGET','discovery.primary_questions',`Question budget exceeded for ${d?.dimension_id}.`);
  }
  const econCount=counts.get('P_ECONOMICS')||0;
  if(budgetRequired&&econCount!==1) add('ECON_Q_COUNT','discovery.primary_questions','Budget policy requires exactly one economics question.');
  if(!budgetRequired&&econCount) add('ECON_Q_UNAUTHORIZED','discovery.primary_questions','Economics question present while policy off.');

  const commercialText=JSON.stringify({commercial_target:discovery?.commercial_target,end_of_call_decision:discovery?.end_of_call_decision});
  if(!budgetRequired){
    if(arr(discovery?.commercial_target).length!==0) add('ECON_TARGET_NONEMPTY','discovery.commercial_target','commercial_target must be [] while economics is unauthorized.');
    if(ECON.test(commercialText)) add('ECON_LEAK','discovery.commercial_target/end_of_call_decision','Economics leaked while policy off.');
  }

  const stop=new Set(['service','services','readiness','advisory','managed','security','enablement','testing','fractional']);
  const tokens=new Set();
  for(const s of services) for(const raw of [s?.service_id,s?.name]) for(const t of String(raw||'').replace(/[_-]/g,' ').toLowerCase().split(/[^a-z0-9.]+/)) if(t.length>=4&&!stop.has(t)) tokens.add(t);
  const disq=arr(discovery?.end_of_call_decision?.disqualify_or_deprioritize_if).join(' ').toLowerCase();
  for(const t of tokens) if(disq.includes(t)) add('CAPABILITY_AS_DISQUALIFIER','discovery.end_of_call_decision.disqualify_or_deprioritize_if',`Disqualifier references available capability term '${t}'.`);

  return {ok:errors.length===0,errors};
}
