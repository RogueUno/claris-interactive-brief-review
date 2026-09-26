import { createOpaqueToken, hashOpaqueToken } from './crypto.mjs';

const BRIEF_VERSION = 'claris_private_brief_v1';
const ACCESS_VERSION = 'claris_private_brief_access_v1';

const briefPath = id => `claris/briefs/${id}.json`;
const accessPath = hash => `claris/brief-access/${hash}.json`;

function assertId(value, code) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error(code);
  return id;
}
function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }

function compactText(value, max = 200) {
  const result = String(value || '').trim();
  return result ? result.slice(0, max) : null;
}

function normalizeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const context = {
    opportunity_id: compactText(value.opportunity_id, 128),
    prospect_name: compactText(value.prospect_name, 160),
    prospect_role: compactText(value.prospect_role, 160),
    meeting_time: compactText(value.meeting_time, 128)
  };
  return Object.values(context).some(Boolean) ? context : null;
}

function validateCreateInput({ consultantId, company, payload, ttlMs }) {
  const consultant_id = assertId(consultantId, 'INVALID_CONSULTANT_ID');
  const companyName = String(company || '').trim();
  if (!companyName || companyName.length > 160) throw new Error('INVALID_COMPANY');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_BRIEF_PAYLOAD');
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > 512 * 1024) throw new Error('BRIEF_PAYLOAD_TOO_LARGE');
  if (!Number.isFinite(ttlMs) || ttlMs < 3600000 || ttlMs > 30 * 86400000) throw new Error('BRIEF_TTL_INVALID');
  return { consultant_id, companyName };
}

function publicationIdentity(identity) {
  if (!identity) return null;
  const brief_id = assertId(identity.brief_id, 'INVALID_PUBLICATION_BRIEF_ID');
  const publication_id = assertId(identity.publication_id, 'INVALID_PUBLICATION_ID');
  const token = String(identity.token || '').trim();
  const fingerprint = String(identity.fingerprint || '').trim();
  if (token.length < 32) throw new Error('INVALID_PUBLICATION_TOKEN');
  if (!fingerprint) throw new Error('INVALID_PUBLICATION_FINGERPRINT');
  if (publication_id !== brief_id) throw new Error('PUBLICATION_ID_MISMATCH');
  return { brief_id, publication_id, token, fingerprint };
}

