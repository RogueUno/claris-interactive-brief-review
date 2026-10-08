import { createHash } from 'node:crypto';
import { recoveryEvidencePath } from './recovery-attestation.mjs';

// Privileged orchestration-only service. Never expose this as a general Make
// webhook. The inspector and approval reader MUST fetch their data independently.
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const EXEC=/^[a-f0-9]{32}$/i;
const SCENARIO=/^[1-9][0-9]{5,11}$/;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validDate=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
export function createRecoveryAttestationWriter({
  storage,inspectExecution,inspectScenario,readOperatorApproval,now=()=>Date.now()
}={}) {
  if(!storage?.getJsonWithMeta||!storage?.putJsonIfAbsent||
    typeof inspectExecution!=='function'||typeof inspectScenario!=='function'||
    typeof readOperatorApproval!=='function')throw Error('RECOVERY_WRITER_TRUSTED_DEPENDENCIES_REQUIRED');

  return async ({opportunity_id,consultant_id,receipt_etag,make_execution_id,
    make_scenario_id}={})=>{
    if(!ID.test(opportunity_id||'')||!ID.test(consultant_id||'')||
      !receipt_etag||!EXEC.test(make_execution_id||'')||
      !SCENARIO.test(String(make_scenario_id||'')))
      return {ok:false,error:'RECOVERY_WRITER_INPUT_INVALID'};
    const path=recoveryEvidencePath(opportunity_id);
    let receipt,execution,scenario;
    try {
      // Independent state read: never accept caller assertions of outbox status.
      receipt=await storage.getJsonWithMeta('claris/direct-final-outbox/'+opportunity_id+'.json');
      execution=await inspectExecution({scenarioId:Number(make_scenario_id),executionId:make_execution_id});
      scenario=await inspectScenario({scenarioId:Number(make_scenario_id)});
    } catch {return {ok:false,error:'RECOVERY_WRITER_INSPECTION_UNAVAILABLE'};}
    const rec=receipt?.value;
    if(!rec||!receipt.etag||receipt.etag!==receipt_etag||
      rec.status!=='REGISTERED'||rec.opportunity_id!==opportunity_id||
      rec.consultant_id!==consultant_id||rec.recovery_count!==0||
      rec.claim_hash||rec.provider_message_id||rec.reserved_at||rec.sent_at||
      !execution||execution.id!==make_execution_id||
      Number(execution.scenario_id)!==Number(make_scenario_id)||
      execution.status!=='error'||execution.failure_stage!=='PREPARE'||
      execution.provider_http_status!==503||execution.provider_failure_class!=='TRANSIENT'||
      execution.finished!==true||execution.pending_operations!==0||
      execution.send_attempted!==false||execution.claim_attempted!==false||
      !validDate(execution.finished_at)||Date.parse(execution.finished_at)>now()||
      !scenario||Number(scenario.id)!==Number(make_scenario_id)||
      scenario.status!=='inactive'||scenario.isWaitingOnIncompleteExecutions===true||
      Number(scenario.incompleteExecutions||0)!==0)
      return {ok:false,error:'RECOVERY_WRITER_NOT_PROVEN'};
    const observed_at=new Date(execution.finished_at).toISOString();
    const proof={
      opportunity_id,consultant_id,receipt_etag,
      make_execution_id,make_scenario_id:String(make_scenario_id),
      finished_at:execution.finished_at,
      source_error:'PROVIDER_TRANSIENT_503',
      outbox_status:'REGISTERED',observed_at
    };
    const evidence_sha256=sha(proof);
    let approval;
    try {
      approval=await readOperatorApproval({opportunity_id,consultant_id,
        evidence_sha256,make_execution_id,receipt_etag});
    }catch{return {ok:false,error:'RECOVERY_WRITER_APPROVAL_UNAVAILABLE'};}
    if(!approval||approval.status!=='APPROVED'||
      approval.opportunity_id!==opportunity_id||
      approval.consultant_id!==consultant_id||
      approval.evidence_sha256!==evidence_sha256||
      approval.receipt_etag!==receipt_etag||
      approval.make_execution_id!==make_execution_id||
      approval.one_use!==true||approval.used===true||
      !validDate(approval.approved_at)||!validDate(approval.expires_at)||
      Date.parse(approval.approved_at)<Date.parse(observed_at)||
      Date.parse(approval.approved_at)>now()||
      Date.parse(approval.expires_at)<=now()||
      Date.parse(approval.expires_at)-now()>15*60*1000)
      return {ok:false,error:'RECOVERY_WRITER_APPROVAL_DENIED'};
    // No author-created hashes of caller-supplied approval content.
    const operator_approval_sha256=sha({
      evidence_sha256,approval_id:approval.approval_id,
      approver_id:approval.approver_id,
      approved_at:approval.approved_at,expires_at:approval.expires_at
    });
    const record={
      schema_version:'claris_recovery_attestation_v1',
      authority:'SERVER_VERIFIED_MAKE_EXECUTION',
      opportunity_id,consultant_id,receipt_etag,
      make_execution_id,make_scenario_id:String(make_scenario_id),
      make_stage:'PREPARE',execution_status:'TERMINAL_FAILED',
      provider_http_status:503,provider_failure_class:'TRANSIENT',
      no_pending_execution:true,no_claim_or_send:true,
      outbox_status_at_attestation:'REGISTERED',
      operator_approved:true,one_use_approval:true,
      evidence_sha256,operator_approval_sha256,
      approval_status:'APPROVED',
      observed_at,approved_at:approval.approved_at,expires_at:approval.expires_at
    };
    try {
      await storage.putJsonIfAbsent(path,record);
    } catch {
      // Never replace ambiguous or previously existing approval records.
      return {ok:false,error:'RECOVERY_WRITER_CREATE_UNCERTAIN'};
    }
    return {ok:true,status:'ATTESTATION_CREATED',opportunity_id,evidence_sha256};
  };
}
