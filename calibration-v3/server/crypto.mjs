import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const b64url = (value) => Buffer.from(value).toString('base64url');

export function createOpaqueToken(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 24) throw new Error('OPAQUE_TOKEN_MIN_24_BYTES');
  return randomBytes(bytes).toString('base64url');
}

export function hashOpaqueToken(token) {
  const value = String(token || '').trim();
  if (!value) throw new Error('TOKEN_REQUIRED');
  return createHash('sha256').update(value).digest('base64url');
}

function sessionSignature(payloadPart, secret) {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

export function signSession(payload, secret) {
  const key = String(secret || '');
  if (key.length < 32) throw new Error('SESSION_SECRET_MIN_32_CHARS');
  const payloadPart = b64url(JSON.stringify(payload));
  return `${payloadPart}.${sessionSignature(payloadPart, key)}`;
}

export function verifySession(token, secret, { now = Date.now() } = {}) {
  const key = String(secret || '');
  if (key.length < 32) return { ok: false, error: 'SESSION_SECRET_INVALID' };
  const raw = String(token || '');
  const [payloadPart, signature, extra] = raw.split('.');
  if (!payloadPart || !signature || extra) return { ok: false, error: 'SESSION_TOKEN_MALFORMED' };
  const expected = sessionSignature(payloadPart, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: 'SESSION_TOKEN_INVALID_SIGNATURE' };
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (!payload?.consultant_id) return { ok: false, error: 'SESSION_CONSULTANT_MISSING' };
    if (!Number.isFinite(payload?.expires_at) || payload.expires_at <= now) return { ok: false, error: 'SESSION_EXPIRED' };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'SESSION_TOKEN_INVALID_PAYLOAD' };
  }
}
