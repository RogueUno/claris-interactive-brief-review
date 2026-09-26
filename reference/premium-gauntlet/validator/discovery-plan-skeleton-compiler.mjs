import {compileAuthorizedDimensions} from './authorized-dimensions-compiler.mjs';

const arr=v=>Array.isArray(v)?v:[];

export function compileDiscoveryPlanSkeleton(prepare,sot,catalog){
  const auth=compileAuthorizedDimensions(prepare,sot);
  if(!auth.ok) return {ok:false,errors:auth.errors};
  const intents=new Map(arr(catalog?.intents).map(i=>[`${i.intent_id} ${i.name}`,i]));
  const errors=[];
  const relevant=[];
  const slots=[];
  let q=1;
  for(const d of auth.dimensions){
    const def=intents.get(d.ontology_intent);
    if(!def){ errors.push({code:'CATALOG_INTENT_MISSING',path:d.dimension_id,message:`No catalog definition for ${d.ontology_intent}`}); continue; }
    relevant.push(def);
    const count=Math.max(1,Math.min(Number(d.max_questions||1),3));
    for(let i=0;i<count;i++) slots.push({
      question_id:`Q${q++}`,
      dimension_id:d.dimension_id,
      ontology_intent:d.ontology_intent,
      authority:d.authority,
      policy_key:d.policy_key,
      slot_index:i+1,
      slot_budget:count,
      fill_required:i===0,
      fill_only_if_materially_distinct:i>0
    });
  }
  const allowedServiceIds=arr(sot?.services).map(s=>s?.service_id).filter(Boolean);
  const authorizedIntents=new Set(auth.dimensions.map(d=>d.ontology_intent));
  const forbiddenPrimaryIntents=arr(catalog?.intents)
    .map(i=>`${i.intent_id} ${i.name}`)
    .filter(x=>!authorizedIntents.has(x));
  const economicsAuthorized=auth.dimensions.some(d=>d.ontology_intent==='D10 economics');
  return {
    ok:errors.length===0,
    schema_version:'CLARIS_DISCOVERY_PLAN_SKELETON_V1',
    authorized_dimensions:auth.dimensions,
    question_slots:slots,
    relevant_intent_definitions:relevant,
    forbidden_primary_intents:forbiddenPrimaryIntents,
    allowed_service_ids:allowedServiceIds,
    commercial_target_authorized:economicsAuthorized,
    economics_policy_required:sot?.commercial_rules?.budget_required_before_first_call===true,
    errors
  };
}
