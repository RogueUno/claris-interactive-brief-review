export const SESSION_SCHEMA_VERSION = 'claris_calibration_session_v1';

export function readOpaqueInviteToken(locationLike = globalThis.location) {
  try {
    const url = new URL(locationLike.href);
    const token = String(url.searchParams.get('invite') || '').trim();
    return token || null;
  } catch {
    return null;
  }
}

export function assertOpaqueInviteToken(token) {
  const value = String(token || '').trim();
  if (!value) return { ok: false, error: 'INVITE_TOKEN_MISSING' };
  if (value.length < 20) return { ok: false, error: 'INVITE_TOKEN_TOO_SHORT' };
  if (/[@\s]/.test(value)) return { ok: false, error: 'INVITE_TOKEN_MUST_NOT_CONTAIN_PII_OR_WHITESPACE' };
  return { ok: true, token: value };
}

export function productionSessionEnvelope({ consultantId, sessionId, inviteTokenHash, status = 'IN_PROGRESS' }) {
  if (!consultantId) throw new Error('CONSULTANT_ID_REQUIRED');
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  if (!inviteTokenHash) throw new Error('INVITE_TOKEN_HASH_REQUIRED');
  return {
    session_schema_version: SESSION_SCHEMA_VERSION,
    consultant_id: consultantId,
    session_id: sessionId,
    invite_token_hash: inviteTokenHash,
    status
  };
}
