import { createOpaqueToken, hashOpaqueToken } from './crypto.mjs';

const INVITE_VERSION = 'claris_invite_v1';
const IDENTITY_VERSION = 'claris_consultant_identity_v1';
const ENVELOPE_VERSION = 'claris_persisted_profile_v1';

function assertConsultantId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(id)) throw new Error('INVALID_CONSULTANT_ID');
  return id;
}

function cloneSeedState(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVITE_SEED_INVALID');
  return JSON.parse(JSON.stringify(value));
}

function invitePath(hash) { return `claris/invites/${hash}.json`; }
function identityPath(id) { return `claris/consultants/${assertConsultantId(id)}/identity.json`; }
function profilePath(id) { return `claris/consultants/${assertConsultantId(id)}/profile.json`; }

async function getJsonWithMeta(storage, pathname) {
  if (typeof storage.getJsonWithMeta === 'function') {
    return storage.getJsonWithMeta(pathname);
  }
  return { value: await storage.getJson(pathname), etag: null };
}

export function createProfileRepository(storage) {
  if (!storage?.getJson || !storage?.putJson) throw new Error('JSON_STORAGE_ADAPTER_REQUIRED');

  return {
    async createInvite(identity, { now = Date.now(), ttlMs = 14 * 24 * 60 * 60 * 1000, seedState = null } = {}) {
      const consultantId = assertConsultantId(identity?.consultant_id);
      const firstName = String(identity?.first_name || '').trim();
      const fullName = String(identity?.full_name || '').trim();
      const firm = String(identity?.firm || '').trim();
      const deliveryEmail = String(identity?.delivery_email || '').trim().toLowerCase();
      if (!firstName || !fullName || !firm) throw new Error('INVITE_IDENTITY_INCOMPLETE');
      if (deliveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryEmail)) {
        throw new Error('INVALID_CONSULTANT_DELIVERY_EMAIL');
      }
      if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('INVITE_TTL_INVALID');
      const approvedSeedState = cloneSeedState(seedState);

      const token = createOpaqueToken(32);
      const tokenHash = hashOpaqueToken(token);
      const invite = {
        schema_version: INVITE_VERSION,
        token_hash: tokenHash,
        consultant_id: consultantId,
        status: 'ACTIVE',
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + ttlMs).toISOString(),
        last_resolved_at: null,
        identity: {
          consultant_id: consultantId,
          first_name: firstName,
          full_name: fullName,
          firm,
          ...(deliveryEmail ? { delivery_email: deliveryEmail } : {})
        },
        seed_state: approvedSeedState
      };
      await storage.putJson(invitePath(tokenHash), invite);
      return { token, invite };
    },

    async resolveInvite(token, { now = Date.now() } = {}) {
      let hash;
      try { hash = hashOpaqueToken(token); } catch { return { ok: false, error: 'INVITE_TOKEN_REQUIRED' }; }
      const invite = await storage.getJson(invitePath(hash));
      if (!invite || invite.schema_version !== INVITE_VERSION) return { ok: false, error: 'INVITE_NOT_FOUND' };
      if (invite.status !== 'ACTIVE') return { ok: false, error: 'INVITE_NOT_ACTIVE' };
      const expiry = Date.parse(invite.expires_at);
      if (!Number.isFinite(expiry) || expiry <= now) return { ok: false, error: 'INVITE_EXPIRED' };

      const resolved = { ...invite, last_resolved_at: new Date(now).toISOString() };
      await storage.putJson(invitePath(hash), resolved);
      await storage.putJson(identityPath(invite.consultant_id), {
        schema_version: IDENTITY_VERSION,
        ...invite.identity,
        updated_at: new Date(now).toISOString()
      });
      return { ok: true, invite: resolved };
    },

    async loadIdentity(consultantId) {
      const identity = await storage.getJson(identityPath(consultantId));
      return identity?.schema_version === IDENTITY_VERSION ? identity : null;
    },

    async loadProfileEnvelope(consultantId) {
      const envelope = await storage.getJson(profilePath(consultantId));
      return envelope?.schema_version === ENVELOPE_VERSION ? envelope : null;
    },

    async loadProfileEnvelopeWithMeta(consultantId) {
      const result = await getJsonWithMeta(storage, profilePath(consultantId));
      const envelope = result.value?.schema_version === ENVELOPE_VERSION ? result.value : null;
      return { envelope, etag: envelope ? (result.etag || null) : null };
    },

    async saveProfileEnvelope(consultantId, envelope) {
      const id = assertConsultantId(consultantId);
      const value = { ...envelope, schema_version: ENVELOPE_VERSION, consultant_id: id };
      await storage.putJson(profilePath(id), value);
      return value;
    },

    async saveProfileEnvelopeWithMeta(consultantId, envelope, { ifMatch = null } = {}) {
      const id = assertConsultantId(consultantId);
      const pathname = profilePath(id);
      const value = { ...envelope, schema_version: ENVELOPE_VERSION, consultant_id: id };
      const saved = await storage.putJson(pathname, value, { ifMatch });

      if (saved?.etag) {
        return { envelope: value, etag: saved.etag };
      }

      const confirmed = await getJsonWithMeta(storage, pathname);
      return {
        envelope: confirmed.value?.schema_version === ENVELOPE_VERSION ? confirmed.value : value,
        etag: confirmed.etag || null
      };
    }
  };
}

export const repositoryPaths = Object.freeze({ invitePath, identityPath, profilePath });
