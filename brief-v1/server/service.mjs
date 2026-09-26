import { validateBriefForDelivery } from './delivery-validator.mjs';
import { derivePublicationIdentity, signBriefSession, verifyBriefSession } from './crypto.mjs';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function validateBriefPayload(payload, validationContext) {
  return validateBriefForDelivery(payload, validationContext);
}

export function createBriefService({ repository, sessionSecret }) {
  if (!repository) throw new Error('BRIEF_REPOSITORY_REQUIRED');
  if (String(sessionSecret || '').length < 32) throw new Error('SESSION_SECRET_MIN_32_CHARS');

  async function createValidated(input, { now = Date.now(), identity = null } = {}) {
    const valid = validateBriefPayload(input?.payload, input?.validationContext);
    if (!valid.ok) return valid;
    const { validationContext, opportunityId, ...persisted } = input || {};
    return repository.create({ ...persisted, identity, now });
  }

  return {
    async create(input, { now = Date.now() } = {}) {
      return createValidated(input, { now });
    },

    async publish(input, { now = Date.now() } = {}) {
      const opportunityId = String(input?.opportunityId || '').trim();
      if (!opportunityId) return { ok: false, error: 'OPPORTUNITY_ID_REQUIRED' };

      const valid = validateBriefPayload(input?.payload, input?.validationContext);
      if (!valid.ok) return valid;

      const identity = derivePublicationIdentity({
        opportunityId,
        consultantId: input?.consultantId,
        company: input?.company,
        payload: input?.payload,
        validationContext: input?.validationContext
      }, sessionSecret);

      const created = await createValidated(input, { now, identity });
      if (!created?.brief) return created;

      if (created.brief.status !== 'ACTIVE') {
        return {
          ok: false,
          error: created.brief.status === 'REVOKED'
            ? 'BRIEF_PUBLICATION_REVOKED'
            : 'BRIEF_PUBLICATION_NOT_ACTIVE',
          publication_id: identity.publication_id
        };
      }
      if (Date.parse(created.brief.expires_at) <= now) {
        return {
          ok: false,
          error: 'BRIEF_PUBLICATION_EXPIRED',
          publication_id: identity.publication_id
        };
      }

      return {
        ...created,
        publication_id: identity.publication_id
      };
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
    publication_id: brief.publication_id || null,
    company: brief.company,
    created_at: brief.created_at,
    expires_at: brief.expires_at,
    status: brief.status,
    context: brief.context || null
  };
}
