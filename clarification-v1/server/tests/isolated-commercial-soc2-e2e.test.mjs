import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClarificationRepository} from '../repository.mjs';
import {createClarificationService} from '../service.mjs';
import {buildFinalizeContext,buildFinalizeBundle} from '../finalize-handoff.mjs';
import {verifyLockedDeliveryOwner} from '../verify-locked-delivery-owner.mjs';
import {deriveAcceptedProspectManifest} from '../accepted-prospect-evidence.mjs';
import {renderFinalBrief} from '../final-brief-renderer.mjs';
import {inspectPersistedFinalSources} from '../final-snapshot-source-preflight.mjs';
import {inspectLiveFinalCandidate} from '../final-snapshot-candidate-preflight.mjs';
import {persistGovernedFinalSnapshot} from '../final-snapshot-persistence.mjs';
import {previewPersistedOpportunityDiscovery} from '../admin-discovery-preview.mjs';

// Commercial content, fictional identities. No actual customer, domain,
// email provider, Make execution, secret or network call. This test creates
// and mutates ONLY ephemeral memory, never the live Vercel Blob repository.
const ID='isolated_commercial_soc2_20261012';
const CONSULTANT_ID='northstar_advisory_fixture';
const EMAIL='morgan@northstar.example';
const BOOKING='We want SOC 2 readiness guidance before an enterprise customer security assessment. Please help us define assessment scope, existing evidence priorities, and an appropriate first step. The required date and available budget have not been established.';
const TIME=Date.parse('2026-10-12T09:00:00.000Z');
const SOT={
  sot_version:'ISOLATED_COMMERCIAL_REHEARSAL_V1',
  consultant:{consultant_name:'Morgan Lee',firm:'Northstar Risk Advisory'},
  services:[{service_id:'SVC_SOC2',status:'ACTIVE'}],
  commercial_rules:{budget_required_before_first_call:true}
};
const FINAL_FIXTURE=JSON.parse(readFileSync(new URL('./fixtures/fictional-soc2-advisory-final.json',import.meta.url),'utf8'));

