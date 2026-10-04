import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { buildRuntimeV3Export } from '../../calibration-v3/server/runtime-export.mjs';

const VERSION = 'claris_brief_notification_receipt_v1';
const EMAIL_KIND = 'CONSULTANT_BRIEF_READY';

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function equal(a, b) {
  const left = Buffer.from(text(a));
  const right = Buffer.from(text(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
function validEmail(value) {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
function validId(value) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(text(value));
}
function receiptPath(publicationId) {
  if (!validId(publicationId)) throw new Error('BRIEF_NOTIFICATION_ID_INVALID');
  return 'claris/brief-notifications/' + publicationId + '.json';
}
function answer(status, properties = {}) {
  return {
    ok: ['CLAIMED', 'ACKNOWLEDGED', 'SKIPPED_ALREADY_SENT'].includes(status),
    status,
    ...properties
  };
}
function existingReceipt(value) {
  if (value == null) return null;
  if (value.schema_version !== VERSION || !['RESERVED', 'SENT'].includes(value.status)) {
    return { status: 'INVALID' };
  }
  return value;
}

export function createBriefNotificationOutbox({
  storage,
  briefRepository,
  consultantRepository,
  baseUrl
} = {}) {
  if (!storage?.getJsonWithMeta || !storage?.putJsonIfAbsent || !storage?.putJson ||
      !briefRepository?.loadBrief || !briefRepository?.resolveToken ||
      !consultantRepository?.loadIdentity || !consultantRepository?.loadProfileEnvelopeWithMeta) {
    throw new Error('BRIEF_NOTIFICATION_DEPENDENCIES_REQUIRED');
  }
  const expectedBaseUrl = text(baseUrl);
  if (!expectedBaseUrl) throw new Error('BRIEF_NOTIFICATION_BASE_URL_REQUIRED');

  async function ownerFor(brief, candidate) {
    if (!brief || brief.status !== 'ACTIVE' || brief.consultant_id !== candidate.consultant_id) {
      return null;
    }
    const [identity, profile] = await Promise.all([
      consultantRepository.loadIdentity(brief.consultant_id),
      consultantRepository.loadProfileEnvelopeWithMeta(brief.consultant_id)
    ]);
    const runtime = buildRuntimeV3Export(profile?.envelope, profile?.etag);
    if (!runtime.ok || runtime.consultant_id !== brief.consultant_id ||
        identity?.consultant_id !== brief.consultant_id) {
      return null;
    }
    const email = validEmail(identity.delivery_email);
    if (!email || email !== validEmail(candidate.consultant_delivery_email)) return null;
    return email;
  }

  async function verifiedPublication(input) {
    const publicationId = text(input?.publication_id);
    const expectedKey = EMAIL_KIND + ':' + publicationId;
    if (!validId(publicationId) ||
        input?.notification_dedupe_key !== expectedKey ||
        text(input?.brief_id) !== publicationId ||
        !text(input?.consultant_id) ||
        !validEmail(input?.consultant_delivery_email)) {
      return { ok: false, error: 'BRIEF_NOTIFICATION_INPUT_INVALID' };
    }
    let suppliedUrl, expectedBase;
    try {
      suppliedUrl = new URL(text(input?.brief_url));
      expectedBase = new URL(expectedBaseUrl);
    } catch {
      return { ok: false, error: 'BRIEF_NOTIFICATION_URL_INVALID' };
    }
    if (suppliedUrl.protocol !== 'https:' ||
        suppliedUrl.origin !== expectedBase.origin ||
        suppliedUrl.pathname !== expectedBase.pathname ||
        suppliedUrl.search !== expectedBase.search ||
        suppliedUrl.username || suppliedUrl.password) {
      return { ok: false, error: 'BRIEF_NOTIFICATION_URL_INVALID' };
    }
    const params = new URLSearchParams(suppliedUrl.hash.slice(1));
    const token = params.get('brief');
    if (!token || [...params.keys()].length !== 1) {
      return { ok: false, error: 'BRIEF_NOTIFICATION_TOKEN_INVALID' };
    }

    let published, resolved;
    try {
      [published, resolved] = await Promise.all([
        briefRepository.loadBrief(publicationId),
        briefRepository.resolveToken(token)
      ]);
    } catch {
      return { ok: false, error: 'BRIEF_NOTIFICATION_PUBLICATION_READ_FAILED' };
    }
    if (!published.ok || !resolved.ok ||
        published.brief.publication_id !== publicationId ||
        resolved.brief.brief_id !== publicationId ||
        resolved.brief.publication_id !== publicationId) {
      return { ok: false, error: 'BRIEF_NOTIFICATION_PUBLICATION_INVALID' };
    }
    let recipient;
    try {
      recipient = await ownerFor(published.brief, input);
    } catch {
      return { ok: false, error: 'BRIEF_NOTIFICATION_OWNER_LOOKUP_FAILED' };
    }
    if (!recipient) return { ok: false, error: 'BRIEF_NOTIFICATION_OWNER_MISMATCH' };
    return {
      ok: true,
      publicationId,
      recipient,
      briefId: published.brief.brief_id,
      consultantId: published.brief.consultant_id
    };
  }

  async function checkExisting(publicationId) {
    const result = await storage.getJsonWithMeta(receiptPath(publicationId));
    if (result.value == null) return null;
    const record = existingReceipt(result.value);
    if (record.status === 'INVALID') {
      return answer('BLOCKED', { error: 'BRIEF_NOTIFICATION_RECEIPT_INVALID' });
    }
    return record.status === 'SENT'
      ? answer('SKIPPED_ALREADY_SENT')
      : answer('RECONCILIATION_REQUIRED', {
        error: 'BRIEF_NOTIFICATION_SEND_OUTCOME_UNKNOWN'
      });
  }

  return {
    async claim(input, { now = Date.now() } = {}) {
      const verified = await verifiedPublication(input);
      if (!verified.ok) return answer('BLOCKED', { error: verified.error });
      let already;
      try { already = await checkExisting(verified.publicationId); }
      catch { return answer('BLOCKED', { error: 'BRIEF_NOTIFICATION_READ_FAILED' }); }
      if (already) return already;

      const token = randomBytes(32).toString('hex');
      const receipt = {
        schema_version: VERSION,
        publication_id: verified.publicationId,
        consultant_id: verified.consultantId,
        email_hash: digest(verified.recipient),
        status: 'RESERVED',
        claim_hash: digest(token),
        reserved_at: new Date(now).toISOString(),
        sent_at: null,
        provider_message_id: null
      };
      try {
        // This create-only operation, not the preceding read, is the
        // concurrency gate. A duplicate write must not authorize a second send.
        await storage.putJsonIfAbsent(receiptPath(verified.publicationId), receipt);
      } catch {
        let observed = null;
        try { observed = await checkExisting(verified.publicationId); } catch {}
        return observed || answer('BLOCKED', {
          error: 'BRIEF_NOTIFICATION_RESERVATION_UNCERTAIN'
        });
      }
      return answer('CLAIMED', {
        publication_id: verified.publicationId,
        consultant_delivery_email: verified.recipient,
        claim_token: token
      });
    },

    async acknowledge(input, { now = Date.now() } = {}) {
      const id = text(input?.publication_id);
      const token = text(input?.claim_token);
      const messageId = text(input?.provider_message_id);
      if (!validId(id) || !/^[a-f0-9]{64}$/i.test(token) ||
          !messageId || messageId.length > 256) {
        return answer('BLOCKED', { error: 'BRIEF_NOTIFICATION_ACK_INVALID' });
      }
      let loaded;
      try { loaded = await storage.getJsonWithMeta(receiptPath(id)); }
      catch { return answer('BLOCKED', { error: 'BRIEF_NOTIFICATION_ACK_READ_FAILED' }); }
      const current = existingReceipt(loaded?.value);
      if (!current || current.status === 'INVALID' || !loaded.etag ||
          !equal(current.claim_hash, digest(token)) ||
          current.publication_id !== id) {
        return answer('BLOCKED', { error: 'BRIEF_NOTIFICATION_CLAIM_INVALID' });
      }
      if (current.status === 'SENT') {
        return current.provider_message_id === messageId
          ? answer('ACKNOWLEDGED', { reused: true })
          : answer('BLOCKED', { error: 'BRIEF_NOTIFICATION_MESSAGE_CONFLICT' });
      }
      try {
        await storage.putJson(receiptPath(id), {
          ...current,
          status: 'SENT',
          sent_at: new Date(now).toISOString(),
          provider_message_id: messageId
        }, { ifMatch: loaded.etag });
      } catch {
        return answer('RECONCILIATION_REQUIRED', {
          error: 'BRIEF_NOTIFICATION_ACK_UNCERTAIN'
        });
      }
      return answer('ACKNOWLEDGED', { reused: false });
    }
  };
}
