export const STORAGE_KEY = 'claris_calibration_v2_2_public_preview';
export const SCHEMA_VERSION = 4;

export const fixture = {
  schemaVersion: SCHEMA_VERSION,
  consultantId: 'consultant_prototype_sarah',
  firstName: 'Sarah',
  fullName: 'Sarah Jenkins',
  firm: 'SecureAdvisory',
  services: [
    { service_id: 'SVC_API_AUDIT', name: 'API Security Auditing', selected: true, state: 'ACTIVE', preference: 'LEAD_WITH' },
    { service_id: 'SVC_SOC2', name: 'SOC 2 Readiness', selected: true, state: 'ACTIVE', preference: 'CORE' },
    { service_id: 'SVC_VCISO', name: 'Fractional vCISO', selected: false, state: 'ACTIVE', preference: 'CORE' }
  ],
  leadServiceId: 'SVC_API_AUDIT',
  pausedPolicies: {},
  companyTypes: ['B2B SaaS', 'Software'],
  customCompanyTypes: [],
  minimumEngagement: 7500,
  currency: 'USD',
  budgetRequired: false,
  requiredForFirstCall: ['documented service/problem alignment', 'not affirmatively disqualified'],
  sessionId: `cal_${Date.now()}`,
  phase: 'boot',
  bootIndex: 0,
  currentStep: 0,
  lockedAt: null
};

export function clone(value) { return JSON.parse(JSON.stringify(value)); }

function normalizeService(service) {
  return {
    service_id: service.service_id,
    name: service.name,
    selected: Boolean(service.selected),
    state: ['ACTIVE', 'SELECTIVE', 'PAUSED', 'NO_LONGER'].includes(service.state) ? service.state : 'ACTIVE',
    preference: service.preference || 'CORE'
  };
}

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || saved.schemaVersion !== SCHEMA_VERSION) return clone(fixture);
    return {
      ...clone(fixture),
      ...saved,
      services: Array.isArray(saved.services) ? saved.services.map(normalizeService) : clone(fixture.services),
      pausedPolicies: saved.pausedPolicies && typeof saved.pausedPolicies === 'object' ? saved.pausedPolicies : {},
      schemaVersion: SCHEMA_VERSION
    };
  } catch {
    return clone(fixture);
  }
}

export function saveState(state) {
  state.schemaVersion = SCHEMA_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  return clone(fixture);
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