function choice(id,prompt,options){
 return {
  question_id:id,mode:'DISCOVER',prompt,response_type:'SINGLE_CHOICE',
  options:options.map(([option_id,label])=>({
   option_id,label,posture:'GENERIC_SAFE',basis_ids:[]
  })),
  allow_other:true,allow_unsure:true,required:true,evidence_refs:[]
 };
}
function packageInput(){
 return {
  opportunity_id:ID,
  consultant:{consultant_id:CONSULTANT_ID,first_name:'Morgan',firm:'Northstar Risk Advisory'},
  prospect:{first_name:'Robin',role:'Head of Operations',company:'Harborlane Cloud (fictional)'},
  intro_context:'Buyer requests an initial SOC 2 readiness scoping discussion.',
  questions:[
   choice('q_service','Which advisory service are you interested in exploring?',[
    ['soc2','SOC 2 Readiness'],['iso','ISO 27001 Preparation'],['other','Security advisory']]),
   choice('q_timing','What timing is currently confirmed for the request?',[
    ['unspecified','Customer assessment planned; date not confirmed'],
    ['date','A required date is confirmed']]),
   choice('q_budget','What is the status of a potential advisory budget?',[
    ['approved','Budget approved'],['not_approved','Not approved yet']])
  ]
 };
}
function acceptedAnswers(){
 return [
  {question_id:'q_service',value:'soc2'},
  {question_id:'q_timing',value:'unspecified'},
  {question_id:'q_budget',value:{kind:'UNSURE'}}
 ];
}
function profileRepository(){
 return {
  async loadIdentity(id){
   assert.equal(id,CONSULTANT_ID);
   return {consultant_id:id,delivery_email:EMAIL};
  },
  async loadProfileEnvelopeWithMeta(id){
   assert.equal(id,CONSULTANT_ID);
   return {
    etag:'locked-profile-test',
    envelope:{
     consultant_id:id,
     lifecycle_record:{
      consultant_id:id,status:'LOCKED',
      runtime_v3:{status:'READY',consultant_sot_json:SOT,
       report:{errors:[],warnings:[],adapter_version:'offline'}}
     }
    }
   };
  }
 };
}
function inMemoryRepository(){
 const data=new Map(),events=[];
 let version=0;
 const clone=x=>structuredClone(x);
 const storage={
  async getJson(path){return data.has(path)?clone(data.get(path).value):null;},
  async getJsonWithMeta(path){
   const entry=data.get(path);
   return entry?{value:clone(entry.value),etag:entry.etag}:{value:null,etag:null};
  },
  async putJsonIfAbsent(path,value){
   if(data.has(path)){
    const e=new Error('BLOB_ALREADY_EXISTS');e.code='BLOB_ALREADY_EXISTS';throw e;
   }
   const etag='etag-'+(++version);
   data.set(path,{value:clone(value),etag});
   events.push({type:'atomic_create',path});
   return {etag};
  },
  async putJson(path,value,{ifMatch=null}={}){
   const current=data.get(path);
   if(ifMatch && current?.etag!==ifMatch){
    const e=new Error('BLOB_PRECONDITION_FAILED');e.code='BLOB_PRECONDITION_FAILED';throw e;
   }
   const etag='etag-'+(++version);
   data.set(path,{value:clone(value),etag});
   events.push({type:'memory_update',path});
   return {etag};
  }
 };
 const repository=createClarificationRepository(storage,{requireAtomicCreate:true});
 const service=createClarificationService({
  repository,sessionSecret:'this-is-only-an-ephemeral-secret-not-a-real-key'
 });
 return {repository,service,events,data};
}
function finalizeCandidate(){
 const a=structuredClone(FINAL_FIXTURE);
 // Additional claim sourced to the exact accepted q_service option. Other
 // accepted answers remain unknowns, not inferred timing or budget signals.
 a.claris_final_brief.intelligence_lineage.push({
  source_id:'PROS-001',authority:'PROSPECT_REPORTED',
  usage:'The prospect expressed interest in SOC 2 Readiness.'
 });
 a.claris_final_brief.brief_metadata.report_status='QUALIFIED_FOR_DISCOVERY';
 // Avoid conflating early advisory fit with verified budget or authority.
 return {
  opportunity_id:ID,status:'FINALIZED',final_stage:'FINALIZE',
  final_stage_output_json:JSON.stringify(a),
  final_brief_markdown:renderFinalBrief(a).brief_markdown,
  // A test-only attestation, NOT the provider's governed FINALIZE audit.
  final_audit_json:JSON.stringify({
   audit_status:'PASS',repair_required:false,violations:[],
   summary:'FICTIONAL_TEST_ATTESTATION_NOT_AN_INDEPENDENT_PROVIDER_AUDIT'
  })
 };
}
async function createAndSubmit(){
 const db=inMemoryRepository();
 const context=buildFinalizeContext({
  case_state_json:JSON.stringify({
   booking_text_exact:BOOKING,
   canonical_truth_json:JSON.stringify({
    booking_evidence:[{
     evidence_id:'BOOK-001',authority:'BOOKING_TEXT',
     statement:BOOKING,exact_basis:BOOKING,resolvable:true
    }],
    canonical_evidence_registry:[]
   })
  }),
  consultant_sot_json:JSON.stringify(SOT),
  consultant:{consultant_id:CONSULTANT_ID,firm:'Northstar Risk Advisory'},
  consultant_delivery_email:EMAIL
 },{now:TIME});
 const verified=await verifyLockedDeliveryOwner(context,{repository:profileRepository()});
 const created=await db.service.createPackage(packageInput(),{
  now:TIME,ttlMs:60*60*1000,finalizeContext:{...context,...verified}
 });
 const opened=await db.service.resolveInvite(created.invite_token,{now:TIME+1000});
 assert.equal(opened.ok,true);
 assert.equal(opened.status,'OPEN');
 const submitted=await db.service.submit(opened.session_token,acceptedAnswers(),{
  now:TIME+2000,expectedVersion:opened.opportunity_version
 });
 assert.equal(submitted.ok,true);
 assert.equal(submitted.status,'SUBMITTED');
 const owner=profileRepository();
 const options={repository:db.repository,consultantRepository:owner};
 return {...db,created,opened,submitted,options};
}

