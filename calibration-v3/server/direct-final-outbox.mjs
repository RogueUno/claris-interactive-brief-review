import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifyLockedDeliveryOwner } from '../../clarification-v1/server/verify-locked-delivery-owner.mjs';
import { buildConsultantFinalDelivery, buildProspectClarificationDelivery } from './pilot-delivery.mjs';
import { adaptCertifiedPrepareToClarificationEvidence } from '../../clarification-v1/server/prepare-adapter.mjs';
import { renderFinalBrief, parseFinalArtifact } from '../../clarification-v1/server/final-brief-renderer.mjs';

// This outbox is only for V2.3's no-clarification branch. Submitted prospect
// answers and published V5 briefs use different, independently gated outboxes.
const VERSION = 'claris_direct_final_outbox_v1';
const VALID_ID = /^[A-Za-z0-9_-]{8,100}$/;
const TOKEN = /^[a-f0-9]{64}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = x => typeof x === 'string' ? x.trim() : '';
const hash = x => createHash('sha256').update(x).digest('hex');
function same(a, b) {
  const x = Buffer.from(text(a));
  const y = Buffer.from(text(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
function status(name, extra = {}) {
  return {
    ok: ['REGISTERED', 'RECOVERY_AUTHORIZED', 'PREPARE_SEALED', 'CLAIMED', 'ACKNOWLEDGED', 'SKIPPED_ALREADY_SENT'].includes(name),
    status: name, ...extra
  };
}
function receiptPath(id) {
  if (!VALID_ID.test(id)) throw new Error('DIRECT_FINAL_OPPORTUNITY_INVALID');
  return 'claris/direct-final-outbox/' + id + '.json';
}
function canonicalJson(value) {
  const valueObject = typeof value === 'string' ? JSON.parse(value) : value;
  if (!valueObject || typeof valueObject !== 'object' || Array.isArray(valueObject)) {
    throw new Error('DIRECT_FINAL_SOT_INVALID');
  }
  function walk(obj) {
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(Object.keys(obj).sort().map(k => [k, walk(obj[k])]));
    }
    return obj;
  }
  return JSON.stringify(walk(valueObject));
}
function normalizeBooking(x) {
  const b = {
    opportunity_id: text(x?.opportunity_id),
    consultant_id: text(x?.consultant_id),
    consultant_delivery_email: text(x?.consultant_delivery_email).toLowerCase(),
    company: text(x?.company),
    prospect_first_name: text(x?.prospect_first_name),
    prospect_email: text(x?.prospect_email).toLowerCase(),
    meeting_time: text(x?.meeting_time),
    domain: text(x?.domain).toLowerCase()
  };
  if (!VALID_ID.test(b.opportunity_id) ||
      !/^[A-Za-z0-9_-]{3,80}$/.test(b.consultant_id) ||
      !EMAIL.test(b.consultant_delivery_email) ||
      !EMAIL.test(b.prospect_email) || !b.company ||
      !b.prospect_first_name || !b.meeting_time || !b.domain ||
      b.consultant_delivery_email.length > 254 ||
      b.prospect_email.length > 254 ||
      b.company.length > 160 ||
      b.prospect_first_name.length > 120 ||
      b.meeting_time.length > 80 || b.domain.length > 350 ||
      /[\r\n\u0000-\u001f]/.test(b.company + b.prospect_first_name) ||
      !Number.isFinite(Date.parse(b.meeting_time))) {
    return null;
  }
  try {
    const url = new URL(b.domain);
    const host = url.hostname.replace(/\.$/, '').toLowerCase();
    const labels = host.split('.');
    const last = labels.at(-1);
    const reserved = new Set(['local','localhost','internal','invalid','test','example','lan','home','corp','onion']);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.port || url.search || url.hash || url.pathname !== '/' ||
        host.length > 253 || labels.length < 2 || host.includes(':') ||
        labels.some(l => !l || l.length > 63 ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(l)) ||
        !/^(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/.test(last) ||
        reserved.has(last) || /^\d+$/.test(last)) return null;
  } catch { return null; }
  return b;
}
function auditPass(input) {
  let parsed;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : input;
  } catch { return false; }
  return parsed?.audit_status === 'PASS' &&
    parsed.repair_required === false &&
    Array.isArray(parsed.violations) && parsed.violations.length === 0;
}

function parsedObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  let current = value;
  for (let depth = 0; depth < 2 && typeof current === 'string'; depth += 1) {
    try { current = JSON.parse(current); }
    catch { return null; }
  }
  return current && typeof current === 'object' && !Array.isArray(current)
    ? current : null;
}
function stableJson(value) {
  function walk(item) {
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map(k => [k, walk(item[k])]));
    }
    return item;
  }
  return JSON.stringify(walk(value));
}
function certifiedPrepareProof(input, booking, sotObject) {
  const state = parsedObject(input?.prepare_case_state_json);
  const consultantName = text(sotObject?.consultant?.consultant_name);
  const firm = text(sotObject?.consultant?.firm);
  if (!state || !consultantName || !firm) return null;
  let bundle;
  try {
    bundle = adaptCertifiedPrepareToClarificationEvidence({
      opportunity_id: booking.opportunity_id,
      case_state_json: state,
      consultant: {
        consultant_id: booking.consultant_id,
        first_name: consultantName.split(/\s+/)[0],
        firm
      },
      prospect: {
        first_name: booking.prospect_first_name,
        company: booking.company
      }
    });
  } catch { return null; }
  const ids = [...new Set((bundle?.evidence || [])
    .map(item => text(item?.evidence_id))
    .filter(Boolean))].sort();
  const hasBooking = (bundle?.evidence || []).some(item =>
    item?.source_type === 'BOOKING' && ids.includes(text(item?.evidence_id)));
  if (!ids.length || !hasBooking ||
      ids.some(id => !/^[A-Za-z0-9_-]{3,100}$/.test(id))) return null;
  return {
    prepare_hash: hash(stableJson(state)),
    evidence_hash: hash(JSON.stringify(ids)),
    evidence_ids: ids
  };
}
function verifiedDirectFinalProvenance(input, record, booking, sotObject, markdown) {
  if (!record?.prepare_hash || !record?.prepare_evidence_hash) {
    return { ok:false, error:'DIRECT_FINAL_PREPARE_NOT_SEALED' };
  }
  const proof = certifiedPrepareProof(input, booking, sotObject);
  if (!proof || !same(proof.prepare_hash, record.prepare_hash)) {
    return { ok:false, error:'DIRECT_FINAL_PREPARE_PROVENANCE_MISMATCH' };
  }
  if (!same(proof.evidence_hash, record.prepare_evidence_hash)) {
    return { ok:false, error:'DIRECT_FINAL_PREPARE_EVIDENCE_MISMATCH' };
  }
  if (!input?.final_stage_output_json || !input?.final_case_state_json) {
    return { ok:false, error:'DIRECT_FINAL_ARTIFACT_PROVENANCE_MISSING' };
  }
  let stageOutput, finalCase;
  try {
    stageOutput = parseFinalArtifact(input.final_stage_output_json);
    finalCase = parseFinalArtifact(input.final_case_state_json);
  } catch {
    return { ok:false, error:'DIRECT_FINAL_ARTIFACT_INVALID' };
  }
  if (stableJson(stageOutput) !== stableJson(finalCase)) {
    return { ok:false, error:'DIRECT_FINAL_FINAL_STATE_MISMATCH' };
  }
  let rendered;
  try { rendered = renderFinalBrief(stageOutput); }
  catch { return { ok:false, error:'DIRECT_FINAL_ARTIFACT_INVALID' }; }
  if (text(rendered?.brief_markdown) !== markdown) {
    return { ok:false, error:'DIRECT_FINAL_RENDER_MISMATCH' };
  }
  const lineage = Array.isArray(rendered?.normalized?.intelligence_lineage)
    ? rendered.normalized.intelligence_lineage : [];
  const ids = lineage.map(item => text(item?.source_id)).filter(Boolean);
  if (!ids.length || ids.length !== lineage.length ||
      ids.some(id => id.startsWith('PROS-')) ||
      ids.some(id => !proof.evidence_ids.includes(id))) {
    return { ok:false, error:'DIRECT_FINAL_LINEAGE_INVALID' };
  }
  return {
    ok:true,
    prepare_hash:proof.prepare_hash,
    stage_output_hash:hash(stableJson(stageOutput)),
    audit_hash:hash(typeof input?.final_audit_json === 'string'
      ? input.final_audit_json : stableJson(input?.final_audit_json))
  };
}
function escapedEmail(value) {
  return '<div style="white-space:pre-wrap;font-family:Arial,sans-serif">' +
    text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;') + '</div>';
}
function validRecord(record) {
  if (!record || record.schema_version !== VERSION ||
      !['REGISTERED','PREPARE_SEALED','RESERVED','SENT','INVITE_RESERVED','INVITE_SENT'].includes(record.status)) {
    return false;
  }
  return TOKEN.test(record.registration_hash) &&
    VALID_ID.test(record.opportunity_id) &&
    /^[a-f0-9]{64}$/.test(record.booking_hash) &&
    /^[a-f0-9]{64}$/.test(record.sot_hash);
}
function previously(record) {
  if (!validRecord(record)) return status('BLOCKED', { error:'DIRECT_FINAL_RECEIPT_INVALID' });
  return ['SENT','INVITE_SENT'].includes(record.status)
    ? status('SKIPPED_ALREADY_SENT')
    : status('RECONCILIATION_REQUIRED', {
      error: ['REGISTERED','PREPARE_SEALED'].includes(record.status)
        ? 'DIRECT_FINAL_BOOKING_ALREADY_REGISTERED'
        : 'DIRECT_FINAL_SEND_OUTCOME_UNKNOWN'
    });
}

