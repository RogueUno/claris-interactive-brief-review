import { STORAGE_KEY as CALIBRATION_STORAGE_KEY } from '../state.js';
import {
  buildLifecycleRecord,
  loadLifecycleRecord,
  persistLifecycleRecord
} from './profile-lifecycle.mjs';

const POLL_MS = 450;
let previousFingerprint = '';
let timer = null;

function readCalibrationState() {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function fingerprint(state) {
  if (!state) return '';
  return JSON.stringify({
    sessionId: state.sessionId,
    lockedAt: state.lockedAt,
    currentStep: state.currentStep,
    schemaVersion: state.schemaVersion,
    services: state.services,
    companyTypes: state.companyTypes,
    customCompanyTypes: state.customCompanyTypes,
    buyerRoles: state.buyerRoles,
    customBuyerRoles: state.customBuyerRoles,
    companyStage: state.companyStage,
    geographyMatters: state.geographyMatters,
    geographies: state.geographies,
    customGeographies: state.customGeographies,
    minimumEngagement: state.minimumEngagement,
    currency: state.currency,
    engagementModels: state.engagementModels,
    customEngagementModels: state.customEngagementModels,
    budgetRequired: state.budgetRequired,
    hardDisqualifiers: state.hardDisqualifiers,
    customHardDisqualifiers: state.customHardDisqualifiers,
    hardDisqualifiersConfirmed: state.hardDisqualifiersConfirmed,
    cautionSignals: state.cautionSignals,
    customCautionSignals: state.customCautionSignals,
    firstCallRules: state.firstCallRules,
    positiveSignals: state.positiveSignals,
    vanitySignals: state.vanitySignals,
    discoveryStyle: state.discoveryStyle,
    briefDensity: state.briefDensity,
    preferredNextMove: state.preferredNextMove,
    proofPoints: state.proofPoints,
    customProofPoints: state.customProofPoints,
    avoidPush: state.avoidPush,
    customAvoidPush: state.customAvoidPush,
    exceptions: state.exceptions,
    customExceptions: state.customExceptions
  });
}

function syncLifecycle() {
  const calibrationState = readCalibrationState();
  if (!calibrationState?.consultantId) return null;

  const nextFingerprint = fingerprint(calibrationState);
  if (nextFingerprint === previousFingerprint) {
    return loadLifecycleRecord(localStorage, calibrationState.consultantId);
  }

  previousFingerprint = nextFingerprint;
  const record = buildLifecycleRecord(calibrationState);
  persistLifecycleRecord(localStorage, record);
  window.dispatchEvent(new CustomEvent('claris:lifecycle-synced', { detail: { record } }));
  return record;
}

function start() {
  syncLifecycle();
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(syncLifecycle, POLL_MS);
}

window.__CLARIS_PROFILE_LIFECYCLE__ = {
  sync: syncLifecycle,
  record() {
    const state = readCalibrationState();
    return state?.consultantId ? loadLifecycleRecord(localStorage, state.consultantId) : null;
  },
  operatingProfile() {
    return this.record()?.operating_profile || null;
  },
  runtimeV3() {
    return this.record()?.runtime_v3 || null;
  },
  runtimeSot() {
    return this.runtimeV3()?.consultant_sot_json || null;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
