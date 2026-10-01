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

export function validateDiscoveryV12(plan, prepare, sot){
  const errors=[]; const add=(code,path,message)=>errors.push({code,path,message});
  if(!plan||typeof plan!=='object') return {ok:false,errors:[{code:'PLAN_TYPE',path:'$',message:'Plan must be an object.'}]};
  if(plan.schema_version!=='CLARIS_DISCOVERY_INTELLIGENCE_V1_2') add('SCHEMA_VERSION','schema_version','Expected V1_2.');
  const prepIds=new Set(arr(prepare?.open_dimensions).map(d=>d?.dimension_id).filter(Boolean));
  const budgetRequired=sot?.commercial_rules?.budget_required_before_first_call===true;
  const services=arr(sot?.services), serviceIds=new Set(services.map(s=>s?.service_id).filter(Boolean));
  const auth=new Map();
  for(const [i,d] of arr(plan.authorized_dimensions).entries()){
    const p=`authorized_dimensions[${i}]`;
    if(!d?.dimension_id){add('AUTH_DIM_ID',`${p}.dimension_id`,'Missing id.');continue;}
    auth.set(d.dimension_id,d);
    if(d.authority==='PREPARE'){
      if(!prepIds.has(d.dimension_id)) add('AUTH_PREPARE_UNKNOWN',p,'PREPARE dimension absent from governed PREPARE.');
    } else if(d.authority==='CONSULTANT_POLICY'){
      if(d.dimension_id!=='P_ECONOMICS') add('POLICY_DIM_UNSUPPORTED',p,'Unsupported policy dimension.');
      if(!budgetRequired) add('POLICY_ECON_UNAUTHORIZED',p,'P_ECONOMICS requires budget policy true.');
      if(d.policy_key!=='commercial_rules.budget_required_before_first_call') add('POLICY_KEY',`${p}.policy_key`,'Incorrect budget policy key.');
    } else add('AUTHORITY_INVALID',`${p}.authority`,'Invalid authority.');
  }
  for(const id of prepIds) if(!auth.has(id)) add('PREP_DIM_MISSING','authorized_dimensions',`Missing PREPARE dimension ${id}.`);
  if(budgetRequired&&!auth.has('P_ECONOMICS')) add('POLICY_DIM_MISSING','authorized_dimensions','Budget policy requires P_ECONOMICS.');
  if(!budgetRequired&&auth.has('P_ECONOMICS')) add('POLICY_DIM_STICKY','authorized_dimensions','P_ECONOMICS present while budget policy off.');

  const econQs=[];
  for(const [i,q] of arr(plan.primary_questions).entries()){
    const p=`primary_questions[${i}]`;
    if(!auth.has(q?.dimension_id)) add('QUESTION_DIMENSION',`${p}.dimension_id`,'Unauthorized dimension.');
    if(q?.dimension_id==='P_ECONOMICS') econQs.push(q);
    if(GENERIC.test(String(q?.ask||''))) add('GENERIC_PRIMARY',`${p}.ask`,'Generic first-call question.');
    for(const [j,sp] of arr(q?.linked_service_paths).entries()) if(!serviceIds.has(sp?.service_id)) add('SERVICE_ID',`${p}.linked_service_paths[${j}].service_id`,`Unknown service id ${sp?.service_id}`);
    for(const [j,probe] of arr(q?.conditional_probes).entries()){
      const pp=`${p}.conditional_probes[${j}]`, rule=branchRules[probe?.opens_ontology_intent];
      if(rule&&!rule.test(String(probe?.trigger_if||''))) add('BRANCH_AUTHORITY',`${pp}.trigger_if`,`Trigger does not introduce ${probe?.opens_ontology_intent}`);
      if(/\b(confirms? a vulnerability|confirms? vulnerability)\b/i.test(String(probe?.what_changes||''))) add('VULNERABILITY_CONFIRMATION',`${pp}.what_changes`,'May not claim a vulnerability is confirmed.');
    }
  }
  if(budgetRequired&&econQs.length!==1) add('ECON_Q_COUNT','primary_questions','Budget policy requires exactly one economics question.');
  if(!budgetRequired&&econQs.length) add('ECON_Q_UNAUTHORIZED','primary_questions','Economics question present while budget policy off.');

  const commercialText=JSON.stringify({commercial_target:plan?.commercial_target,end_of_call_decision:plan?.end_of_call_decision});
  if(!budgetRequired){
    if(arr(plan?.commercial_target).length!==0) add('ECON_TARGET_NONEMPTY','commercial_target','commercial_target must be [] when economics is unauthorized.');
    if(ECON.test(commercialText)) add('ECON_LEAK','commercial_target/end_of_call_decision','Economics leaked while policy off.');
  } else {
    if(!ECON.test(JSON.stringify(plan?.commercial_target||[]))) add('ECON_TARGET_MISSING','commercial_target','Budget policy requires commercial target.');
    const idx=arr(plan?.call_flow).findIndex(s=>ECON.test(String(s?.move||'')));
    if(idx<0) add('BUDGET_FLOW_MISSING','call_flow','Budget step missing.');
    if(idx===0) add('BUDGET_TOO_EARLY','call_flow[0]','Budget cannot be opener.');
  }

  const stop=new Set(['service','services','readiness','advisory','managed','security','enablement','testing','fractional']);
  const tokens=new Set();
  for(const s of services) for(const raw of [s?.service_id,s?.name]) for(const t of String(raw||'').replace(/[_-]/g,' ').toLowerCase().split(/[^a-z0-9.]+/)) if(t.length>=4&&!stop.has(t)) tokens.add(t);
  const disq=arr(plan?.end_of_call_decision?.disqualify_or_deprioritize_if).join(' ').toLowerCase();
  for(const t of tokens) if(disq.includes(t)) add('CAPABILITY_AS_DISQUALIFIER','end_of_call_decision.disqualify_or_deprioritize_if',`Disqualifier references available capability term '${t}'.`);
  return {ok:errors.length===0,errors};
}
