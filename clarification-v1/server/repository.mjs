import { createClarificationToken, hashClarificationToken } from './session.mjs';

const ENVELOPE_VERSION = 'claris_clarification_envelope_v1';
const INVITE_VERSION = 'claris_clarification_invite_v1';

function assertOpportunityId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(id)) throw new Error('OPPORTUNITY_ID_INVALID');
  return id;
}

function storageIfMatch(value) {
  const etag = String(value || '').trim();
  return /^W\//i.test(etag) ? etag.slice(2) : etag;
}

function envelopePath(opportunityId) {
  return `claris/opportunities/${assertOpportunityId(opportunityId)}/clarification/envelope.json`;
}

function invitePath(hash) {
  return `claris/clarification-invites/${hash}.json`;
}

async function getJsonWithMeta(storage, pathname) {
  if (typeof storage.getJsonWithMeta === 'function') return storage.getJsonWithMeta(pathname);
  return { value: await storage.getJson(pathname), etag: null };
}

export function createClarificationRepository(storage) {
  if (!storage?.getJson || !storage?.putJson) throw new Error('JSON_STORAGE_ADAPTER_REQUIRED');

  return {
    async createPackage(pkg, { now = Date.now(), finalizeContext = null } = {}) {
      const opportunityId = assertOpportunityId(pkg?.opportunity_id);
      const existing = await storage.getJson(envelopePath(opportunityId));
      if (existing) throw new Error('OPPORTUNITY_ALREADY_EXISTS');

      let token = null;
      let tokenHash = null;
      if (pkg.status === 'OPEN') {
        token = createClarificationToken(32);
        tokenHash = hashClarificationToken(token);
        await storage.putJson(invitePath(tokenHash), {
          schema_version: INVITE_VERSION,
          token_hash: tokenHash,
          opportunity_id: opportunityId,
          status: 'ACTIVE',
          created_at: new Date(now).toISOString(),
          expires_at: pkg.expires_at,
          last_resolved_at: null
        });
      }

      const envelope = {
        schema_version: ENVELOPE_VERSION,
        opportunity_id: opportunityId,
        package: {
          ...pkg,
          invite_hash: tokenHash
        },
        progress: null,
        response: null,
        finalize_context: finalizeContext || null,
        updated_at: new Date(now).toISOString()
      };
      const saved = await storage.putJson(envelopePath(opportunityId), envelope);
      return { envelope, etag: saved?.etag || null, token };
    },

    async reissueInvite(opportunityId, { now = Date.now(), expiresAt } = {}) {
      const id = assertOpportunityId(opportunityId);
      const loaded = await this.loadEnvelopeWithMeta(id);
      const envelope = loaded.envelope;
      if (!envelope) return { ok: false, error: 'CLARIFICATION_NOT_FOUND' };
      if (envelope.response || envelope.package?.status === 'SUBMITTED') {
        return { ok: false, error: 'CLARIFICATION_ALREADY_SUBMITTED' };
      }
      if (envelope.package?.status !== 'OPEN') return { ok: false, error: 'CLARIFICATION_NOT_OPEN' };

      const expiry = Date.parse(expiresAt);
      if (!Number.isFinite(expiry) || expiry <= now) return { ok: false, error: 'INVITE_EXPIRY_INVALID' };

      const previousHash = envelope.package.invite_hash || null;
      const token = createClarificationToken(32);
      const tokenHash = hashClarificationToken(token);
      await storage.putJson(invitePath(tokenHash), {
        schema_version: INVITE_VERSION,
        token_hash: tokenHash,
        opportunity_id: id,
        status: 'ACTIVE',
        created_at: new Date(now).toISOString(),
        expires_at: new Date(expiry).toISOString(),
        last_resolved_at: null
      });

      const nextEnvelope = {
        ...envelope,
        package: {
          ...envelope.package,
          invite_hash: tokenHash,
          expires_at: new Date(expiry).toISOString()
        },
        updated_at: new Date(now).toISOString()
      };

      let saved;
      try {
        saved = await this.saveEnvelopeWithMeta(id, nextEnvelope, { ifMatch: loaded.etag });
      } catch (error) {
        if (error?.code === 'BLOB_PRECONDITION_FAILED' || error?.message === 'BLOB_PRECONDITION_FAILED') {
          return { ok: false, error: 'CLARIFICATION_CONFLICT' };
        }
        throw error;
      }

      if (previousHash) {
        const previous = await storage.getJson(invitePath(previousHash));
        if (previous?.schema_version === INVITE_VERSION) {
          await storage.putJson(invitePath(previousHash), {
            ...previous,
            status: 'REVOKED',
            revoked_at: new Date(now).toISOString(),
            replaced_by_hash: tokenHash
          });
        }
      }

      return { ok: true, token, envelope: saved.envelope, etag: saved.etag };
    },

    async resolveInvite(token, { now = Date.now() } = {}) {
      let hash;
      try { hash = hashClarificationToken(token); }
      catch { return { ok: false, error: 'INVITE_TOKEN_REQUIRED' }; }

      const invite = await storage.getJson(invitePath(hash));
      if (!invite || invite.schema_version !== INVITE_VERSION) return { ok: false, error: 'INVITE_NOT_FOUND' };
      if (invite.status !== 'ACTIVE') return { ok: false, error: 'INVITE_NOT_ACTIVE' };
      const expiry = Date.parse(invite.expires_at);
      if (!Number.isFinite(expiry) || expiry <= now) return { ok: false, error: 'INVITE_EXPIRED' };

      const loaded = await this.loadEnvelopeWithMeta(invite.opportunity_id);
      if (!loaded.envelope) return { ok: false, error: 'CLARIFICATION_NOT_FOUND' };
      if (loaded.envelope.package?.invite_hash !== hash) return { ok: false, error: 'INVITE_PACKAGE_MISMATCH' };

      await storage.putJson(invitePath(hash), {
        ...invite,
        last_resolved_at: new Date(now).toISOString()
      });
      return { ok: true, invite, envelope: loaded.envelope, etag: loaded.etag };
    },

    async loadEnvelopeWithMeta(opportunityId) {
      const result = await getJsonWithMeta(storage, envelopePath(opportunityId));
      const envelope = result.value?.schema_version === ENVELOPE_VERSION ? result.value : null;
      return { envelope, etag: envelope ? (result.etag || null) : null };
    },

    async saveEnvelopeWithMeta(opportunityId, envelope, { ifMatch = null } = {}) {
      const id = assertOpportunityId(opportunityId);
      const value = { ...envelope, schema_version: ENVELOPE_VERSION, opportunity_id: id };
      const saved = await storage.putJson(envelopePath(id), value, {
        ifMatch: ifMatch ? storageIfMatch(ifMatch) : null
      });
      if (saved?.etag) return { envelope: value, etag: saved.etag };

      const confirmed = await getJsonWithMeta(storage, envelopePath(id));
      return {
        envelope: confirmed.value?.schema_version === ENVELOPE_VERSION ? confirmed.value : value,
        etag: confirmed.etag || null
      };
    }
  };
}

export const clarificationRepositoryPaths = Object.freeze({ envelopePath, invitePath });
