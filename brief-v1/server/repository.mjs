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

export function createBriefRepository(storage) {
  if (!storage?.getJson || !storage?.putJson) throw new Error('JSON_STORAGE_ADAPTER_REQUIRED');
  return {
    async create({ consultantId, company, payload, now = Date.now(), ttlMs = 7 * 86400000 }) {
      const consultant_id = assertId(consultantId, 'INVALID_CONSULTANT_ID');
      const companyName = String(company || '').trim();
      if (!companyName || companyName.length > 160) throw new Error('INVALID_COMPANY');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_BRIEF_PAYLOAD');
      const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
      if (bytes > 512 * 1024) throw new Error('BRIEF_PAYLOAD_TOO_LARGE');
      if (!Number.isFinite(ttlMs) || ttlMs < 3600000 || ttlMs > 30 * 86400000) throw new Error('BRIEF_TTL_INVALID');

      const briefId = createOpaqueToken(24);
      const token = createOpaqueToken(32);
      const tokenHash = hashOpaqueToken(token);
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
        payload: cloneJson(payload)
      };
      const access = {
        schema_version: ACCESS_VERSION,
        token_hash: tokenHash,
        brief_id: briefId,
        status: 'ACTIVE',
        created_at: createdAt,
        expires_at: expiresAt,
        last_resolved_at: null
      };
      await storage.putJson(briefPath(briefId), brief);
      await storage.putJson(accessPath(tokenHash), access);
      return { token, brief };
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
