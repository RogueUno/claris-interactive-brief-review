// Isolated, privileged recovery approval consumption; conditional write only.
export function createApprovalConsume({storage,now=()=>Date.now()}={}){
  if(typeof storage?.getJsonWithMeta!=='function'||typeof storage?.putJson!=='function')
    throw Error('APPROVAL_CONSUME_STORAGE_REQUIRED');
  return async (path,approved)=>{
    if(!/^claris\/recovery-operator-approvals\/[A-Za-z0-9_-]{8,100}\.json$/.test(path))
      return false;
    try{
      const {value,etag}=await storage.getJsonWithMeta(path);
      if(!etag||!value||value.status!=='APPROVED'||value.used!==false||
        value.one_use!==true||value.approval_id!==approved?.approval_id||
        value.evidence_sha256!==approved.evidence_sha256||
        value.make_execution_id!==approved.make_execution_id||
        value.receipt_etag!==approved.receipt_etag||
        !Number.isFinite(Date.parse(value.expires_at))||
        Date.parse(value.expires_at)<=now())return false;
      await storage.putJson(path,{...value,status:'CONSUMED',used:true,
        consumed_at:new Date(now()).toISOString()},{ifMatch:etag});
      return true;
    }catch{return false;}
  };
}
