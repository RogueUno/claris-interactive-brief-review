import { signSession, verifySession } from './crypto.mjs';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function bindIdentity(calibrationState, identity) {
  return {
    ...(calibrationState || {}),
    consultantId: identity.consultant_id,
    firstName: identity.first_name,
    fullName: identity.full_name,
    firm: identity.firm
  };
}

function publicRuntimeStatus(lifecycle) {
  return {
    status: lifecycle?.runtime_v3?.status || 'BLOCKED',
    errors: [...(lifecycle?.runtime_v3?.report?.errors || [])],
    warnings: [...(lifecycle?.runtime_v3?.report?.warnings || [])]
  };
}

function hasVersionConflict(expectedVersion, currentVersion) {
  const expected = String(expectedVersion || '').trim();
  if (!expected) return false;
  return expected !== String(currentVersion || '').trim();
}

function isBlobWriteConflict(error) {
  return error?.code === 'BLOB_PRECONDITION_FAILED' || error?.message === 'BLOB_PRECONDITION_FAILED';
}

export function createCalibrationService({ repository, sessionSecret, buildLifecycleRecord }) {
  if (!repository) throw new Error('REPOSITORY_REQUIRED');
  if (typeof buildLifecycleRecord !== 'function') throw new Error('LIFECYCLE_BUILDER_REQUIRED');

  function authenticate(sessionToken, now = Date.now()) {
    return verifySession(sessionToken, sessionSecret, { now });
  }

  return {
    async resolveInvite(inviteToken, { now = Date.now() } = {}) {
      const resolved = await repository.resolveInvite(inviteToken, { now });
      if (!resolved.ok) return resolved;
      const identity = resolved.invite.identity;
      const sessionPayload = {
        version: 1,
        consultant_id: identity.consultant_id,
        issued_at: now,
        expires_at: now + SESSION_TTL_MS
      };
      const session_token = signSession(sessionPayload, sessionSecret);
      let existingMeta = await repository.loadProfileEnvelopeWithMeta(identity.consultant_id);

      if (!existingMeta.envelope && resolved.invite.seed_state) {
        const seededAt = new Date(now).toISOString();
        const seededState = bindIdentity({ ...resolved.invite.seed_state, lockedAt: null }, identity);
        const lifecycle = buildLifecycleRecord(seededState, { persistedAt: seededAt });
        existingMeta = await repository.saveProfileEnvelopeWithMeta(identity.consultant_id, {
          calibration_state: seededState,
          lifecycle_record: lifecycle,
          updated_at: seededAt
        });
      }

      const existing = existingMeta.envelope;
      return {
        ok: true,
        session_token,
        session_expires_at: sessionPayload.expires_at,
        identity,
        resume_state: existing?.calibration_state || null,
        profile_status: existing?.lifecycle_record?.status || 'NEW',
        runtime_v3: publicRuntimeStatus(existing?.lifecycle_record),
        profile_version: existingMeta.etag || null
      };
    },

    async load(sessionToken, { now = Date.now() } = {}) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;
      const identity = await repository.loadIdentity(auth.payload.consultant_id);
      if (!identity) return { ok: false, error: 'CONSULTANT_IDENTITY_NOT_FOUND' };
      const existingMeta = await repository.loadProfileEnvelopeWithMeta(identity.consultant_id);
      const existing = existingMeta.envelope;
      return {
        ok: true,
        identity,
        resume_state: existing?.calibration_state || null,
        operating_profile: existing?.lifecycle_record?.operating_profile || null,
        profile_status: existing?.lifecycle_record?.status || 'NEW',
        runtime_v3: publicRuntimeStatus(existing?.lifecycle_record),
        profile_version: existingMeta.etag || null
      };
    },

    async saveProgress(
      sessionToken,
      calibrationState,
      { now = Date.now(), expectedVersion = null } = {}
    ) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;
      const identity = await repository.loadIdentity(auth.payload.consultant_id);
      if (!identity) return { ok: false, error: 'CONSULTANT_IDENTITY_NOT_FOUND' };

      const existingMeta = await repository.loadProfileEnvelopeWithMeta(identity.consultant_id);
      const existing = existingMeta.envelope;
      if (existing?.lifecycle_record?.status === 'LOCKED') return { ok: false, error: 'PROFILE_LOCKED' };
      if (hasVersionConflict(expectedVersion, existingMeta.etag)) {
        return { ok: false, error: 'PROFILE_CONFLICT', profile_version: existingMeta.etag || null };
      }

      const updatedAt = new Date(now).toISOString();
      const boundState = bindIdentity({ ...(calibrationState || {}), lockedAt: null }, identity);
      const lifecycle = buildLifecycleRecord(boundState, { persistedAt: updatedAt });

      let saved;
      try {
        saved = await repository.saveProfileEnvelopeWithMeta(
          identity.consultant_id,
          {
            calibration_state: boundState,
            lifecycle_record: lifecycle,
            updated_at: updatedAt
          },
          { ifMatch: existingMeta.etag }
        );
      } catch (error) {
        if (isBlobWriteConflict(error)) {
          return { ok: false, error: 'PROFILE_CONFLICT' };
        }
        throw error;
      }

      return {
        ok: true,
        profile_status: lifecycle.status,
        profile_validation: lifecycle.profile_validation,
        runtime_v3: publicRuntimeStatus(lifecycle),
        updated_at: saved.envelope.updated_at,
        profile_version: saved.etag || null
      };
    },

    async lock(
      sessionToken,
      calibrationState,
      { now = Date.now(), expectedVersion = null } = {}
    ) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;
      const identity = await repository.loadIdentity(auth.payload.consultant_id);
      if (!identity) return { ok: false, error: 'CONSULTANT_IDENTITY_NOT_FOUND' };

      const existingMeta = await repository.loadProfileEnvelopeWithMeta(identity.consultant_id);
      const existing = existingMeta.envelope;
      if (existing?.lifecycle_record?.status === 'LOCKED') {
        return { ok: false, error: 'PROFILE_LOCKED' };
      }
      if (hasVersionConflict(expectedVersion, existingMeta.etag)) {
        return { ok: false, error: 'PROFILE_CONFLICT', profile_version: existingMeta.etag || null };
      }

      const lockedAt = new Date(now).toISOString();
      const boundState = bindIdentity({ ...(calibrationState || {}), lockedAt }, identity);
      const lifecycle = buildLifecycleRecord(boundState, { persistedAt: lockedAt });
      if (!lifecycle?.profile_validation?.ok) {
        return { ok: false, error: 'PROFILE_VALIDATION_FAILED', validation: lifecycle.profile_validation };
      }

      let saved;
      try {
        saved = await repository.saveProfileEnvelopeWithMeta(
          identity.consultant_id,
          {
            calibration_state: boundState,
            lifecycle_record: lifecycle,
            updated_at: lockedAt
          },
          { ifMatch: existingMeta.etag }
        );
      } catch (error) {
        if (isBlobWriteConflict(error)) {
          return { ok: false, error: 'PROFILE_CONFLICT' };
        }
        throw error;
      }

      return {
        ok: true,
        profile_status: 'LOCKED',
        locked_at: lockedAt,
        operating_profile: lifecycle.operating_profile,
        runtime_v3: publicRuntimeStatus(lifecycle),
        profile_version: saved.etag || null
      };
    }
  };
}