export function createBriefRepository(storage) {
  if (!storage?.getJson || !storage?.putJson) throw new Error('JSON_STORAGE_ADAPTER_REQUIRED');
  return {
    async create({
      consultantId,
      company,
      payload,
      context = null,
      identity = null,
      now = Date.now(),
      ttlMs = 7 * 86400000
    }) {
      const { consultant_id, companyName } = validateCreateInput({ consultantId, company, payload, ttlMs });
      const publication = publicationIdentity(identity);
      const briefContext = normalizeContext(context);

      const briefId = publication?.brief_id || createOpaqueToken(24);
      const token = publication?.token || createOpaqueToken(32);
      const tokenHash = hashOpaqueToken(token);
      const existingBrief = publication ? await storage.getJson(briefPath(briefId)) : null;

      if (existingBrief) {
        if (
          existingBrief.schema_version !== BRIEF_VERSION ||
          existingBrief.consultant_id !== consultant_id ||
          existingBrief.company !== companyName ||
          existingBrief.publication_id !== publication.publication_id ||
          existingBrief.publication_fingerprint !== publication.fingerprint
        ) {
          throw new Error('BRIEF_PUBLICATION_COLLISION');
        }

        let currentBrief = existingBrief;
        if (briefContext && existingBrief.status === 'ACTIVE' && Date.parse(existingBrief.expires_at) > now) {
          const mergedContext = {
            ...(existingBrief.context || {}),
            ...Object.fromEntries(Object.entries(briefContext).filter(([, value]) => value != null))
          };
          if (JSON.stringify(mergedContext) !== JSON.stringify(existingBrief.context || {})) {
            currentBrief = { ...existingBrief, context: mergedContext };
            await storage.putJson(briefPath(briefId), currentBrief);
          }
        }

        const existingAccess = await storage.getJson(accessPath(tokenHash));
        if (
          !existingAccess ||
          existingAccess.schema_version !== ACCESS_VERSION ||
          existingAccess.brief_id !== briefId
        ) {
          await storage.putJson(accessPath(tokenHash), {
            schema_version: ACCESS_VERSION,
            token_hash: tokenHash,
            brief_id: briefId,
            publication_id: publication.publication_id,
            status: 'ACTIVE',
            created_at: existingBrief.created_at,
            expires_at: existingBrief.expires_at,
            last_resolved_at: null
          });
        }
        return { token, brief: currentBrief, reused: true };
      }

      const createdAt = new Date(now).toISOString();
      const expiresAt = new Date(now + ttlMs).toISOString();
      const brief = {
        schema_version: BRIEF_VERSION,
        brief_id: briefId,
        consultant_id,
        company: companyName,
        status: 'ACTIVE',
        created_at: createdAt,
        expires_at: expiresAt,
        ...(briefContext ? { context: briefContext } : {}),
        ...(publication ? {
          publication_id: publication.publication_id,
          publication_fingerprint: publication.fingerprint
        } : {}),
        payload: cloneJson(payload)
      };
      const access = {
        schema_version: ACCESS_VERSION,
        token_hash: tokenHash,
        brief_id: briefId,
        ...(publication ? { publication_id: publication.publication_id } : {}),
        status: 'ACTIVE',
        created_at: createdAt,
        expires_at: expiresAt,
        last_resolved_at: null
      };
      await storage.putJson(briefPath(briefId), brief);
      await storage.putJson(accessPath(tokenHash), access);
      return { token, brief, reused: false };
    },

    async resolveToken(token, { now = Date.now() } = {}) {
      let hash;
      try { hash = hashOpaqueToken(token); } catch { return { ok: false, error: 'BRIEF_TOKEN_REQUIRED' }; }
      const access = await storage.getJson(accessPath(hash));
      if (!access || access.schema_version !== ACCESS_VERSION) return { ok: false, error: 'BRIEF_TOKEN_NOT_FOUND' };
      if (access.status !== 'ACTIVE') return { ok: false, error: 'BRIEF_TOKEN_NOT_ACTIVE' };
      if (Date.parse(access.expires_at) <= now) return { ok: false, error: 'BRIEF_EXPIRED' };
      const brief = await storage.getJson(briefPath(access.brief_id));
      if (!brief || brief.schema_version !== BRIEF_VERSION) return { ok: false, error: 'BRIEF_NOT_FOUND' };
      if (brief.status !== 'ACTIVE') return { ok: false, error: 'BRIEF_REVOKED' };
      if (Date.parse(brief.expires_at) <= now) return { ok: false, error: 'BRIEF_EXPIRED' };
      await storage.putJson(accessPath(hash), { ...access, last_resolved_at: new Date(now).toISOString() });
      return { ok: true, brief };
    },

    async loadBrief(briefId, { now = Date.now() } = {}) {
      let id;
      try { id = assertId(briefId, 'INVALID_BRIEF_ID'); } catch { return { ok: false, error: 'INVALID_BRIEF_ID' }; }
      const brief = await storage.getJson(briefPath(id));
      if (!brief || brief.schema_version !== BRIEF_VERSION) return { ok: false, error: 'BRIEF_NOT_FOUND' };
      if (brief.status !== 'ACTIVE') return { ok: false, error: 'BRIEF_REVOKED' };
      if (Date.parse(brief.expires_at) <= now) return { ok: false, error: 'BRIEF_EXPIRED' };
      return { ok: true, brief };
    },

    async revoke(briefId, { now = Date.now() } = {}) {
      const id = assertId(briefId, 'INVALID_BRIEF_ID');
      const brief = await storage.getJson(briefPath(id));
      if (!brief || brief.schema_version !== BRIEF_VERSION) return { ok: false, error: 'BRIEF_NOT_FOUND' };
      if (brief.status === 'REVOKED') return { ok: true, brief };
      const updated = { ...brief, status: 'REVOKED', revoked_at: new Date(now).toISOString() };
      await storage.putJson(briefPath(id), updated);
      return { ok: true, brief: updated };
    }
  };
}

export const briefRepositoryPaths = Object.freeze({ briefPath, accessPath });
