import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_KIND = 'claris_brief_session_v1';
const PUBLICATION_KIND = 'claris_brief_publication_v1';
const b64url = value => Buffer.from(value).toString('base64url');

export function createOpaqueToken(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 24) throw new Error('OPAQUE_TOKEN_MIN_24_BYTES');
  return randomBytes(bytes).toString('base64url');
}

export function hashOpaqueToken(token) {
  const value = String(token || '').trim();
  if (!value) throw new Error('TOKEN_REQUIRED');
  return createHash('sha256').update(value).digest('base64url');
}

function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, stableNormalize(value[key])])
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableNormalize(value));
}

export function derivePublicationIdentity({
  opportunityId,
  consultantId,
  company,
  payload,
  validationContext
}, secret) {
  const key = String(secret || '');
  if (key.length < 32) throw new Error('SESSION_SECRET_MIN_32_CHARS');
  const opportunity_id = String(opportunityId || '').trim();
  if (!opportunity_id) throw new Error('OPPORTUNITY_ID_REQUIRED');

  const canonical = stableJson({
    opportunity_id,
    consultant_id: String(consultantId || '').trim(),
    company: String(company || '').trim(),
    payload,
    validation_context: validationContext
  });
  const fingerprint = createHash('sha256').update(canonical).digest('base64url');
  const namespace = `${opportunity_id}:${fingerprint}`;
  const derive = (label) => createHmac('sha256', key)
    .update(`${PUBLICATION_KIND}:${label}:${namespace}`)
    .digest('base64url');

  const idPart = derive('brief-id').slice(0, 36);
  return {
    publication_id: `pub_${idPart}`,
    brief_id: `pub_${idPart}`,
    token: derive('access-token'),
    fingerprint
  };
}

function signature(payloadPart, secret) {
  return createHmac('sha256', String(secret || ''))
    .update(`${SESSION_KIND}:${payloadPart}`)
    .digest('base64url');
}

export function signBriefSession(payload, secret) {
  const key = String(secret || '');
  if (key.length < 32) throw new Error('SESSION_SECRET_MIN_32_CHARS');
  const body = { ...payload, kind: SESSION_KIND };
  const payloadPart = b64url(JSON.stringify(body));
  return `${payloadPart}.${signature(payloadPart, key)}`;
}

export function verifyBriefSession(token, secret, { now = Date.now() } = {}) {
  const key = String(secret || '');
  if (key.length < 32) return { ok: false, error: 'SESSION_SECRET_INVALID' };
  const [payloadPart, sig, extra] = String(token || '').split('.');
  if (!payloadPart || !sig || extra) return { ok: false, error: 'SESSION_TOKEN_MALFORMED' };
  const expected = signature(payloadPart, key);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: 'SESSION_TOKEN_INVALID_SIGNATURE' };
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (payload?.kind !== SESSION_KIND) return { ok: false, error: 'SESSION_KIND_INVALID' };
    if (!payload?.brief_id) return { ok: false, error: 'SESSION_BRIEF_MISSING' };
    if (!Number.isFinite(payload?.expires_at) || payload.expires_at <= now) return { ok: false, error: 'SESSION_EXPIRED' };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'SESSION_TOKEN_INVALID_PAYLOAD' };
  }
}
