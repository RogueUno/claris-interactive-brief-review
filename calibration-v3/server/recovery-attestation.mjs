// Server-owned, read-only recovery evidence. No public ingest or approval API
// exists: an authenticated Make caller cannot create this record through this
// module. Absence, malformed proof or storage ambiguity always denies recovery.
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const RUN=/^[A-Za-z0-9_-]{12,150}$/;
const SCENARIO=/^[1-9][0-9]{5,11}$/;
const HASH=/^[a-f0-9]{64}$/;
const ts=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):NaN;
export function recoveryEvidencePath(id) {
  if(!ID.test(id)) throw Error('RECOVERY_EVIDENCE_ID_INVALID');
  return 'claris/recovery-attestations/'+id+'.json';
}
export function createRecoveryAttestor({storage,now=()=>Date.now()}={}) {
  if(typeof storage?.getJsonWithMeta!=='function') throw Error('RECOVERY_STORAGE_REQUIRED');
  return async ({opportunity_id,consultant_id,receipt,receipt_etag})=>{
    if(!ID.test(opportunity_id)||!ID.test(consultant_id)||
       typeof receipt_etag!=='string'||!receipt_etag||receipt?.status!=='REGISTERED')
      return null;
    // ETags are transport concurrency bindings. No update/create methods here.
    const result=await storage.getJsonWithMeta(recoveryEvidencePath(opportunity_id));
    const e=result?.value;
    if(!e||!result.etag||e.schema_version!=='claris_recovery_attestation_v1'||
       e.authority!=='SERVER_VERIFIED_MAKE_EXECUTION'||
       e.opportunity_id!==opportunity_id||e.consultant_id!==consultant_id||
       e.receipt_etag!==receipt_etag||
       !RUN.test(e.make_execution_id)||!SCENARIO.test(e.make_scenario_id)||
       e.make_stage!=='PREPARE'||e.execution_status!=='TERMINAL_FAILED'||
       e.provider_http_status!==503||e.provider_failure_class!=='TRANSIENT'||
       e.no_pending_execution!==true||e.no_claim_or_send!==true||
       e.outbox_status_at_attestation!=='REGISTERED'||
       e.operator_approved!==true||e.one_use_approval!==true||
       !HASH.test(e.evidence_sha256)||!HASH.test(e.operator_approval_sha256)||
       e.approval_status!=='APPROVED'||
       !Number.isFinite(ts(e.observed_at))||
       !Number.isFinite(ts(e.approved_at))||
       !Number.isFinite(ts(e.expires_at))||
       ts(e.approved_at)<ts(e.observed_at)||
       ts(e.expires_at)<=now()||ts(e.observed_at)>now()||
       ts(e.approved_at)>now())return null;
    return Object.freeze({
      authorized:true,opportunity_id,consultant_id,receipt_etag,
      terminal_provider_503:true,no_pending_execution:true,no_claim_or_send:true,
      operator_approved:true,one_use_approval:true,
      evidence_sha256:e.evidence_sha256,
      operator_approval_sha256:e.operator_approval_sha256
    });
  };
}
