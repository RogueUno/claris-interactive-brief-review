import assert from 'node:assert/strict';
import {
  buildLifecycleRecord,
  lifecycleStorageKey,
  loadLifecycleRecord,
  persistLifecycleRecord,
  snapshotFromCalibrationState
} from '../profile-lifecycle.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); }
  };
}

const baseState = {
  consultantId: 'consultant_sarah',
  firstName: 'Sarah',
  fullName: 'Sarah Jenkins',
  firm: 'SecureAdvisory',
  services: [
    { service_id: 'SVC_API_AUDIT', name: 'API Security Auditing', selected: true, state: 'ACTIVE', preference: 'LEAD_WITH' },
    { service_id: 'SVC_SOC2', name: 'SOC 2 Readiness', selected: true, state: 'SELECTIVE', preference: 'SELECTIVE' },
    { service_id: 'SVC_VCISO', name: 'Fractional vCISO', selected: true, state: 'PAUSED', preference: 'ONLY_IF_REQUESTED' }
  ],
  leadServiceId: 'SVC_API_AUDIT',
  pausedPolicies: { SVC_VCISO: 'EXPLICIT_ONLY' },
  companyTypes: ['B2B SaaS'],
  customCompanyTypes: ['AI infrastructure'],
  buyerRoles: ['CISO / Security lead'],
  customBuyerRoles: ['Head of Trust'],
  companyStage: 'Growth / scale-up',
  geographyMatters: false,
  geographies: [],
  customGeographies: [],
  minimumEngagement: 7500,
  currency: 'USD',
  engagementModels: ['Fixed-scope project'],
  customEngagementModels: ['Advisory sprint'],
  budgetRequired: false,
  hardDisqualifiers: [],
  customHardDisqualifiers: [],
  hardDisqualifiersConfirmed: true,
  cautionSignals: ['Unclear internal owner'],
  customCautionSignals: [],
  firstCallRules: ['documented service/problem alignment', 'not affirmatively disqualified'],
  positiveSignals: ['Enterprise or customer pressure'],
  vanitySignals: ['Funding announcement by itself'],
  discoveryStyle: 'Diagnostic first',
  briefDensity: 'Balanced — key evidence + implications',
  preferredNextMove: 'Define the next diagnostic step',
  proofPoints: ['Relevant case study'],
  customProofPoints: ['Founder reference'],
  avoidPush: ['Pricing too early'],
  customAvoidPush: [],
  exceptions: ['Warm referral with credible need'],
  customExceptions: ['Strategic partner referral'],
  sessionId: 'cal3_test',
  lockedAt: '2026-09-17T12:00:00.000Z'
};

const snapshot = snapshotFromCalibrationState(baseState);
assert.deepEqual(snapshot.opportunity.companyTypes, ['B2B SaaS', 'AI infrastructure']);
assert.deepEqual(snapshot.opportunity.buyerRoles, ['CISO / Security lead', 'Head of Trust']);
assert.deepEqual(snapshot.strategy.proofPoints, ['Relevant case study', 'Founder reference']);
assert.deepEqual(snapshot.exceptions, ['Warm referral with credible need', 'Strategic partner referral']);

const record = buildLifecycleRecord(baseState, { persistedAt: '2026-09-17T12:01:00.000Z' });
assert.equal(record.status, 'LOCKED');
assert.equal(record.profile_validation.ok, true);
assert.equal(record.runtime_v3.status, 'READY');
assert.equal(record.runtime_v3.consultant_sot_json.services.length, 2);
assert.equal(record.runtime_v3.consultant_sot_json.services.some((service) => service.service_id === 'SVC_VCISO'), false);
assert.equal(record.runtime_v3.consultant_sot_json.ideal_client_profile.preferred_company_types.includes('AI infrastructure'), true);
assert.equal(JSON.stringify(record.runtime_v3.consultant_sot_json).includes('Founder reference'), false);
assert.equal(JSON.stringify(record.runtime_v3.consultant_sot_json).includes('Strategic partner referral'), false);

const storage = memoryStorage();
persistLifecycleRecord(storage, record);
assert.equal(storage.getItem(lifecycleStorageKey('consultant_sarah')) !== null, true);
const loaded = loadLifecycleRecord(storage, 'consultant_sarah');
assert.deepEqual(loaded.runtime_v3.consultant_sot_json, record.runtime_v3.consultant_sot_json);

const eurRecord = buildLifecycleRecord({ ...baseState, currency: 'EUR' });
assert.equal(eurRecord.runtime_v3.status, 'BLOCKED');
assert.equal(eurRecord.runtime_v3.consultant_sot_json, null);
assert.equal(eurRecord.runtime_v3.report.errors.includes('UNSUPPORTED_RUNTIME_CURRENCY:EUR'), true);

console.log('CLARIS lifecycle tests: PASS');