test('isolated commercial lifecycle: booking -> accepted answers -> FINALIZE contract -> memory snapshot -> consultant preview',async()=>{
 const db=await createAndSubmit();
 const read=await db.repository.loadEnvelopeWithMeta(ID);
 const manifest=deriveAcceptedProspectManifest(read.envelope);
 assert.equal(manifest.ok,true);
 assert.deepEqual(manifest.entries.map(x=>x.evidence_id),['PROS-001','PROS-002','PROS-003']);
 assert.deepEqual(manifest.entries.map(x=>x.value),[
  'SOC 2 Readiness','Customer assessment planned; date not confirmed','Not sure yet'
 ]);
 const handoff=buildFinalizeBundle(read.envelope,read.etag);
 assert.equal(handoff.ok,true);
 assert.equal(handoff.consultant_id,CONSULTANT_ID);
 assert.equal(handoff.consultant_delivery_email,EMAIL);
 assert.deepEqual(JSON.parse(handoff.prospect_answers_json).answers.map(x=>x.source_evidence_id),
  ['PROS-001','PROS-002','PROS-003']);
 assert.equal(handoff.prospect_answers.answers[2].answer_kind,'UNSURE');
 const sources=await inspectPersistedFinalSources(ID,db.options);
 assert.equal(sources.status,'SOURCE_PREFLIGHT_PASSED');
 assert.equal(sources.accepted_answer_count,3);
 assert.equal(sources.snapshot_state,'NOT_PERSISTED');
 const artifact=finalizeCandidate();
 const check=await inspectLiveFinalCandidate(artifact,db.options);
 assert.equal(check.status,'CANDIDATE_CONTRACT_PASSED');
 assert.equal(check.booking_scope_review.status,'SCOPE_NOT_SYNTHETIC_NO_CONTACT_CONFIRMED');
 assert.equal(check.write_eligibility,'NOT_DETERMINED_REQUIRES_SEPARATE_EXPLICIT_PILOT');
 assert.equal(check.prospect_claim_review.status,'NARROW_LABEL_ALIGNMENT_ONLY');
 assert.equal(check.audit_assurance,'ADMIN_SUPPLIED_PASS_NOT_INDEPENDENTLY_REEXECUTED');
 assert.equal(check.semantic_assurance,'NOT_CERTIFIED');
 assert.equal(check.delivery_authorized,false);
 assert.equal(check.write_performed,false);
 assert.equal(db.events.filter(x=>x.path.endsWith('/envelope.json')).length,2);
 const absent=await previewPersistedOpportunityDiscovery(ID,{repository:db.repository});
 assert.equal(absent.status,'FINAL_ARTIFACT_NOT_PERSISTED');
 // Explicitly simulate ONLY the disabled production store service against
 // this in-memory adapter; no HTTP call, Vercel key or production feature flag.
 const stored=await persistGovernedFinalSnapshot({
  ...artifact,expected_opportunity_version:read.etag
 },{repository:db.repository});
 assert.equal(stored.status,'STORED');
 const preview=await previewPersistedOpportunityDiscovery(ID,{repository:db.repository});
 assert.equal(preview.status,'PREVIEW_READY');
 assert.equal(preview.ok,true);
 assert.equal(preview.final_questions.length,5);
 assert.equal(preview.review_drafts.length,0);
 assert.equal(preview.draft_status,'NO_REMAINING_SLOTS');
 assert.equal(preview.no_auto_send,true);
 assert.equal(preview.commercial_readiness_status==='NOT_COMMERCIAL_BENCHMARK',false);
 const after=await db.repository.loadEnvelopeWithMeta(ID);
 assert.equal(after.envelope.final_delivery_receipt == null,true);
 assert.equal(db.events.filter(x=>x.type==='memory_update'&&x.path.endsWith('/envelope.json')).length,2);
 assert.equal(JSON.stringify(preview).includes(EMAIL),false);
 assert.equal(JSON.stringify(preview).includes('Customer assessment planned; date not confirmed'),false);
 const replay=await persistGovernedFinalSnapshot({
  ...artifact,expected_opportunity_version:read.etag
 },{repository:db.repository});
 assert.equal(replay.status,'ALREADY_STORED');
});