export function createDirectFinalOutbox({ storage, consultantRepository,
  clarificationRepository = null, inviteBaseUrl = null,
  requireFinalProvenance = false }) {
  if (!storage?.getJsonWithMeta || !storage?.putJsonIfAbsent || !storage?.putJson ||
      !consultantRepository?.loadIdentity ||
      !consultantRepository?.loadProfileEnvelopeWithMeta) {
    throw new Error('DIRECT_FINAL_DEPENDENCIES_REQUIRED');
  }
  async function get(id) {
    return storage.getJsonWithMeta(receiptPath(id));
  }
  async function lockedOwner(input) {
    try {
      return await verifyLockedDeliveryOwner(input, {
        repository: consultantRepository
      });
    } catch {
      return null;
    }
  }
  return {
    async begin(input, { now=Date.now() } = {}) {
      const b = normalizeBooking(input);
      if (!b) return status('BLOCKED', { error: 'DIRECT_FINAL_BOOKING_INVALID' });
      const owner = await lockedOwner(input);
      if (!owner || owner.consultant_id !== b.consultant_id ||
          owner.consultant_delivery_email !== b.consultant_delivery_email) {
        return status('BLOCKED', { error: 'DIRECT_FINAL_OWNER_UNVERIFIED' });
      }
      let sot;
      try { sot = canonicalJson(input.consultant_sot_json); }
      catch { return status('BLOCKED', { error: 'DIRECT_FINAL_SOT_INVALID' }); }
      let loaded;
      try { loaded = await get(b.opportunity_id); }
      catch { return status('BLOCKED', { error: 'DIRECT_FINAL_REGISTER_READ_FAILED' }); }
      if (loaded?.value) return previously(loaded.value);
      const registrationToken = randomBytes(32).toString('hex');
      const data = {
        schema_version: VERSION,
        opportunity_id: b.opportunity_id,
        consultant_id: owner.consultant_id,
        consultant_email_hash: hash(owner.consultant_delivery_email),
        booking_hash: hash(JSON.stringify(b)),
        sot_hash: hash(sot),
        registration_hash: hash(registrationToken),
        status: 'REGISTERED',
        prepare_hash: null,
        prepare_evidence_hash: null,
        prepare_evidence_count: 0,
        prepare_sealed_at: null,
        claim_hash: null,
        final_hash: null,
        provider_message_id: null,
        registered_at: new Date(now).toISOString(),
        reserved_at: null,
        sent_at: null,
        recovery_count: 0,
        recovered_at: null
      };
      try { await storage.putJsonIfAbsent(receiptPath(b.opportunity_id), data); }
      catch {
        // Never return a token after an uncertain storage outcome. A resumed
        // booking could otherwise repeat PREPARE and generate duplicate mail.
        return status('BLOCKED', { error: 'DIRECT_FINAL_REGISTRATION_UNCERTAIN' });
      }
      return status('REGISTERED', {
        opportunity_id: b.opportunity_id,
        registration_token: registrationToken
      });
    },

    async recoverRegistered(input, { now=Date.now() } = {}) {
      const b = normalizeBooking(input);
      if (!b) return status('BLOCKED', { error:'DIRECT_FINAL_RECOVERY_BOOKING_INVALID' });
      if (text(input?.recovery_reason) !== 'PROVIDER_TRANSIENT_503') {
        return status('BLOCKED', { error:'DIRECT_FINAL_RECOVERY_REASON_INVALID' });
      }

      const owner = await lockedOwner(input);
      if (!owner || owner.consultant_id !== b.consultant_id ||
          owner.consultant_delivery_email !== b.consultant_delivery_email) {
        return status('BLOCKED', { error:'DIRECT_FINAL_RECOVERY_OWNER_UNVERIFIED' });
      }

      let sot;
      try { sot = canonicalJson(input.consultant_sot_json); }
      catch { return status('BLOCKED', { error:'DIRECT_FINAL_RECOVERY_SOT_INVALID' }); }

      let loaded;
      try { loaded = await get(b.opportunity_id); }
      catch { return status('BLOCKED', { error:'DIRECT_FINAL_RECOVERY_READ_FAILED' }); }
      const rec = loaded?.value;
      if (!validRecord(rec) || !loaded.etag) {
        return status('BLOCKED', { error:'DIRECT_FINAL_RECOVERY_REGISTRATION_MISSING' });
      }
      if (rec.status !== 'REGISTERED') return previously(rec);
      if (rec.opportunity_id !== b.opportunity_id ||
          rec.consultant_id !== b.consultant_id ||
          !same(rec.booking_hash, hash(JSON.stringify(b))) ||
          !same(rec.sot_hash, hash(sot))) {
        return status('BLOCKED', { error:'DIRECT_FINAL_RECOVERY_BINDING_MISMATCH' });
      }

      const recoveryCount = Number.isInteger(rec.recovery_count) ? rec.recovery_count : 0;
      if (recoveryCount >= 1) {
        return status('BLOCKED', { error:'DIRECT_FINAL_RECOVERY_LIMIT_REACHED' });
      }

      const registrationToken = randomBytes(32).toString('hex');
      const next = {
        ...rec,
        registration_hash: hash(registrationToken),
        recovery_count: recoveryCount + 1,
        recovered_at: new Date(now).toISOString()
      };
      try {
        await storage.putJson(receiptPath(b.opportunity_id), next, { ifMatch:loaded.etag });
      } catch {
        return status('RECONCILIATION_REQUIRED', { error:'DIRECT_FINAL_RECOVERY_UNCERTAIN' });
      }
      return status('RECOVERY_AUTHORIZED', {
        opportunity_id: b.opportunity_id,
        registration_token: registrationToken,
        recovery_count: next.recovery_count
      });
    },

    async claim(input, { now=Date.now() } = {}) {
      const b = normalizeBooking(input);
      const registrationToken = text(input?.registration_token);
      if (!b || !TOKEN.test(registrationToken)) {
        return status('BLOCKED', { error: 'DIRECT_FINAL_CLAIM_INPUT_INVALID' });
      }
      if (input?.status !== 'FINALIZED' || input?.final_stage !== 'FINALIZE' ||
          input?.requires_clarification !== false ||
          !auditPass(input?.final_audit_json) ||
          !text(input?.final_brief_markdown) ||
          text(input.final_brief_markdown).length > 250000) {
        return status('BLOCKED', { error: 'DIRECT_FINAL_NOT_CERTIFIED' });
      }
      let loaded;
      try { loaded = await get(b.opportunity_id); }
      catch { return status('BLOCKED', { error: 'DIRECT_FINAL_CLAIM_READ_FAILED' }); }
      const rec = loaded?.value;
      if (!validRecord(rec) || !loaded.etag) {
        return status('BLOCKED', { error:'DIRECT_FINAL_REGISTRATION_MISSING' });
      }
      if (!same(rec.registration_hash, hash(registrationToken)) ||
          rec.opportunity_id !== b.opportunity_id ||
          rec.consultant_id !== b.consultant_id ||
          !same(rec.booking_hash, hash(JSON.stringify(b)))) {
        return status('BLOCKED', { error:'DIRECT_FINAL_REGISTRATION_MISMATCH' });
      }
      if (rec.status !== 'REGISTERED') return previously(rec);
      const owner = await lockedOwner(input);
      if (!owner || owner.consultant_id !== rec.consultant_id ||
          !same(rec.consultant_email_hash, hash(owner.consultant_delivery_email))) {
        return status('BLOCKED', { error:'DIRECT_FINAL_OWNER_CHANGED' });
      }
      let canonical;
      try { canonical = canonicalJson(input.consultant_sot_json); }
      catch { return status('BLOCKED', { error:'DIRECT_FINAL_SOT_INVALID' }); }
      if (!same(rec.sot_hash, hash(canonical))) {
        return status('BLOCKED', { error:'DIRECT_FINAL_SOT_CHANGED' });
      }
      let delivery;
      try {
        delivery = buildConsultantFinalDelivery({
          consultant_delivery_email: owner.consultant_delivery_email,
          consultant_first_name: text(input?.consultant_first_name),
          company: b.company,
          prospect_first_name: b.prospect_first_name,
          meeting_time: b.meeting_time,
          final_brief_markdown: input.final_brief_markdown,
          opportunity_id: b.opportunity_id
        });
      } catch {
        return status('BLOCKED', { error:'DIRECT_FINAL_DELIVERY_INVALID' });
      }
      const claimToken = randomBytes(32).toString('hex');
      const next = {
        ...rec, status: 'RESERVED',
        claim_hash: hash(claimToken),
        final_hash: hash(text(input.final_brief_markdown)),
        reserved_at: new Date(now).toISOString()
      };
      try { await storage.putJson(receiptPath(b.opportunity_id), next, { ifMatch:loaded.etag }); }
      catch { return status('RECONCILIATION_REQUIRED', { error:'DIRECT_FINAL_CLAIM_UNCERTAIN' }); }
      return status('CLAIMED', {
        opportunity_id: b.opportunity_id,
        consultant_delivery_email: owner.consultant_delivery_email,
        subject: delivery.subject,
        html_body: escapedEmail(delivery.text_body),
        claim_token: claimToken
      });
    },


    // A prospect's clarification invitation is distinct from the consultant's
    // FINAL brief. Both are gated by one immutable booking registration.
    async claimInvite(input, { now=Date.now() } = {}) {
      const b=normalizeBooking(input),regToken=text(input?.registration_token);
      const inviteUrl=text(input?.invite_url);
      if (!b || !TOKEN.test(regToken) || input?.status !== 'READY' ||
          input?.requires_clarification !== true ||
          !inviteUrl || inviteUrl.length > 4096 ||
          !clarificationRepository?.resolveInvite || !inviteBaseUrl) {
        return status('BLOCKED',{error:'INVITE_CLAIM_INPUT_INVALID'});
      }
      let token;
      try {
        const base=new URL(inviteBaseUrl),url=new URL(inviteUrl);
        const fields=new URLSearchParams(url.hash.slice(1));
        token=fields.get('invite');
        if (base.protocol!=='https:' || url.protocol!=='https:' ||
            url.origin!==base.origin || url.pathname!==base.pathname ||
            url.search || url.username || url.password || fields.size!==1 ||
            !token || token.length>256) {
          return status('BLOCKED',{error:'INVITE_URL_INVALID'});
        }
      } catch { return status('BLOCKED',{error:'INVITE_URL_INVALID'}); }

      let loaded;
      try { loaded=await get(b.opportunity_id); }
      catch { return status('BLOCKED',{error:'INVITE_READ_FAILED'}); }
      const rec=loaded?.value;
      if (!validRecord(rec) || !loaded.etag ||
          !same(rec.registration_hash,hash(regToken)) ||
          rec.opportunity_id!==b.opportunity_id ||
          rec.consultant_id!==b.consultant_id ||
          !same(rec.booking_hash,hash(JSON.stringify(b)))) {
        return status('BLOCKED',{error:'INVITE_REGISTRATION_MISMATCH'});
      }
      if (rec.status!=='REGISTERED') return previously(rec);
      const owner=await lockedOwner(input);
      if (!owner || owner.consultant_id!==rec.consultant_id ||
          !same(rec.consultant_email_hash,hash(owner.consultant_delivery_email))) {
        return status('BLOCKED',{error:'INVITE_OWNER_CHANGED'});
      }
      let sot,firstName;
      try {
        sot=canonicalJson(input.consultant_sot_json);
        firstName=text(JSON.parse(sot)?.consultant?.consultant_name).split(/\s+/)[0];
      } catch { return status('BLOCKED',{error:'INVITE_SOT_INVALID'}); }
      if (!firstName || !same(rec.sot_hash,hash(sot))) {
        return status('BLOCKED',{error:'INVITE_SOT_CHANGED'});
      }

      // Consult the stored, still-active invite rather than trusting the URL
      // generated by Make. Resolve rejects revoked, expired, replaced tokens.
      let resolved;
      try { resolved=await clarificationRepository.resolveInvite(token,{now}); }
      catch { return status('BLOCKED',{error:'INVITE_LOOKUP_FAILED'}); }
      const pkg=resolved?.envelope?.package;
      if (!resolved?.ok || pkg?.status!=='OPEN' ||
          pkg.opportunity_id!==b.opportunity_id ||
          pkg.consultant?.consultant_id!==b.consultant_id ||
          pkg.consultant?.first_name!==firstName ||
          pkg.prospect?.first_name!==b.prospect_first_name ||
          pkg.prospect?.company!==b.company ||
          !Array.isArray(pkg.questions) || pkg.questions.length===0) {
        return status('BLOCKED',{error:'INVITE_PACKAGE_MISMATCH'});
      }
      let email;
      try {
        email=buildProspectClarificationDelivery({
          opportunity_id:b.opportunity_id,
          prospect_email:b.prospect_email,
          prospect_first_name:b.prospect_first_name,
          consultant_first_name:firstName,
          question_count:pkg.questions.length,
          invite_url:inviteUrl,
          expires_at:resolved.invite?.expires_at
        });
      } catch { return status('BLOCKED',{error:'INVITE_EMAIL_INVALID'}); }
      const claimToken=randomBytes(32).toString('hex');
      try {
        await storage.putJson(receiptPath(b.opportunity_id),{
          ...rec,status:'INVITE_RESERVED',
          claim_hash:hash(claimToken),
          invite_hash:hash(inviteUrl),
          reserved_at:new Date(now).toISOString()
        },{ifMatch:loaded.etag});
      } catch {
        return status('RECONCILIATION_REQUIRED',{error:'INVITE_CLAIM_UNCERTAIN'});
      }
      // Invite target is already verified against the private package above.
      // Escape HTML attributes independently of email prose to prevent markup
      // injection without sacrificing a clickable link to the narrative form.
      const href=inviteUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return status('CLAIMED',{
        prospect_email:b.prospect_email,
        subject:email.subject,
        html_body:escapedEmail(email.text_body)
          + '<p><a href="' + href
          + '" rel="noopener noreferrer">Answer the quick questions</a></p>',
        claim_token:claimToken
      });
    },

    async acknowledgeInvite(input, { now=Date.now() } = {}) {
      const id=text(input?.opportunity_id),token=text(input?.claim_token),
        messageId=text(input?.provider_message_id);
      if (!VALID_ID.test(id) || !TOKEN.test(token) ||
          !messageId || messageId.length>256) {
        return status('BLOCKED',{error:'INVITE_ACK_INVALID'});
      }
      let loaded;
      try { loaded=await get(id); }
      catch { return status('BLOCKED',{error:'INVITE_ACK_READ_FAILED'}); }
      const rec=loaded?.value;
      if (!validRecord(rec) || !loaded.etag ||
          !rec.claim_hash || !same(rec.claim_hash,hash(token))) {
        return status('BLOCKED',{error:'INVITE_CLAIM_INVALID'});
      }
      if (rec.status==='INVITE_SENT') {
        return rec.provider_message_id===messageId
          ? status('ACKNOWLEDGED',{reused:true})
          : status('BLOCKED',{error:'INVITE_ACK_MISMATCH'});
      }
      if (rec.status!=='INVITE_RESERVED') {
        return status('BLOCKED',{error:'INVITE_NOT_RESERVED'});
      }
      try {
        await storage.putJson(receiptPath(id),{
          ...rec,status:'INVITE_SENT',
          provider_message_id:messageId,
          sent_at:new Date(now).toISOString()
        },{ifMatch:loaded.etag});
      } catch {
        return status('RECONCILIATION_REQUIRED',{error:'INVITE_ACK_UNCERTAIN'});
      }
      return status('ACKNOWLEDGED',{reused:false});
    },

    async acknowledge(input, { now=Date.now() } = {}) {
      const id = text(input?.opportunity_id), token = text(input?.claim_token);
      const messageId = text(input?.provider_message_id);
      if (!VALID_ID.test(id) || !TOKEN.test(token) ||
          !messageId || messageId.length > 256) {
        return status('BLOCKED', { error:'DIRECT_FINAL_ACK_INVALID' });
      }
      let loaded;
      try { loaded = await get(id); }
      catch { return status('BLOCKED', { error:'DIRECT_FINAL_ACK_READ_FAILED' }); }
      const rec = loaded?.value;
      if (!validRecord(rec) || !loaded.etag ||
          !rec.claim_hash || !same(rec.claim_hash, hash(token))) {
        return status('BLOCKED', { error:'DIRECT_FINAL_CLAIM_INVALID' });
      }
      if (rec.status === 'SENT') {
        return rec.provider_message_id === messageId
          ? status('ACKNOWLEDGED', { reused:true })
          : status('BLOCKED', { error:'DIRECT_FINAL_ACK_MISMATCH' });
      }
      if (rec.status !== 'RESERVED') {
        return status('BLOCKED', { error:'DIRECT_FINAL_NOT_RESERVED' });
      }
      try {
        await storage.putJson(receiptPath(id), {
          ...rec, status:'SENT',
          provider_message_id:messageId,
          sent_at:new Date(now).toISOString()
        }, { ifMatch:loaded.etag });
      } catch {
        return status('RECONCILIATION_REQUIRED', { error:'DIRECT_FINAL_ACK_UNCERTAIN' });
      }
      return status('ACKNOWLEDGED', { reused:false });
    }
  };
}
