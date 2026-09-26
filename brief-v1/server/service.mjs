import { validateBriefForDelivery } from './delivery-validator.mjs';
import { signBriefSession, verifyBriefSession } from './crypto.mjs';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function validateBriefPayload(payload, validationContext) {
  return validateBriefForDelivery(payload, validationContext);
}

export function createBriefService({ repository, sessionSecret }) {
  if (!repository) throw new Error('BRIEF_REPOSITORY_REQUIRED');
  if (String(sessionSecret || '').length < 32) throw new Error('SESSION_SECRET_MIN_32_CHARS');
  return {
    async create(input, { now = Date.now() } = {}) {
      const valid = validateBriefPayload(input?.payload, input?.validationContext);
      if (!valid.ok) return valid;
      const { validationContext, ...persisted } = input || {};
      return repository.create({ ...persisted, now });
    },

    async resolve(token, { now = Date.now() } = {}) {
      const resolved = await repository.resolveToken(token, { now });
      if (!resolved.ok) return resolved;
      const briefExpiry = Date.parse(resolved.brief.expires_at);
      const expiresAt = Math.min(now + SESSION_TTL_MS, briefExpiry);
      const session_token = signBriefSession({ brief_id: resolved.brief.brief_id, issued_at: now, expires_at: expiresAt }, sessionSecret);
      return {
        ok: true,
        session_token,
        session_expires_at: expiresAt,
        brief: publicMetadata(resolved.brief)
      };
    },

    async load(sessionToken, { now = Date.now() } = {}) {
      const auth = verifyBriefSession(sessionToken, sessionSecret, { now });
      if (!auth.ok) return auth;
      const loaded = await repository.loadBrief(auth.payload.brief_id, { now });
      if (!loaded.ok) return loaded;
      return { ok: true, brief: { ...publicMetadata(loaded.brief), payload: loaded.brief.payload } };
    },

    async revoke(briefId, { now = Date.now() } = {}) {
      return repository.revoke(briefId, { now });
    }
  };
}

function publicMetadata(brief) {
  return {
    brief_id: brief.brief_id,
    company: brief.company,
    created_at: brief.created_at,
    expires_at: brief.expires_at,
    status: brief.status
  };
}
