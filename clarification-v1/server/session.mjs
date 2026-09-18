import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PURPOSE = 'claris_prospect_clarification_v1';

export function createClarificationToken(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 24) throw new Error('OPAQUE_TOKEN_MIN_24_BYTES');
  return randomBytes(bytes).toString('base64url');
}

export function hashClarificationToken(token) {
  const value = String(token || '').trim();
  if (!value) throw new Error('TOKEN_REQUIRED');
  return createHash('sha256').update(value).digest('base64url');
}

function signature(payloadPart, secret) {
  return createHmac('sha256', secret).update(`${PURPOSE}.${payloadPart}`).digest('base64url');
}

export function signClarificationSession(payload, secret) {
  const key = String(secret || '');
  if (key.length < 32) throw new Error('SESSION_SECRET_MIN_32_CHARS');
  const body = Buffer.from(JSON.stringify({ ...payload, purpose: PURPOSE })).toString('base64url');
  return `${body}.${signature(body, key)}`;
}

export function verifyClarificationSession(token, secret, { now = Date.now() } = {}) {
  const key = String(secret || '');
  if (key.length < 32) return { ok: false, error: 'SESSION_SECRET_INVALID' };
  const [body, supplied, extra] = String(token || '').split('.');
  if (!body || !supplied || extra) return { ok: false, error: 'SESSION_TOKEN_MALFORMED' };
  const expected = signature(body, key);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: 'SESSION_TOKEN_INVALID_SIGNATURE' };

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload?.purpose !== PURPOSE) return { ok: false, error: 'SESSION_PURPOSE_INVALID' };
    if (!payload?.opportunity_id) return { ok: false, error: 'SESSION_OPPORTUNITY_MISSING' };
    if (!Number.isFinite(payload?.expires_at) || payload.expires_at <= now) return { ok: false, error: 'SESSION_EXPIRED' };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'SESSION_TOKEN_INVALID_PAYLOAD' };
  }
}
