// CLARIS PRIVATE REFERENCE — immutable trusted booking fact repository candidate.
// No concrete storage/network implementation. Production would inject the existing
// private JSON storage adapter. Writes are create-once; no update/delete/rearm API.
const VERSION="claris_trusted_booking_facts_v1";
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const hashish=/^[A-Za-z0-9_-]{3,160}$/;
const txt=x=>typeof x==="string"?x.trim():"";
function pathFor(id){
  const value=txt(id);
  if(!ID.test(value))throw Error("BOOKING_FACT_OPPORTUNITY_INVALID");
  return "claris/opportunities/"+value+"/booking-facts.json";
}
function validEnvelope(e){
  return e&&typeof e==="object"&&!Array.isArray(e)&&e.ok===true&&
    e.schema_version===VERSION&&ID.test(e.opportunity_id||"")&&
    /^[A-Za-z0-9_-]{3,80}$/.test(e.consultant_id||"")&&
    e.issuer==="SERVER_CALENDLY_FACT_COMPILER_V1"&&
    e.source?.kind==="CALENDLY"&&Array.isArray(e.facts);
}
function stable(value){
  if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
  if(value&&typeof value==="object"){
    return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
  }
  return JSON.stringify(value);
}
function logical(record){
  if(!record||typeof record!=="object")return record;
  const {persisted_at,immutable,repository_version,...rest}=record;
  return rest;
}
function sameLogical(existing,envelope){
  return stable(logical(existing))===stable(envelope);
}
async function confirmExisting(storage,envelope){
  let loaded;
  try{loaded=await storage.getJsonWithMeta(pathFor(envelope.opportunity_id))}
  catch{return {ok:false,error:"BOOKING_FACT_CREATE_UNCERTAIN"}}
  if(!loaded?.value)return {ok:false,error:"BOOKING_FACT_CREATE_UNCERTAIN"};
  if(!validEnvelope(loaded.value)||loaded.value.opportunity_id!==envelope.opportunity_id)
    return {ok:false,error:"BOOKING_FACT_RECORD_INVALID"};
  if(!sameLogical(loaded.value,envelope))
    return {ok:false,error:"BOOKING_FACT_IMMUTABLE_CONFLICT"};
  if(typeof loaded.etag!=="string"||loaded.etag.length<3)
    return {ok:false,error:"BOOKING_FACT_ETAG_MISSING"};
  return {ok:true,status:"EXISTS_IDENTICAL",
    opportunity_id:envelope.opportunity_id,etag:loaded.etag};
}
export function createBookingFactRepository(storage){
  if(typeof storage?.getJsonWithMeta!=="function"||
     typeof storage?.putJsonIfAbsent!=="function")
    throw Error("BOOKING_FACT_STORAGE_ATOMIC_CREATE_REQUIRED");
  return {
    async load(opportunityId){
      let loaded;
      try{loaded=await storage.getJsonWithMeta(pathFor(opportunityId))}
      catch{return {ok:false,error:"BOOKING_FACT_READ_FAILED",envelope:null,etag:null}}
      if(!loaded?.value)return {ok:false,error:"BOOKING_FACT_NOT_FOUND",envelope:null,etag:null};
      if(!validEnvelope(loaded.value)||loaded.value.opportunity_id!==opportunityId)
        return {ok:false,error:"BOOKING_FACT_RECORD_INVALID",envelope:null,etag:null};
      if(typeof loaded.etag!=="string"||loaded.etag.length<3)
        return {ok:false,error:"BOOKING_FACT_ETAG_MISSING",envelope:null,etag:null};
      return {ok:true,envelope:loaded.value,etag:loaded.etag};
    },
    async create(envelope,{now=Date.now()}={}){
      if(!validEnvelope(envelope)||!Number.isFinite(now))
        return {ok:false,error:"BOOKING_FACT_ENVELOPE_INVALID"};
      const record={
        ...envelope,
        persisted_at:new Date(now).toISOString(),
        immutable:true,
        repository_version:"claris_booking_fact_repository_v1"
      };
      let saved;
      try{saved=await storage.putJsonIfAbsent(pathFor(envelope.opportunity_id),record)}
      catch{
        // Distinguish an identical Calendly redelivery from an uncertain or
        // conflicting write by independently reading the immutable record.
        return confirmExisting(storage,envelope);
      }
      const etag=typeof saved?.etag==="string"&&hashish.test(saved.etag)?saved.etag:null;
      if(!etag)return confirmExisting(storage,envelope);
      return {ok:true,status:"CREATED",opportunity_id:envelope.opportunity_id,etag};
    },
    pathFor
  };
}
export const trustedBookingFactRepositoryVersion="claris_booking_fact_repository_v1";
