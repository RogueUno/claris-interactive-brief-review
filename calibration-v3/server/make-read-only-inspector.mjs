// EU1 Make API read-only adapter. This NEVER accepts arbitrary URLs or
// methods. Any non-2xx, malformed JSON or unrecognized response fails closed.
const ID=/^[1-9][0-9]{5,11}$/;
const EXEC=/^[a-f0-9]{32}$/i;
export function createMakeReadOnlyInspector({
  token,fetchImpl=fetch,base='https://eu1.make.com/api/v2'
}={}) {
  if(typeof token!=='string'||token.trim().length<16||typeof fetchImpl!=='function'||
     base!=='https://eu1.make.com/api/v2')throw Error('MAKE_INSPECTOR_CONFIG_INVALID');
  async function read(path) {
    const response=await fetchImpl(base+path,{
      method:'GET',redirect:'error',
      headers:{Authorization:'Token '+token.trim(),Accept:'application/json'},
      signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)throw Error('MAKE_INSPECTOR_READ_FAILED');
    const body=await response.json();
    if(!body||typeof body!=='object'||Array.isArray(body))
      throw Error('MAKE_INSPECTOR_RESPONSE_INVALID');
    return body;
  }
  function scenarioId(value){
    if(!ID.test(String(value||'')))throw Error('MAKE_SCENARIO_ID_INVALID');
    return Number(value);
  }
  return Object.freeze({
    async inspectScenario({scenarioId:id}) {
      const n=scenarioId(id);
      const [details,dlq]=await Promise.all([
        read('/scenarios/'+n),read('/dlqs?scenarioId='+n)
      ]);
      const s=details.scenario;
      if(!s||Number(s.id)!==n||!Array.isArray(dlq.dlqs))
        throw Error('MAKE_INSPECTOR_SCENARIO_INCOMPLETE');
      // No unresolved or ambiguous incomplete executions allowed.
      if(dlq.dlqs.length>0)throw Error('MAKE_INSPECTOR_INCOMPLETE_EXECUTIONS');
      if(!dlq.pg || dlq.pg.offset!==0 || !Number.isSafeInteger(dlq.pg.limit) || dlq.pg.limit<1 || dlq.pg.limit<dlq.dlqs.length)
        throw Error('MAKE_INSPECTOR_DLQ_PAGINATION_UNVERIFIED');
      return {
        id:n,
        status:s.isActive===false?'inactive':s.isActive===true?'active':'unknown',
        incompleteExecutions:0,
        isWaitingOnIncompleteExecutions:false
      };
    },
    async inspectExecution({scenarioId:id,executionId}) {
      const n=scenarioId(id);
      if(!EXEC.test(executionId||''))throw Error('MAKE_EXECUTION_ID_INVALID');
      // Make logs must prove exact terminal module, failed stage, and no send.
      // These API endpoints alone cannot prove all of those facts.
      // Deliberately refuse authorization rather than manufacturing proof.
      await read('/scenarios/'+n);
      throw Error('MAKE_EXECUTION_TERMINAL_PROOF_NOT_IMPLEMENTED');
    }
  });
}
