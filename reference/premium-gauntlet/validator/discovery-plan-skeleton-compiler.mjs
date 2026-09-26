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
  const catalogIntents=arr(catalog?.intents);
  const forbiddenPrimaryIntents=catalogIntents
    .map(i=>`${i.intent_id} ${i.name}`)
    .filter(x=>!authorizedIntents.has(x));
  const ontologyCoverage=catalogIntents.map(i=>{
    const ontologyIntent=`${i.intent_id} ${i.name}`;
    const authorized=auth.dimensions.filter(d=>d.ontology_intent===ontologyIntent);
    return {
      intent_id:i.intent_id,
      name:i.name,
      ontology_intent:ontologyIntent,
      status:authorized.length?'PRIMARY_AUTHORIZED':'DEFERRED_NOT_AUTHORIZED',
      authorized_dimensions:authorized.map(d=>d.dimension_id),
      authorities:authorized.map(d=>d.authority),
      objective:i.objective,
      suppress_if:arr(i.suppress_if),
      conditional_authority:i.conditional_authority||null,
      may_unlock:arr(i.may_unlock)
    };
  });
  const catalogIds=ontologyCoverage.map(x=>x.intent_id);
  if(new Set(catalogIds).size!==catalogIds.length) errors.push({code:'CATALOG_DUPLICATE_INTENT',path:'catalog.intents',message:'Discovery intent ids must be unique.'});
  const economicsAuthorized=auth.dimensions.some(d=>d.ontology_intent==='D10 economics');
  return {
    ok:errors.length===0,
    schema_version:'CLARIS_DISCOVERY_PLAN_SKELETON_V1',
    authorized_dimensions:auth.dimensions,
    question_slots:slots,
    relevant_intent_definitions:relevant,
    forbidden_primary_intents:forbiddenPrimaryIntents,
    ontology_coverage:ontologyCoverage,
    coverage_summary:{
      catalog_intent_count:ontologyCoverage.length,
      primary_authorized_count:ontologyCoverage.filter(x=>x.status==='PRIMARY_AUTHORIZED').length,
      deferred_not_authorized_count:ontologyCoverage.filter(x=>x.status==='DEFERRED_NOT_AUTHORIZED').length,
      unaccounted_count:0
    },
    allowed_service_ids:allowedServiceIds,
    commercial_target_authorized:economicsAuthorized,
    economics_policy_required:sot?.commercial_rules?.budget_required_before_first_call===true,
    errors
  };
}
