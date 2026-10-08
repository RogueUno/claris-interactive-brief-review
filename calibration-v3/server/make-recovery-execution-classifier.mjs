// Normalize independently obtained Make execution inspection; never infer
// a PREPARE provider failure from free-form 503 text alone.
const PROVIDER=/\[503\]|HTTP\s*503/i;
export function classifyMakeRecoveryExecution({scenarioId,executionId,summary,inspection}={}) {
  const e=inspection?.execution;
  if(!/^[a-f0-9]{32}$/i.test(executionId||'') ||
    !Number.isSafeInteger(scenarioId) || scenarioId<1 ||
    summary?.execution?.id!==executionId ||
    summary?.execution?.status!=='error' ||
    e?.id!==undefined && e.id!==executionId ||
    e?.status!=='error' ||
    summary.execution.startedAt!==e.startedAt ||
    summary.execution.duration!==e.duration ||
    !inspection?.error?.moduleId ||
    !Array.isArray(inspection.modules)) return null;
  if(inspection.eventsTruncated===true ||
    inspection.modules.some(m=>!Number.isSafeInteger(m.id)||
      !Number.isSafeInteger(m.invocations)||m.invocations<0||
      !Number.isSafeInteger(m.errors)||m.errors<0||m.errors>m.invocations))return null;
  const failure=inspection.modules.filter(m=>m.errors>0);
  // Make V2.3 shadow's PREPARE is child module #2. Other failures (C1-C4,
  // HTTP protocol, FINALIZE) must NOT result in a PREPARE recovery token.
  if(scenarioId!==7786842 || failure.length!==1 ||
     failure[0].id!==2 || inspection.error.moduleId!==2 ||
     !PROVIDER.test(inspection.error.message||'') ||
     !PROVIDER.test(summary.error?.message||'') ||
     !Number.isSafeInteger(e.duration) || e.duration<0 ||
     !e.startedAt || !Number.isFinite(Date.parse(e.startedAt)) ||
     inspection.modules.some(m=>[51,55,71,76].includes(m.id)&&m.invocations>0))
    return null;
  // The parent Make report cannot certify the failed child provider module,
  // absence of downstream delivery in another scenario, or live operations.
  // Return only observed fields, explicitly marking missing proofs.
  return Object.freeze({
    id:executionId,scenario_id:scenarioId,status:'error',
    failure_module_id:2,failure_stage:'PREPARE',
    provider_http_status:503,provider_failure_class:'UNVERIFIED_CHILD',
    finished:true,
    finished_at:new Date(Date.parse(e.startedAt)+e.duration).toISOString(),
    pending_operations:null,send_attempted:null,claim_attempted:null
  });
}
