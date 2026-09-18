function publicRuntimeStatus(runtime) {
  return {
    status: runtime?.status || 'BLOCKED',
    errors: [...(runtime?.report?.errors || [])],
    warnings: [...(runtime?.report?.warnings || [])],
    adapter_version: runtime?.report?.adapter_version || null
  };
}

export function buildRuntimeV3Export(envelope, profileVersion = null) {
  if (!envelope) {
    return {
      ok: false,
      error: 'PROFILE_NOT_FOUND',
      http_status: 404
    };
  }

  const lifecycle = envelope.lifecycle_record;
  if (!lifecycle) {
    return {
      ok: false,
      error: 'PROFILE_LIFECYCLE_MISSING',
      http_status: 409,
      profile_version: profileVersion || null
    };
  }

  if (lifecycle.status !== 'LOCKED') {
    return {
      ok: false,
      error: 'PROFILE_NOT_LOCKED',
      http_status: 409,
      profile_status: lifecycle.status || 'IN_PROGRESS',
      profile_version: profileVersion || null
    };
  }

  const runtime = lifecycle.runtime_v3;
  if (runtime?.status !== 'READY' || !runtime?.consultant_sot_json) {
    return {
      ok: false,
      error: 'RUNTIME_V3_BLOCKED',
      http_status: 409,
      profile_status: 'LOCKED',
      runtime_v3: publicRuntimeStatus(runtime),
      profile_version: profileVersion || null
    };
  }

  return {
    ok: true,
    http_status: 200,
    consultant_id: lifecycle.consultant_id || envelope.consultant_id || null,
    profile_status: 'LOCKED',
    locked_at: lifecycle.operating_profile?.locked_at || envelope.calibration_state?.lockedAt || null,
    profile_version: profileVersion || null,
    runtime_v3: {
      ...publicRuntimeStatus(runtime),
      consultant_sot_json: runtime.consultant_sot_json
    }
  };
}
