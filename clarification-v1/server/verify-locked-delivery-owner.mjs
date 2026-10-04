import { buildRuntimeV3Export } from '../../calibration-v3/server/runtime-export.mjs';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validEmail(value) {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizedJson(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  function normalize(item) {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.keys(item).sort().map((key) => [key, normalize(item[key])])
      );
    }
    return item;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('CONSULTANT_DELIVERY_SOT_INVALID');
  }
  return JSON.stringify(normalize(parsed));
}

export async function verifyLockedDeliveryOwner(context, { repository } = {}) {
  const consultantId = text(context?.consultant_id);
  const suppliedEmail = validEmail(context?.consultant_delivery_email);
  if (!consultantId || !suppliedEmail) {
    throw new Error('CONSULTANT_DELIVERY_OWNER_REQUIRED');
  }
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(consultantId)) {
    throw new Error('CONSULTANT_DELIVERY_OWNER_INVALID');
  }
  if (!repository?.loadIdentity || !repository?.loadProfileEnvelopeWithMeta) {
    throw new Error('CONSULTANT_DELIVERY_REPOSITORY_REQUIRED');
  }

  let identity;
  let locked;
  try {
    [identity, locked] = await Promise.all([
      repository.loadIdentity(consultantId),
      repository.loadProfileEnvelopeWithMeta(consultantId)
    ]);
  } catch {
    throw new Error('CONSULTANT_DELIVERY_LOOKUP_FAILED');
  }
  if (identity?.consultant_id !== consultantId || validEmail(identity?.delivery_email) !== suppliedEmail) {
    throw new Error('CONSULTANT_DELIVERY_OWNER_MISMATCH');
  }

  const runtime = buildRuntimeV3Export(locked?.envelope, locked?.etag);
  if (!runtime.ok || runtime.consultant_id !== consultantId || runtime.profile_status !== 'LOCKED') {
    throw new Error('CONSULTANT_DELIVERY_RUNTIME_NOT_READY');
  }
  let receivedSot;
  let lockedSot;
  try {
    receivedSot = normalizedJson(context.consultant_sot_json);
    lockedSot = normalizedJson(runtime.runtime_v3.consultant_sot_json);
  } catch {
    throw new Error('CONSULTANT_DELIVERY_SOT_INVALID');
  }
  if (receivedSot !== lockedSot) {
    throw new Error('CONSULTANT_DELIVERY_SOT_MISMATCH');
  }

  return {
    consultant_id: consultantId,
    consultant_delivery_email: suppliedEmail
  };
}
