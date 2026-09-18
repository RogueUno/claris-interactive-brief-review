import { normalizeClarificationPackage, normalizeProspectAnswers, normalizeProspectProgress, publicClarificationPackage } from './contract.mjs';
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
    progress: envelope.progress || null,
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

    async reissueInvite(opportunityId, { now = Date.now(), ttlMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
      if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 30 * 24 * 60 * 60 * 1000) {
        return { ok: false, error: 'CLARIFICATION_TTL_INVALID' };
      }
      const result = await repository.reissueInvite(opportunityId, {
        now,
        expiresAt: new Date(now + ttlMs).toISOString()
      });
      if (!result.ok) return result;
      return {
        ok: true,
        opportunity_id: result.envelope.package.opportunity_id,
        status: result.envelope.package.status,
        invite_token: result.token,
        expires_at: result.envelope.package.expires_at,
        opportunity_version: result.etag || null
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
        invite_hash: pkg.invite_hash,
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
      if (auth.payload.invite_hash !== loaded.envelope.package?.invite_hash) {
        return { ok: false, error: 'SESSION_REVOKED' };
      }
      if (isExpired(loaded.envelope.package, now) && loaded.envelope.package.status !== 'SUBMITTED') {
        return { ok: false, error: 'CLARIFICATION_EXPIRED' };
      }
      return publicState(loaded.envelope, loaded.etag);
    },

    async saveProgress(
      sessionToken,
      answers,
      resumeQuestionId,
      { now = Date.now(), expectedVersion = null } = {}
    ) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;

      const loaded = await repository.loadEnvelopeWithMeta(auth.payload.opportunity_id);
      const envelope = loaded.envelope;
      if (!envelope) return { ok: false, error: 'CLARIFICATION_NOT_FOUND' };
      if (auth.payload.invite_hash !== envelope.package?.invite_hash) {
        return { ok: false, error: 'SESSION_REVOKED' };
      }
      if (envelope.response || envelope.package.status === 'SUBMITTED') {
        return { ok: false, error: 'CLARIFICATION_ALREADY_SUBMITTED', opportunity_version: loaded.etag || null };
      }
      if (envelope.package.status !== 'OPEN') return { ok: false, error: 'CLARIFICATION_NOT_OPEN' };
      if (isExpired(envelope.package, now)) return { ok: false, error: 'CLARIFICATION_EXPIRED' };
      if (versionConflict(expectedVersion, loaded.etag)) {
        return { ok: false, error: 'CLARIFICATION_CONFLICT', opportunity_version: loaded.etag || null };
      }

      const resumeId = String(resumeQuestionId || '').trim();
      if (!resumeId || !envelope.package.questions.some((question) => question.question_id === resumeId)) {
        return { ok: false, error: 'RESUME_QUESTION_INVALID' };
      }

      let normalizedAnswers;
      try {
        normalizedAnswers = normalizeProspectProgress(envelope.package, answers);
      } catch (error) {
        return { ok: false, error: error?.message || 'ANSWER_VALIDATION_FAILED' };
      }

      const updatedAt = new Date(now).toISOString();
      const nextEnvelope = {
        ...envelope,
        progress: {
          schema_version: 'claris_clarification_progress_v1',
          resume_question_id: resumeId,
          updated_at: updatedAt,
          answers: normalizedAnswers
        },
        updated_at: updatedAt
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
        status: 'OPEN',
        progress: saved.envelope.progress,
        opportunity_version: saved.etag || null
      };
    },

    async submit(sessionToken, answers, { now = Date.now(), expectedVersion = null } = {}) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;

      const loaded = await repository.loadEnvelopeWithMeta(auth.payload.opportunity_id);
      const envelope = loaded.envelope;
      if (!envelope) return { ok: false, error: 'CLARIFICATION_NOT_FOUND' };
      if (auth.payload.invite_hash !== envelope.package?.invite_hash) {
        return { ok: false, error: 'SESSION_REVOKED' };
      }
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
        progress: null,
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
