export const STORAGE_KEY = 'claris_calibration_v2_2_public_preview';

export const fixture = {
  consultantId: 'consultant_prototype_sarah',
  firstName: 'Sarah',
  fullName: 'Sarah Jenkins',
  firm: 'SecureAdvisory',
  services: [
    { service_id: 'SVC_API_AUDIT', name: 'API Security Auditing', selected: true, state: 'ACTIVE', preference: 'LEAD_WITH' },
    { service_id: 'SVC_SOC2', name: 'SOC 2 Readiness', selected: true, state: 'ACTIVE', preference: 'CORE' },
    { service_id: 'SVC_VCISO', name: 'Fractional vCISO', selected: false, state: 'ACTIVE', preference: 'CORE' }
  ],
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
export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? { ...clone(fixture), ...saved } : clone(fixture);
  } catch { return clone(fixture); }
}
export function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
export function resetState() { localStorage.removeItem(STORAGE_KEY); return clone(fixture); }
export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
