// Candidate-only composition for authenticated Calendly normalization +
// private trusted fact persistence. No concrete storage/network calls here.
const eq=(a,b)=>String(a||"").trim()===String(b||"").trim();
const fail=(error)=>({ok:false,error});
function websiteFact(envelope){
  return envelope?.facts?.find(x=>x?.fact_key==="company_website"&&x?.established===true)||null;
}
export function createTrustedCalendlyIngest({
  normalizeBooking,bookingFactService,bookingFactRepository
}={}){
  if(typeof normalizeBooking!=="function"||
     typeof bookingFactService?.compile!=="function"||
     typeof bookingFactRepository?.create!=="function")
    throw Error("TRUSTED_CALENDLY_INGEST_DEPENDENCY_REQUIRED");
  return {async ingest(input,{now=Date.now()}={}){
    let normalized;
    try{normalized=normalizeBooking(input)}catch{return fail("CALENDLY_NORMALIZATION_FAILED")}
    if(!normalized?.ok)return normalized;

    let compiled;
    try{compiled=await bookingFactService.compile(input)}
    catch{return fail("TRUSTED_BOOKING_FACT_COMPILE_FAILED")}
    if(!compiled?.ok)return fail(compiled?.error||"TRUSTED_BOOKING_FACT_COMPILE_FAILED");

    const booking=normalized.booking;
    const envelope=compiled.booking_fact_envelope;
    const site=websiteFact(envelope);
    if(!booking||!envelope||!site||
       !eq(booking.opportunity_id,envelope.opportunity_id)||
       !eq(booking.consultant_id,envelope.consultant_id)||
       !eq(booking.domain,site.value)||
       !eq(booking.calendly_event_uri,envelope.source?.event_uri)||
       !eq(booking.calendly_invitee_uri,envelope.source?.invitee_uri))
      return fail("NORMALIZED_BOOKING_FACT_BINDING_MISMATCH");

    let persisted;
    try{persisted=await bookingFactRepository.create(envelope,{now})}
    catch{return fail("TRUSTED_BOOKING_FACT_PERSIST_FAILED")}
    if(!persisted?.ok)return fail(persisted?.error||"TRUSTED_BOOKING_FACT_PERSIST_FAILED");

    return {
      ...normalized,
      trusted_booking_fact_receipt:{
        persisted:true,
        repository_status:persisted.status||null,
        qualification_status:compiled.qualification_status||null,
        schema_version:envelope.schema_version
      }
    };
  }};
}
