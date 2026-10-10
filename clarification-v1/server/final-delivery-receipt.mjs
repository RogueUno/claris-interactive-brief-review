import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { renderFinalBrief } from './final-brief-renderer.mjs';
import { buildFinalizeBundle } from './finalize-handoff.mjs';
import { buildConsultantFinalDelivery } from '../../calibration-v3/server/pilot-delivery.mjs';
import { verifyLockedDeliveryOwner } from './verify-locked-delivery-owner.mjs';

const RECEIPT_SCHEMA = 'claris_final_delivery_receipt_v1';

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function hash(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function safeEmailHtml(textBody) {
  // Gmail's rawHtml composer accepts HTML. Never interpolate model text as markup.
  const encoded = text(textBody)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return '<div style="white-space:pre-wrap;font-family:Arial,sans-serif">' + encoded + '</div>';
}
function constantEquals(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length === b.length && timingSafeEqual(a, b);
}
function verifiedAudit(raw) {
  let audit;
  try { audit = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return false; }
  return audit?.audit_status === 'PASS' && audit.repair_required === false &&
    Array.isArray(audit.violations) && audit.violations.length === 0;
}
function isCollision(error) {
  return error?.code === 'BLOB_PRECONDITION_FAILED' ||
    error?.message === 'BLOB_PRECONDITION_FAILED';
}
function safeReceipt(value) {
  if (!value || value.schema_version !== RECEIPT_SCHEMA) return null;
  return {
    status: value.status,
    reserved_at: value.reserved_at,
    sent_at: value.sent_at || null,
    digest: value.digest || null
  };
}
function outcome(status, extras = {}) {
  return { ok: ['ELIGIBLE', 'CLAIMED', 'ACKNOWLEDGED', 'SKIPPED_ALREADY_SENT'].includes(status), status, ...extras };
}
function requiredRepository(repository) {
  if (!repository?.loadEnvelopeWithMeta || !repository?.saveEnvelopeWithMeta) {
    throw new Error('FINAL_DELIVERY_REPOSITORY_REQUIRED');
  }
}

export function inspectFinalDeliveryReceipt(envelope) {
  return safeReceipt(envelope?.final_delivery_receipt);
}

// No automatic expiry or stealing of reserved claims: after a provider send and
// lost acknowledgment, retrying could send twice. Unconfirmed reservations need
// human reconciliation against the provider before any further send attempt.
export async function claimFinalDelivery(input, {
  repository, consultantRepository, now = Date.now()
} = {}) {
  requiredRepository(repository);
  const opportunityId = text(input?.opportunity_id);
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(opportunityId)) {
    return outcome('BLOCKED', { error: 'OPPORTUNITY_ID_INVALID' });
  }
  const markdown = text(input?.final_brief_markdown);
  if (input?.status !== 'FINALIZED' || !markdown || !verifiedAudit(input?.final_audit_json)) {
    return outcome('BLOCKED', { error: 'FINAL_DELIVERY_NOT_CERTIFIED' });
  }

  let loaded;
  try { loaded = await repository.loadEnvelopeWithMeta(opportunityId); }
  catch { return outcome('BLOCKED', { error: 'FINAL_DELIVERY_READ_FAILED' }); }
  if (!loaded?.envelope) return outcome('BLOCKED', { error: 'CLARIFICATION_NOT_FOUND' });
  if (!loaded.etag) return outcome('BLOCKED', { error: 'FINAL_DELIVERY_ATOMIC_WRITE_UNAVAILABLE' });

  const existing = inspectFinalDeliveryReceipt(loaded.envelope);
  if (existing) {
    return outcome(existing.status === 'SENT' ? 'SKIPPED_ALREADY_SENT' : 'RECONCILIATION_REQUIRED', {
      error: existing.status === 'SENT' ? null : 'FINAL_DELIVERY_OUTCOME_UNKNOWN'
    });
  }
  if (loaded.envelope?.final_delivery_receipt) {
    return outcome('BLOCKED', { error: 'FINAL_DELIVERY_RECEIPT_INVALID' });
  }

  const context = buildFinalizeBundle(loaded.envelope, loaded.etag);
  if (!context.ok || context.status !== 'SUBMITTED' ||
      !context.consultant_id || !context.consultant_delivery_email) {
    return outcome('BLOCKED', { error: 'FINAL_DELIVERY_OWNER_OR_SUBMISSION_INVALID' });
  }
  let owner;
  try {
    owner = await verifyLockedDeliveryOwner(context, { repository: consultantRepository });
  } catch {
    return outcome('BLOCKED', { error: 'FINAL_DELIVERY_OWNER_REVALIDATION_FAILED' });
  }
  const digest = hash(JSON.stringify({
    opportunity_id: opportunityId,
    version: context.opportunity_version,
    consultant_id: owner.consultant_id,
    email: owner.consultant_delivery_email,
    brief: markdown
  }));
  const deliveryPackage = buildConsultantFinalDelivery({
    consultant_delivery_email: owner.consultant_delivery_email,
    consultant_first_name: loaded.envelope.package?.consultant?.first_name,
    company: loaded.envelope.package?.prospect?.company,
    prospect_first_name: loaded.envelope.package?.prospect?.first_name,
    final_brief_markdown: markdown,
    opportunity_id: opportunityId
  });
  const claimToken = randomBytes(32).toString('hex');
  const record = {
    schema_version: RECEIPT_SCHEMA,
    status: 'RESERVED',
    owner_id: owner.consultant_id,
    destination: owner.consultant_delivery_email,
    digest,
    token_hash: hash(claimToken),
    reserved_at: new Date(now).toISOString(),
    sent_at: null,
    provider_message_id: null,
    // No brief body, prospect answers, or credentials persisted with the receipt.
  };
  try {
    await repository.saveEnvelopeWithMeta(opportunityId, {
      ...loaded.envelope,
      final_delivery_receipt: record
    }, { ifMatch: loaded.etag });
  } catch (error) {
    if (isCollision(error)) return outcome('CLAIM_CONFLICT', { error: 'FINAL_DELIVERY_CONCURRENT_CLAIM' });
    throw error;
  }
  return outcome('CLAIMED', {
    opportunity_id: opportunityId,
    consultant_id: owner.consultant_id,
    consultant_delivery_email: owner.consultant_delivery_email,
    claim_token: claimToken,
    digest,
    email_subject: deliveryPackage.subject,
    email_html: safeEmailHtml(deliveryPackage.text_body)
  });
}

