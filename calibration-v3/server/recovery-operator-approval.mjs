// Read-only privileged approval adapter. There is deliberately no HTTP
// approval-creation route; only an operator-controlled writer may provision
// these records after independently inspecting Make execution history.
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const EXEC=/^[a-f0-9]{32}$/i;
const HASH=/^[a-f0-9]{64}$/;
export function recoveryApprovalPath(id){
  if(!ID.test(id))throw Error('RECOVERY_APPROVAL_ID_INVALID');
  return 'claris/recovery-operator-approvals/'+id+'.json';
}
export function createStoredRecoveryApprovalReader({storage,now=()=>Date.now()}={}){
  if(typeof storage?.getJsonWithMeta!=='function')
    throw Error('RECOVERY_APPROVAL_STORAGE_REQUIRED');
  return async ({opportunity_id,consultant_id,evidence_sha256,
    make_execution_id,receipt_etag}={})=>{
    if(!ID.test(opportunity_id||'')||!ID.test(consultant_id||'')||
      !HASH.test(evidence_sha256||'')||!EXEC.test(make_execution_id||'')||
      typeof receipt_etag!=='string'||!receipt_etag)return null;
    const loaded=await storage.getJsonWithMeta(recoveryApprovalPath(opportunity_id));
    const a=loaded?.value;
    if(!loaded?.etag||!a||a.schema_version!=='claris_recovery_operator_approval_v1'||
       a.status!=='APPROVED'||a.opportunity_id!==opportunity_id||
       a.consultant_id!==consultant_id||
       a.evidence_sha256!==evidence_sha256||
       a.make_execution_id!==make_execution_id||
       a.receipt_etag!==receipt_etag||
       !ID.test(a.approval_id||'')||!ID.test(a.approver_id||'')||
       a.one_use!==true||a.used!==false||
       !Number.isFinite(Date.parse(a.approved_at||''))||
       !Number.isFinite(Date.parse(a.expires_at||''))||
       Date.parse(a.approved_at)>now()||
       Date.parse(a.expires_at)<=now()||
       Date.parse(a.expires_at)-Date.parse(a.approved_at)>15*60*1000)
      return null;
    return Object.freeze({
      status:'APPROVED',opportunity_id,consultant_id,
      evidence_sha256,make_execution_id,receipt_etag,
      one_use:true,used:false,
      approval_id:a.approval_id,approver_id:a.approver_id,
      approved_at:a.approved_at,expires_at:a.expires_at
    });
  };
}
