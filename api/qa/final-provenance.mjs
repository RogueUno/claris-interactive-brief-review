// TEMPORARY candidate-only native provenance self-test. Remove after certification.
// Uses in-memory repositories only: no Blob, Make, provider, or email side effects.
import { createClarificationRepository } from '../../clarification-v1/server/repository.mjs';
import { createClarificationService } from '../../clarification-v1/server/service.mjs';
import { buildFinalizeContext, buildFinalizeBundle } from '../../clarification-v1/server/finalize-handoff.mjs';
import { renderFinalBrief } from '../../clarification-v1/server/final-brief-renderer.mjs';
import { claimFinalDelivery } from '../../clarification-v1/server/final-delivery-receipt.mjs';

const consultantId='consultant_provenance_qa',ownerEmail='qa@example.invalid';
const sot={consultant:{consultant_name:'QA Consultant',firm:'CLARIS QA'},services:[]};
const audit={audit_status:'PASS',violations:[],repair_required:false};
const valid={opportunity_id:'opportunity_provenance_qa',status:'FINALIZED',final_audit_json:JSON.stringify(audit)};
function fixture(){
 const map=new Map();let rev=0;
 const storage={
  async getJson(path){return map.has(path)?structuredClone(map.get(path).value):null},
  async getJsonWithMeta(path){const x=map.get(path);return x?{value:structuredClone(x.value),etag:x.etag}:{value:null,etag:null}},
  async putJson(path,value,{ifMatch=null}={}){const cur=map.get(path);if(ifMatch&&(!cur||cur.etag!==ifMatch)){const e=Error('BLOB_PRECONDITION_FAILED');e.code='BLOB_PRECONDITION_FAILED';throw e}const etag='e-'+(++rev);map.set(path,{value:structuredClone(value),etag});return{etag}}
 };
 const repository=createClarificationRepository(storage);
 const service=createClarificationService({repository,sessionSecret:'candidate-provenance-self-test-secret-32-bytes'});
 const consultantRepository={
  async loadIdentity(){return{consultant_id:consultantId,delivery_email:ownerEmail}},
  async loadProfileEnvelopeWithMeta(){return{etag:'profile-etag',envelope:{consultant_id:consultantId,lifecycle_record:{consultant_id:consultantId,status:'LOCKED',runtime_v3:{status:'READY',consultant_sot_json:sot,report:{errors:[],warnings:[]}}}}}}
 };
 return{repository,service,consultantRepository};
}
function pkg(){return{opportunity_id:valid.opportunity_id,consultant:{consultant_id:consultantId,first_name:'QA',firm:'CLARIS QA'},prospect:{first_name:'Synthetic',company:'Example',role:'Engineering'},questions:[{question_id:'q_budget',mode:'DISCOVER',prompt:'Do you have an authorized security budget?',response_type:'SINGLE_CHOICE',options:[{option_id:'yes',label:'Yes',posture:'GENERIC_SAFE',basis_ids:[]},{option_id:'no',label:'No',posture:'GENERIC_SAFE',basis_ids:[]}],allow_other:true,allow_unsure:true,required:true,evidence_refs:[]}]}}
async function prepared(){
 const f=fixture();
 const context=buildFinalizeContext({case_state_json:JSON.stringify({truth:'frozen'}),consultant_sot_json:JSON.stringify(sot),consultant_id:consultantId,consultant_delivery_email:ownerEmail},{now:1000});
 const created=await f.service.createPackage(pkg(),{now:1000,ttlMs:360000,finalizeContext:context});
 const opened=await f.service.resolveInvite(created.invite_token,{now:1100});
 const submitted=await f.service.submit(opened.session_token,[{question_id:'q_budget',value:'yes'}],{now:1200,expectedVersion:opened.opportunity_version});
 if(!submitted.ok)throw Error('QA_SUBMIT_FAILED');
 return f;
}
function artifact({lineage=true}={}){
 const evidence=[{evidence_id:'BOOK-001',authority:'BOOKING_TEXT',statement:'Company website: https://example.com'},...(lineage?[{evidence_id:'PROS-001',authority:'PROSPECT_REPORTED',statement:'Prospect confirmed budget readiness.'}]:[])];
 return{brief_metadata:{consultant_name:'QA Consultant',firm_name:'CLARIS QA',prospect_company:'Example'},match_score_summary:{overall_match_score:15,scorable_coverage:30,evaluated_fit_rate:50,evidence_completeness:62.5},canonical_alignment:{service_need_alignment:{status:'PARTIAL_MATCH',basis_ids:lineage?['PROS-001']:['BOOK-001'],reason:lineage?'Prospect-reported evidence supports discovery.':'Booking evidence supports discovery.'},business_trigger:{status:'UNKNOWN',basis_ids:[],reason:'No trigger established.'}},client_intel:{company_profile:{name:'Example',domain:'https://example.com'}},strategic_intelligence:{stated_need:{primary_requirement:'Security advisory',evidence_id:lineage?'PROS-001':'BOOK-001'},potential_service_relevance:[{service_id:'V_CISO',name:'vCISO'}],strategic_recommendations:['Conduct discovery.'],risk_factors:['Unknown urgency']},intelligence_lineage:{admissible_evidence:evidence}};
}
async function strictInput(f,{lineage=true,patch={}}={}){
 const loaded=await f.repository.loadEnvelopeWithMeta(valid.opportunity_id),bundle=buildFinalizeBundle(loaded.envelope,loaded.etag),stage=artifact({lineage}),rendered=renderFinalBrief(stage);
 return{...valid,final_stage:'FINALIZE',opportunity_version:bundle.opportunity_version,finalize_provenance_digest:bundle.finalize_provenance_digest,final_stage_output_json:JSON.stringify(stage),final_case_state_json:JSON.stringify(stage),final_brief_markdown:rendered.brief_markdown,...patch};
}
async function runCase(name,mutate){
 const f=await prepared();let input=await strictInput(f);if(mutate)input=await mutate(input,f);
 const out=await claimFinalDelivery(input,{repository:f.repository,consultantRepository:f.consultantRepository,requireFinalProvenance:true});
 return{name,status:out.status,error:out.error||null,ok:out.ok===true};
}
function authorized(request){const key=String(process.env.CLARIS_ADMIN_KEY||'').trim(),auth=String(request.headers.get('authorization')||'').trim();return !!key&&(auth===key||auth===`Bearer ${key}`||auth.split(/\s+/).at(-1)===key)}
export default{async fetch(request){
 if(request.method!=='POST')return new Response(JSON.stringify({ok:false,error:'METHOD_NOT_ALLOWED'}),{status:405,headers:{'content-type':'application/json'}});
 if(!authorized(request))return new Response(JSON.stringify({ok:false,error:'ADMIN_UNAUTHORIZED'}),{status:401,headers:{'content-type':'application/json'}});
 const results=[];
 results.push(await runCase('valid'));
 results.push(await runCase('stale_version',async x=>({...x,opportunity_version:'stale-etag'})));
 results.push(await runCase('wrong_digest',async x=>({...x,finalize_provenance_digest:'0'.repeat(64)})));
 results.push(await runCase('wrong_stage',async x=>({...x,final_stage:'PREPARE'})));
 results.push(await runCase('state_mismatch',async x=>({...x,final_case_state_json:JSON.stringify({...JSON.parse(x.final_case_state_json),tampered:true})})));
 results.push(await runCase('render_mismatch',async x=>({...x,final_brief_markdown:'# Different brief'})));
 {const f=await prepared();const x=await strictInput(f,{lineage:false});const out=await claimFinalDelivery(x,{repository:f.repository,consultantRepository:f.consultantRepository,requireFinalProvenance:true});results.push({name:'missing_prospect_lineage',status:out.status,error:out.error||null,ok:out.ok===true})}
 const expected={valid:['CLAIMED',null],stale_version:['BLOCKED','FINAL_DELIVERY_PROVENANCE_MISMATCH'],wrong_digest:['BLOCKED','FINAL_DELIVERY_PROVENANCE_MISMATCH'],wrong_stage:['BLOCKED','FINAL_DELIVERY_STAGE_INVALID'],state_mismatch:['BLOCKED','FINAL_DELIVERY_FINAL_STATE_MISMATCH'],render_mismatch:['BLOCKED','FINAL_DELIVERY_RENDER_MISMATCH'],missing_prospect_lineage:['BLOCKED','FINAL_DELIVERY_PROSPECT_LINEAGE_MISSING']};
 const pass=results.every(r=>r.status===expected[r.name][0]&&r.error===expected[r.name][1]);
 return new Response(JSON.stringify({ok:pass,runtime:'native-node',side_effects:'memory-only',results}),{status:pass?200:500,headers:{'content-type':'application/json'}});
}};