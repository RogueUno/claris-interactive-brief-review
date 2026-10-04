import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifyLockedDeliveryOwner } from '../../clarification-v1/server/verify-locked-delivery-owner.mjs';
import { buildConsultantFinalDelivery } from './pilot-delivery.mjs';

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
    ok: ['REGISTERED', 'CLAIMED', 'ACKNOWLEDGED', 'SKIPPED_ALREADY_SENT'].includes(name),
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
      !Number.isFinite(Date.parse(b.meeting_time))) {
    return null;
  }
  try {
    const url = new URL(b.domain);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/') return null;
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
function escapedEmail(value) {
  return '<div style="white-space:pre-wrap;font-family:Arial,sans-serif">' +
    text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;') + '</div>';
}
function validRecord(record) {
  if (!record || record.schema_version !== VERSION ||
      !['REGISTERED','RESERVED','SENT'].includes(record.status)) {
    return false;
  }
  return TOKEN.test(record.registration_hash) &&
    VALID_ID.test(record.opportunity_id) &&
    /^[a-f0-9]{64}$/.test(record.booking_hash) &&
    /^[a-f0-9]{64}$/.test(record.sot_hash);
}
function previously(record) {
  if (!validRecord(record)) return status('BLOCKED', { error:'DIRECT_FINAL_RECEIPT_INVALID' });
  return record.status === 'SENT'
    ? status('SKIPPED_ALREADY_SENT')
    : status('RECONCILIATION_REQUIRED', {
      error: record.status === 'REGISTERED'
        ? 'DIRECT_FINAL_BOOKING_ALREADY_REGISTERED'
        : 'DIRECT_FINAL_SEND_OUTCOME_UNKNOWN'
    });
}

export function createDirectFinalOutbox({ storage, consultantRepository }) {
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
        claim_hash: null,
        final_hash: null,
        provider_message_id: null,
        registered_at: new Date(now).toISOString(),
        reserved_at: null,
        sent_at: null
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

    async claim(input, { now=Date.now() } = {}) {
      const b = normalizeBooking(input);
      const registrationToken = text(input?.registration_token);
      if (!b || !TOKEN.test(registrationToken)) {
        return status('BLOCKED', { error: 'DIRECT_FINAL_CLAIM_INPUT_INVALID' });
      }
      if (input?.status !== 'FINALIZED' || input?.requires_clarification !== false ||
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