export async function acknowledgeFinalDelivery(input, {
  repository, now = Date.now()
} = {}) {
  requiredRepository(repository);
  const opportunityId = text(input?.opportunity_id);
  const token = text(input?.claim_token);
  const providerMessageId = text(input?.provider_message_id);
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(opportunityId) ||
      !/^[a-f0-9]{64}$/i.test(token) ||
      !providerMessageId || providerMessageId.length > 256) {
    return outcome('BLOCKED', { error: 'FINAL_DELIVERY_ACK_INVALID' });
  }
  const loaded = await repository.loadEnvelopeWithMeta(opportunityId);
  const record = loaded?.envelope?.final_delivery_receipt;
  if (!loaded?.etag) return outcome('BLOCKED', { error: 'FINAL_DELIVERY_ATOMIC_WRITE_UNAVAILABLE' });
  if (!record || record.schema_version !== RECEIPT_SCHEMA ||
      !constantEquals(record.token_hash, hash(token))) {
    return outcome('BLOCKED', { error: 'FINAL_DELIVERY_CLAIM_MISSING' });
  }
  if (record.status === 'SENT') {
    return outcome(record.provider_message_id === providerMessageId
      ? 'ACKNOWLEDGED' : 'BLOCKED', record.provider_message_id === providerMessageId
      ? { reused: true } : { error: 'FINAL_DELIVERY_RECEIPT_CONFLICT' });
  }
  if (record.status !== 'RESERVED') {
    return outcome('RECONCILIATION_REQUIRED', { error: 'FINAL_DELIVERY_OUTCOME_UNKNOWN' });
  }

  const updated = {
    ...record,
    status: 'SENT',
    provider_message_id: providerMessageId,
    sent_at: new Date(now).toISOString()
  };
  try {
    await repository.saveEnvelopeWithMeta(opportunityId, {
      ...loaded.envelope,
      final_delivery_receipt: updated
    }, { ifMatch: loaded.etag });
  } catch (error) {
    if (isCollision(error)) return outcome('ACK_CONFLICT', { error: 'FINAL_DELIVERY_CONCURRENT_ACK' });
    throw error;
  }
  return outcome('ACKNOWLEDGED', { reused: false });
}

export async function checkFinalDeliveryEligibility(input, {
  repository, consultantRepository
} = {}) {
  requiredRepository(repository);
  const opportunityId = text(input?.opportunity_id);
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(opportunityId)) {
    return outcome('BLOCKED', { error: 'OPPORTUNITY_ID_INVALID' });
  }
  let loaded;
  try { loaded = await repository.loadEnvelopeWithMeta(opportunityId); }
  catch { return outcome('BLOCKED', { error: 'FINAL_DELIVERY_READ_FAILED' }); }
  if (!loaded?.envelope) return outcome('BLOCKED', { error: 'CLARIFICATION_NOT_FOUND' });
  if (!loaded.etag) return outcome('BLOCKED', { error: 'FINAL_DELIVERY_ATOMIC_WRITE_UNAVAILABLE' });
  const receipt = inspectFinalDeliveryReceipt(loaded.envelope);
  if (receipt) {
    return outcome(receipt.status === 'SENT' ? 'SKIPPED_ALREADY_SENT' : 'RECONCILIATION_REQUIRED', {
      error: receipt.status === 'SENT' ? null : 'FINAL_DELIVERY_OUTCOME_UNKNOWN'
    });
  }
  if (loaded.envelope.final_delivery_receipt) {
    return outcome('BLOCKED', { error: 'FINAL_DELIVERY_RECEIPT_INVALID' });
  }
  const bundle = buildFinalizeBundle(loaded.envelope, loaded.etag);
  if (!bundle.ok || bundle.status !== 'SUBMITTED' ||
      !bundle.consultant_id || !bundle.consultant_delivery_email) {
    return outcome('BLOCKED', { error: 'FINAL_DELIVERY_OWNER_OR_SUBMISSION_INVALID' });
  }
  try {
    await verifyLockedDeliveryOwner(bundle, { repository: consultantRepository });
  } catch {
    return outcome('BLOCKED', { error: 'FINAL_DELIVERY_OWNER_REVALIDATION_FAILED' });
  }
  return outcome('ELIGIBLE', { opportunity_id: opportunityId });
}

export const finalDeliveryReceiptSchema = RECEIPT_SCHEMA;
