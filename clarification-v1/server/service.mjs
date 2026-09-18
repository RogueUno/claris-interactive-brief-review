import { normalizeClarificationPackage, normalizeProspectAnswers, publicClarificationPackage } from './contract.mjs';
import { signClarificationSession, verifyClarificationSession } from './session.mjs';

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function versionConflict(expectedVersion, currentVersion) {
  const expected = String(expectedVersion || '').trim();
  if (!expected) return false;
  return expected !== String(currentVersion || '').trim();
}

function blobConflict(error) {
  return error?.code === 'BLOB_PRECONDITION_FAILED' || error?.message === 'BLOB_PRECONDITION_FAILED';
}

function isExpired(pkg, now) {
  const expiry = Date.parse(pkg?.expires_at);
  return !Number.isFinite(expiry) || expiry <= now;
}

function publicState(envelope, etag) {
  return {
    ok: true,
    clarification: publicClarificationPackage(envelope.package),
    status: envelope.package.status,
    submitted_at: envelope.response?.submitted_at || null,
    opportunity_version: etag || null
  };
}

export function createClarificationService({ repository, sessionSecret }) {
  if (!repository) throw new Error('REPOSITORY_REQUIRED');

  function authenticate(token, now) {
    return verifyClarificationSession(token, sessionSecret, { now });
  }

  return {
    async createPackage(input, { now = Date.now(), ttlMs } = {}) {
      const pkg = normalizeClarificationPackage(input, { now, ...(ttlMs ? { ttlMs } : {}) });
      const created = await repository.createPackage(pkg, { now });
      return {
        ok: true,
        opportunity_id: pkg.opportunity_id,
        status: pkg.status,
        requires_clarification: pkg.questions.length > 0,
        question_count: pkg.questions.length,
        invite_token: created.token,
        expires_at: pkg.expires_at,
        opportunity_version: created.etag || null
      };
    },

    async resolveInvite(inviteToken, { now = Date.now() } = {}) {
      const resolved = await repository.resolveInvite(inviteToken, { now });
      if (!resolved.ok) return resolved;
      const pkg = resolved.envelope.package;
      if (isExpired(pkg, now)) return { ok: false, error: 'CLARIFICATION_EXPIRED' };
      if (pkg.status === 'NO_CLARIFICATION') return { ok: false, error: 'CLARIFICATION_NOT_REQUIRED' };

      const expiryMs = Math.min(Date.parse(pkg.expires_at), now + SESSION_TTL_MS);
      const sessionPayload = {
        version: 1,
        opportunity_id: pkg.opportunity_id,
        issued_at: now,
        expires_at: expiryMs
      };
      return {
        ...publicState(resolved.envelope, resolved.etag),
        session_token: signClarificationSession(sessionPayload, sessionSecret),
        session_expires_at: expiryMs
      };
    },

    async load(sessionToken, { now = Date.now() } = {}) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;
      const loaded = await repository.loadEnvelopeWithMeta(auth.payload.opportunity_id);
      if (!loaded.envelope) return { ok: false, error: 'CLARIFICATION_NOT_FOUND' };
      if (isExpired(loaded.envelope.package, now) && loaded.envelope.package.status !== 'SUBMITTED') {
        return { ok: false, error: 'CLARIFICATION_EXPIRED' };
      }
      return publicState(loaded.envelope, loaded.etag);
    },

    async submit(sessionToken, answers, { now = Date.now(), expectedVersion = null } = {}) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;

      const loaded = await repository.loadEnvelopeWithMeta(auth.payload.opportunity_id);
      const envelope = loaded.envelope;
      if (!envelope) return { ok: false, error: 'CLARIFICATION_NOT_FOUND' };
      if (envelope.response || envelope.package.status === 'SUBMITTED') {
        return { ok: false, error: 'CLARIFICATION_ALREADY_SUBMITTED', opportunity_version: loaded.etag || null };
      }
      if (envelope.package.status !== 'OPEN') return { ok: false, error: 'CLARIFICATION_NOT_OPEN' };
      if (isExpired(envelope.package, now)) return { ok: false, error: 'CLARIFICATION_EXPIRED' };
      if (versionConflict(expectedVersion, loaded.etag)) {
        return { ok: false, error: 'CLARIFICATION_CONFLICT', opportunity_version: loaded.etag || null };
      }

      let normalizedAnswers;
      try {
        normalizedAnswers = normalizeProspectAnswers(envelope.package, answers);
      } catch (error) {
        return { ok: false, error: error?.message || 'ANSWER_VALIDATION_FAILED' };
      }

      const submittedAt = new Date(now).toISOString();
      const response = {
        schema_version: 'claris_prospect_response_v1',
        opportunity_id: envelope.package.opportunity_id,
        source_class: 'PROSPECT_REPORTED',
        submitted_at: submittedAt,
        answers: normalizedAnswers
      };
      const nextEnvelope = {
        ...envelope,
        package: { ...envelope.package, status: 'SUBMITTED' },
        response,
        updated_at: submittedAt
      };

      let saved;
      try {
        saved = await repository.saveEnvelopeWithMeta(
          envelope.package.opportunity_id,
          nextEnvelope,
          { ifMatch: loaded.etag }
        );
      } catch (error) {
        if (blobConflict(error)) return { ok: false, error: 'CLARIFICATION_CONFLICT' };
        throw error;
      }

      return {
        ok: true,
        status: 'SUBMITTED',
        submitted_at: submittedAt,
        answer_count: normalizedAnswers.length,
        opportunity_version: saved.etag || null
      };
    }
  };
}
