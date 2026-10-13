import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { serverContext } from './api-shared.mjs';
import { clarificationServerContext } from '../../clarification-v1/server/api-shared.mjs';
import { extractPersistedBookingContext } from '../../clarification-v1/server/persisted-booking-discovery-gate.mjs';
import { deriveAcceptedProspectManifest } from '../../clarification-v1/server/accepted-prospect-evidence.mjs';
import { json, parseJson, cookieValue } from './http.mjs';

const OPPORTUNITY = 'claris_realistic_soc2_20261012_r1';
const CONSULTANT = 'pilot_mehdi_medjahed_20260922';
const COOKIE = 'claris_private_v5_pilot';
const SCHEMA = 'CLARIS_FINAL_REPLAY_V5_PILOT_V1';
const linkPath = h => 'claris/v5-final-pilot/link/' + h + '.json';
const briefPath = () => 'claris/v5-final-pilot/brief/' + OPPORTUNITY + '.json';
const sha = x => createHash('sha256').update(x).digest('hex');
const secret = () => {
  const s = process.env.CLARIS_SESSION_SECRET || '';
  if (s.length < 32) throw new Error('SESSION_SECRET_UNAVAILABLE');
  return s;
};
const mac = value => createHmac('sha256', secret()).update(value).digest('base64url');
const exact = (x,y) => {
  const a=Buffer.from(String(x||'')),b=Buffer.from(String(y||''));
  return a.length===b.length && timingSafeEqual(a,b);
};
const fail = (error,status=422) => json({ok:false,error},status);
const object = x => x && typeof x==='object' && !Array.isArray(x) ? x : {};
function parseObject(x) {
  try { const v=typeof x==='string'?JSON.parse(x):x; return object(v); }
  catch { return {}; }
}
function opaqueToken(fingerprint) { return mac('v5-final-pilot:v1:'+OPPORTUNITY+':'+fingerprint); }
function signedSession(tokenHash,expires) {
  const body=Buffer.from(JSON.stringify({h:tokenHash,e:expires,v:1})).toString('base64url');
  return body+'.'+mac('v5-session:'+body);
}
function readSession(value) {
  const [body,sig,extra]=String(value||'').split('.');
  if(!body||!sig||extra||!exact(sig,mac('v5-session:'+body)))return null;
  try {const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    return p.v===1 && /^[0-9a-f]{64}$/.test(p.h) && Number.isSafeInteger(p.e) && Date.now()<p.e ? p:null;
  } catch {return null;}
}
function safeCookie(value,expires) {
  return COOKIE+'='+encodeURIComponent(value)+'; Path=/api/delivery/package; HttpOnly; Secure; SameSite=Lax; Expires='+new Date(expires).toUTCString();
}
function authMetadata(input,identity) {
  const b=String(input.booking_text||'').trim();
  if(!b)throw new Error('BOOKING_REQUIRED');
  return {
    company:'PostHog',
    prospect_name:'Robin (simulated prospect)',
    prospect_role:'Operations lead (fictional)',
    meeting_time:null,
    booking_text:b,
    simulation_note:'Fictional buyer and test booking. Public PostHog website researched. No PostHog representative contacted or booked.',
    source_assurance:'Provider audit PASS; independent semantic certification NOT established.',
    consultant_delivery_email:identity.delivery_email
  };
}
export async function handleV5Pilot(request,operation) {
  if(operation==='v5_replay_publish') return publish(request);
  if(operation==='brief_resolve') return resolve(request);
  if(operation==='brief_data') return load(request);
  return fail('INVALID_V5_OPERATION',400);
}
async function publish(request) {
  const parsed=await parseJson(request);
  if(!parsed.ok)return parsed.response;
  const i=object(parsed.value);
  if(i.opportunity_id!==OPPORTUNITY || i.consultant_id!==CONSULTANT ||
    i.company!=='PostHog'||i.status!=='FINALIZED'||i.final_stage!=='FINALIZE')
    return fail('PILOT_OPPORTUNITY_CONTRACT_MISMATCH',403);
  const audit=parseObject(i.final_audit_json);
  const artifact=parseObject(i.final_stage_output_json);
  const caseState=parseObject(i.final_case_state_json);
  if(audit.audit_status!=='PASS'||audit.repair_required===true||
     !Array.isArray(audit.violations)||audit.violations.length||
     !Array.isArray(artifact.intelligence_lineage)||!artifact.intelligence_lineage.length)
    return fail('FINALIZE_ARTIFACT_NOT_AUDITED');
  const rt=serverContext().repository;
  const identity=await rt.loadIdentity(CONSULTANT);
  const locked=await rt.loadProfileEnvelopeWithMeta(CONSULTANT);
  if(!identity?.delivery_email || locked.envelope?.lifecycle_record?.status!=='LOCKED'||
    locked.envelope?.lifecycle_record?.runtime_v3?.status!=='READY'||
    identity.delivery_email.toLowerCase()!==String(i.consultant_delivery_email||'').toLowerCase())
    return fail('LOCKED_CONSULTANT_EMAIL_REQUIRED',403);
  const loaded=await clarificationServerContext().repository.loadEnvelopeWithMeta(OPPORTUNITY);
  const envelope=loaded.envelope;
  const booking=extractPersistedBookingContext(envelope);
  const manifest=deriveAcceptedProspectManifest(envelope);
  if(!booking.ok||!manifest.ok||!manifest.entries.length||
     i.booking_text!==booking.booking.verbatim_text)
    return fail('PERSISTED_BOOKING_AND_ACCEPTED_ANSWERS_REQUIRED',409);
  const evidence=new Set(artifact.intelligence_lineage.map(x=>String(x.evidence_id||x.source_id||'')));
  if(!evidence.has('BOOK-001') || !evidence.has('PROS-001'))
    return fail('FINALIZE_EVIDENCE_REFERENCES_MISSING',409);
  const metadata=authMetadata(i,identity);
  const payload={
    schema_version:SCHEMA,
    opportunity_id:OPPORTUNITY,
    company:metadata.company,
    context:metadata,
    payload:{final_replay_v3:artifact},
    expires_at:new Date(Date.now()+7*86400000).toISOString(),
    provider_audit_status:'PASS',
    quality_certification:'NOT_ESTABLISHED',
    acceptance_count:manifest.entries.length
  };
  const fingerprint=sha(JSON.stringify({artifact,metadata,manifest:manifest.binding_sha256}));
  const key=opaqueToken(fingerprint);
  const tokenHash=sha(key);
  const storage=serverContext().storage;
  let persisted=await storage.getJson(briefPath());
  if(persisted){
    if(persisted.fingerprint!==fingerprint || persisted.schema_version!==SCHEMA)
      return fail('PILOT_PUBLICATION_CONFLICT',409);
  }else{
    persisted={...payload,fingerprint,created_at:new Date().toISOString()};
    try{await storage.putJsonIfAbsent(briefPath(),persisted);}
    catch(e) {
      persisted=await storage.getJson(briefPath());
      if(!persisted||persisted.fingerprint!==fingerprint)return fail('PILOT_PUBLICATION_CONFLICT',409);
    }
  }
  const access={schema_version:SCHEMA,opportunity_id:OPPORTUNITY,token_hash:tokenHash,
    expires_at:persisted.expires_at,status:'ACTIVE'};
  try{await storage.putJsonIfAbsent(linkPath(tokenHash),access);}
  catch(e) {
    const existing=await storage.getJson(linkPath(tokenHash));
    if(!existing||existing.token_hash!==tokenHash||existing.opportunity_id!==OPPORTUNITY)
      return fail('PILOT_ACCESS_CONFLICT',409);
  }
  const url=new URL('/brief-v5/',request.url);
  url.hash='brief='+encodeURIComponent(key);
  return json({ok:true,status:'PUBLISHED_PILOT',brief_url:url.href,
    expires_at:persisted.expires_at,consultant_delivery_email:identity.delivery_email,
    opportunity_id:OPPORTUNITY,source_contract:SCHEMA,
    quality_certification:'NOT_ESTABLISHED'});
}
async function resolve(request) {
  const parsed=await parseJson(request);
  if(!parsed.ok)return parsed.response;
  const token=String(parsed.value?.brief_token||'').trim();
  if(!/^[A-Za-z0-9_-]{40,100}$/.test(token))return fail('PRIVATE_LINK_INVALID',401);
  const tokenHash=sha(token);
  const access=await serverContext().storage.getJson(linkPath(tokenHash));
  if(!access||access.schema_version!==SCHEMA||access.status!=='ACTIVE'||
    access.token_hash!==tokenHash||Date.parse(access.expires_at)<=Date.now())
    return fail('PRIVATE_LINK_EXPIRED_OR_INVALID',410);
  const brief=await serverContext().storage.getJson(briefPath());
  if(!brief||brief.schema_version!==SCHEMA||brief.expires_at!==access.expires_at||
     !exact(token,opaqueToken(brief.fingerprint)))
    return fail('PRIVATE_BRIEF_NOT_AVAILABLE',410);
  const expires=Math.min(Date.now()+12*3600000,Date.parse(brief.expires_at));
  return json({ok:true,brief:{company:brief.company,expires_at:brief.expires_at}},
    200,{'Set-Cookie':safeCookie(signedSession(tokenHash,expires),expires)});
}
async function load(request) {
  const session=readSession(cookieValue(request,COOKIE));
  if(!session)return fail('PRIVATE_SESSION_REQUIRED',401);
  const storage=serverContext().storage;
  const access=await storage.getJson(linkPath(session.h));
  if(!access||access.schema_version!==SCHEMA||access.status!=='ACTIVE'||
    Date.parse(access.expires_at)<=Date.now())
    return fail('PRIVATE_LINK_EXPIRED_OR_INVALID',410);
  const brief=await storage.getJson(briefPath());
  if(!brief||brief.schema_version!==SCHEMA||brief.expires_at!==access.expires_at)
    return fail('PRIVATE_BRIEF_NOT_AVAILABLE',410);
  const {fingerprint,...safeBrief}=brief;
  return json({ok:true,brief:safeBrief},200,{'Cache-Control':'private, no-store'});
}
