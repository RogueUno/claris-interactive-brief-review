import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_KIND = 'claris_brief_session_v1';
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
