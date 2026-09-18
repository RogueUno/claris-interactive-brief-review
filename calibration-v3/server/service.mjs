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
      let existing = await repository.loadProfileEnvelope(identity.consultant_id);

      if (!existing && resolved.invite.seed_state) {
        const seededAt = new Date(now).toISOString();
        const seededState = bindIdentity({ ...resolved.invite.seed_state, lockedAt: null }, identity);
        const lifecycle = buildLifecycleRecord(seededState, { persistedAt: seededAt });
        existing = await repository.saveProfileEnvelope(identity.consultant_id, {
          calibration_state: seededState,
          lifecycle_record: lifecycle,
          updated_at: seededAt
        });
      }

      return {
        ok: true,
        session_token,
        session_expires_at: sessionPayload.expires_at,
        identity,
        resume_state: existing?.calibration_state || null,
        profile_status: existing?.lifecycle_record?.status || 'NEW',
        runtime_v3: publicRuntimeStatus(existing?.lifecycle_record)
      };
    },

    async load(sessionToken, { now = Date.now() } = {}) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;
      const identity = await repository.loadIdentity(auth.payload.consultant_id);
      if (!identity) return { ok: false, error: 'CONSULTANT_IDENTITY_NOT_FOUND' };
      const existing = await repository.loadProfileEnvelope(identity.consultant_id);
      return {
        ok: true,
        identity,
        resume_state: existing?.calibration_state || null,
        operating_profile: existing?.lifecycle_record?.operating_profile || null,
        profile_status: existing?.lifecycle_record?.status || 'NEW',
        runtime_v3: publicRuntimeStatus(existing?.lifecycle_record)
      };
    },

    async saveProgress(sessionToken, calibrationState, { now = Date.now() } = {}) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;
      const identity = await repository.loadIdentity(auth.payload.consultant_id);
      if (!identity) return { ok: false, error: 'CONSULTANT_IDENTITY_NOT_FOUND' };
      const existing = await repository.loadProfileEnvelope(identity.consultant_id);
      if (existing?.lifecycle_record?.status === 'LOCKED') return { ok: false, error: 'PROFILE_LOCKED' };

      const boundState = bindIdentity({ ...(calibrationState || {}), lockedAt: null }, identity);
      const lifecycle = buildLifecycleRecord(boundState, { persistedAt: new Date(now).toISOString() });
      const envelope = await repository.saveProfileEnvelope(identity.consultant_id, {
        calibration_state: boundState,
        lifecycle_record: lifecycle,
        updated_at: new Date(now).toISOString()
      });
      return {
        ok: true,
        profile_status: lifecycle.status,
        profile_validation: lifecycle.profile_validation,
        runtime_v3: publicRuntimeStatus(lifecycle),
        updated_at: envelope.updated_at
      };
    },

    async lock(sessionToken, calibrationState, { now = Date.now() } = {}) {
      const auth = authenticate(sessionToken, now);
      if (!auth.ok) return auth;
      const identity = await repository.loadIdentity(auth.payload.consultant_id);
      if (!identity) return { ok: false, error: 'CONSULTANT_IDENTITY_NOT_FOUND' };

      const existing = await repository.loadProfileEnvelope(identity.consultant_id);
      if (existing?.lifecycle_record?.status === 'LOCKED') {
        return { ok: false, error: 'PROFILE_LOCKED' };
      }

      const lockedAt = new Date(now).toISOString();
      const boundState = bindIdentity({ ...(calibrationState || {}), lockedAt }, identity);
      const lifecycle = buildLifecycleRecord(boundState, { persistedAt: lockedAt });
      if (!lifecycle?.profile_validation?.ok) {
        return { ok: false, error: 'PROFILE_VALIDATION_FAILED', validation: lifecycle.profile_validation };
      }
      await repository.saveProfileEnvelope(identity.consultant_id, {
        calibration_state: boundState,
        lifecycle_record: lifecycle,
        updated_at: lockedAt
      });
      return {
        ok: true,
        profile_status: 'LOCKED',
        locked_at: lockedAt,
        operating_profile: lifecycle.operating_profile,
        runtime_v3: publicRuntimeStatus(lifecycle)
      };
    }
  };
}