test('real submission cannot mutate an accepted answer or expand into a false budget claim',async()=>{
 const db=await createAndSubmit();
 const submittedAgain=await db.service.submit(db.opened.session_token,[
  {question_id:'q_service',value:'iso'}],{now:TIME+3000});
 assert.equal(submittedAgain.ok,false);
 assert.equal(submittedAgain.error,'CLARIFICATION_ALREADY_SUBMITTED');
 const before=await db.repository.loadEnvelopeWithMeta(ID);
 const candidate=finalizeCandidate();
 // Introduced bogus claim in the lineage: accepted option was SOC 2, not ISO.
 const bad=JSON.parse(candidate.final_stage_output_json);
 bad.claris_final_brief.intelligence_lineage[2].usage='The prospect expressed interest in ISO 27001.';
 const verdict=await inspectLiveFinalCandidate({
  ...candidate,final_stage_output_json:JSON.stringify(bad),
  final_brief_markdown:renderFinalBrief(bad).brief_markdown
 },db.options);
 assert.equal(verdict.status,'CANDIDATE_CONTRACT_PASSED');
 assert.equal(verdict.prospect_claim_review.status,'PROSPECT_CLAIM_CONFLICT_DETECTED');
 assert.equal(verdict.semantic_assurance,'NOT_CERTIFIED');
 assert.equal(verdict.delivery_authorized,false);
 assert.equal((await db.repository.loadEnvelopeWithMeta(ID)).etag,before.etag);
});

test('missing accepted evidence, invalid audit and changed snapshot are fail-closed',async()=>{
 const db=await createAndSubmit();
 const artifact=finalizeCandidate();
 const read=await db.repository.loadEnvelopeWithMeta(ID);
 const badAudit=await inspectLiveFinalCandidate({
  ...artifact,final_audit_json:'{"audit_status":"FAIL"}'
 },db.options);
 assert.equal(badAudit.status,'CANDIDATE_CONTRACT_BLOCKED');
 const tampered=JSON.parse(artifact.final_stage_output_json);
 tampered.claris_final_brief.intelligence_lineage.push({
  source_id:'PROS-099',authority:'PROSPECT_REPORTED',usage:'Unsupported prospect need'
 });
 const unknown=await inspectLiveFinalCandidate({
  ...artifact,final_stage_output_json:JSON.stringify(tampered),
  final_brief_markdown:renderFinalBrief(tampered).brief_markdown
 },db.options);
 assert.equal(unknown.status,'CANDIDATE_CONTRACT_BLOCKED');
 const stored=await persistGovernedFinalSnapshot({
  ...artifact,expected_opportunity_version:read.etag
 },{repository:db.repository});
 assert.equal(stored.status,'STORED');
 const path='claris/opportunities/'+ID+'/clarification/envelope.json';
 const original=db.data.get(path);
 const compromised=structuredClone(original.value);
 compromised.response.answers[0].value='ISO 27001 Preparation';
 db.data.set(path,{value:compromised,etag:original.etag});
 const preview=await previewPersistedOpportunityDiscovery(ID,{repository:db.repository});
 assert.equal(preview.status,'FINAL_ARTIFACT_SNAPSHOT_INVALID');
 assert.equal(preview.ok,false);
 assert.equal(preview.review_drafts,undefined);
});
