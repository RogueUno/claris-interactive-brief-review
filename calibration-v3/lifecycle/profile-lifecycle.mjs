import { buildOperatingProfileV1, validateOperatingProfileV1 } from '../runtime/operating-profile-v1.mjs';
import { compileConsultantRuntimeSotV3 } from '../runtime/compile-runtime-sot-v3.mjs';

export const LIFECYCLE_SCHEMA_VERSION = 'claris_profile_lifecycle_v1';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function snapshotFromCalibrationState(state) {
  const source = state || {};
  return {
    consultant: {
      consultantId: source.consultantId,
      firstName: source.firstName,
      fullName: source.fullName,
      firm: source.firm
    },
    practice: {
      services: clone(source.services || []),
      leadServiceId: source.leadServiceId ?? null,
      pausedPolicies: clone(source.pausedPolicies || {})
    },
    opportunity: {
      companyTypes: [...(source.companyTypes || []), ...(source.customCompanyTypes || [])],
      buyerRoles: [...(source.buyerRoles || []), ...(source.customBuyerRoles || [])],
      companyStage: source.companyStage || '',
      geographyMatters: Boolean(source.geographyMatters),
      geographies: [...(source.geographies || []), ...(source.customGeographies || [])]
    },
    commercial: {
      minimumEngagement: Number(source.minimumEngagement || 0),
      currency: source.currency || '',
      engagementModels: [...(source.engagementModels || []), ...(source.customEngagementModels || [])],
      budgetRequired: Boolean(source.budgetRequired),
      hardDisqualifiers: [...(source.hardDisqualifiers || []), ...(source.customHardDisqualifiers || [])],
      hardDisqualifiersConfirmed: Boolean(source.hardDisqualifiersConfirmed),
      cautionSignals: [...(source.cautionSignals || []), ...(source.customCautionSignals || [])]
    },
    judgment: {
      firstCallRules: clone(source.firstCallRules || []),
      positiveSignals: clone(source.positiveSignals || []),
      vanitySignals: clone(source.vanitySignals || [])
    },
    strategy: {
      discoveryStyle: source.discoveryStyle || '',
      briefDensity: source.briefDensity || '',
      preferredNextMove: source.preferredNextMove || '',
      proofPoints: [...(source.proofPoints || []), ...(source.customProofPoints || [])],
      avoidPush: [...(source.avoidPush || []), ...(source.customAvoidPush || [])]
    },
    exceptions: [...(source.exceptions || []), ...(source.customExceptions || [])],
    lockedAt: source.lockedAt ?? null
  };
}

export function buildLifecycleRecord(calibrationState, { persistedAt = new Date().toISOString() } = {}) {
  const snapshot = snapshotFromCalibrationState(calibrationState);
  const operatingProfile = buildOperatingProfileV1(snapshot);
  const profileValidation = validateOperatingProfileV1(operatingProfile);
  const compilation = profileValidation.ok
    ? compileConsultantRuntimeSotV3(operatingProfile)
    : { ok: false, runtime_sot: null, report: { errors: [...profileValidation.errors], warnings: [] } };

  return {
    lifecycle_schema_version: LIFECYCLE_SCHEMA_VERSION,
    consultant_id: operatingProfile.consultant.consultant_id,
    session_id: String(calibrationState?.sessionId || ''),
    status: operatingProfile.locked_at ? 'LOCKED' : 'IN_PROGRESS',
    persisted_at: persistedAt,
    operating_profile: operatingProfile,
    profile_validation: profileValidation,
    runtime_v3: {
      status: compilation.ok ? 'READY' : 'BLOCKED',
      consultant_sot_json: compilation.runtime_sot,
      report: compilation.report
    }
  };
}

export function lifecycleStorageKey(consultantId) {
  const clean = String(consultantId || '').trim();
  if (!clean) throw new Error('CONSULTANT_ID_REQUIRED');
  return `claris_profile_lifecycle_v1:${clean}`;
}

export function persistLifecycleRecord(storage, record) {
  if (!storage || typeof storage.setItem !== 'function') throw new Error('STORAGE_ADAPTER_REQUIRED');
  if (!record?.consultant_id) throw new Error('LIFECYCLE_RECORD_CONSULTANT_REQUIRED');
  storage.setItem(lifecycleStorageKey(record.consultant_id), JSON.stringify(record));
  return record;
}

export function loadLifecycleRecord(storage, consultantId) {
  if (!storage || typeof storage.getItem !== 'function') throw new Error('STORAGE_ADAPTER_REQUIRED');
  const raw = storage.getItem(lifecycleStorageKey(consultantId));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (parsed?.lifecycle_schema_version !== LIFECYCLE_SCHEMA_VERSION) return null;
  return parsed;
}
