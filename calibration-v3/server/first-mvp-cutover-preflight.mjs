// Read-only cutover eligibility assessment; never runs Make or sends Gmail.
export function assessBookingCutover({ingress,booking,lifecycle,submitted}={}){
 const reasons=[];
 if(ingress?.status!=='inactive')reasons.push('INGRESS_NOT_ISOLATED');
 for(const [name,item] of Object.entries({booking,lifecycle,submitted})){
   if(item?.status!=='inactive')reasons.push(name.toUpperCase()+'_NOT_INACTIVE');
   if(item?.hardHold!==true)reasons.push(name.toUpperCase()+'_HOLD_MISSING');
 }
 if(booking?.mailDisabled!==true)reasons.push('BOOKING_MAIL_NOT_DISABLED');
 if(submitted?.mailDisabled!==true)reasons.push('SUBMITTED_MAIL_NOT_DISABLED');
 if(ingress?.target!==7780705)reasons.push('INGRESS_TARGET_NOT_PROTECTED');
 if(booking?.target!==7786842)reasons.push('BOOKING_TARGET_NOT_PROTECTED');
 if(submitted?.target!==7786842)reasons.push('SUBMITTED_TARGET_NOT_PROTECTED');
 return {stage:'READ_ONLY_PREFLIGHT',safeToRun:false,reasons};
}
