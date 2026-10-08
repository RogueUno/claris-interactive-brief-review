// Authenticated, candidate-only diagnostic; never returns Make response bodies,
// headers, URLs, credentials, execution payloads or customer details.
import {createMakeReadOnlyInspector} from './make-read-only-inspector.mjs';
export async function runMakeInspectorDiagnostic({
  env=process.env,fetchImpl=fetch,scenarioId=7786842
}={}){
  if(env.VERCEL_ENV!=='preview' ||
     env.VERCEL_GIT_COMMIT_REF!=='candidate/trusted-booking-facts-20261007' ||
     env.CLARIS_MAKE_INSPECTOR_DIAGNOSTIC_V1!=='true')
    return {ok:false,status:'DIAGNOSTIC_DISABLED'};
  const token=env.CLARIS_MAKE_INSPECTOR_TOKEN;
  if(!token)return {ok:false,status:'INSPECTOR_TOKEN_MISSING'};
  try{
    const inspector=createMakeReadOnlyInspector({token,fetchImpl});
    const status=await inspector.inspectScenario({scenarioId});
    if(status?.status!=='inactive')return {ok:false,status:'SCENARIO_NOT_INACTIVE'};
    return {ok:true,status:'SCENARIO_READ_VERIFIED'};
  }catch(error){
    const allowed=new Set([
      'MAKE_INSPECTOR_READ_FAILED','MAKE_INSPECTOR_RESPONSE_INVALID',
      'MAKE_INSPECTOR_SCENARIO_INCOMPLETE','MAKE_INSPECTOR_INCOMPLETE_EXECUTIONS',
      'MAKE_INSPECTOR_DLQ_PAGINATION_UNVERIFIED'
    ]);
    return {ok:false,status:allowed.has(error?.message)?error.message:'INSPECTOR_UNAVAILABLE'};
  }
}
