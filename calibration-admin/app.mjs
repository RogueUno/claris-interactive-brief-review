import { fixture, clone } from '../calibration-v3/state.js';

const form = document.getElementById('invite-form');
const adminKey = document.getElementById('admin-key');
const consultantId = document.getElementById('consultant-id');
const firstName = document.getElementById('first-name');
const fullName = document.getElementById('full-name');
const firm = document.getElementById('firm');
const ttl = document.getElementById('ttl');
const status = document.getElementById('status');
const result = document.getElementById('result');
const inviteUrl = document.getElementById('invite-url');
const copy = document.getElementById('copy');
const open = document.getElementById('open');
const submit = document.getElementById('submit');

consultantId.value = `consultant_demo_${Date.now()}`;
firstName.value = 'Demo';
fullName.value = 'Demo Consultant';
firm.value = 'Demo Advisory';

function buildDemoSeed() {
  const seed = clone(fixture);
  return {
    ...seed,
    consultantId: '',
    firstName: '',
    fullName: '',
    firm: '',
    services: seed.services.map((service) => ({ ...service })),
    leadServiceId: seed.leadServiceId,
    pausedPolicies: {},
    companyTypes: ['B2B SaaS', 'Software'],
    customCompanyTypes: [],
    buyerRoles: [],
    customBuyerRoles: [],
    companyStage: '',
    geographyMatters: false,
    geographies: [],
    customGeographies: [],
    minimumEngagement: 0,
    currency: 'USD',
    engagementModels: [],
    customEngagementModels: [],
    budgetRequired: false,
    hardDisqualifiers: [],
    customHardDisqualifiers: [],
    hardDisqualifiersConfirmed: false,
    cautionSignals: [],
    customCautionSignals: [],
    firstCallRules: [],
    positiveSignals: [],
    vanitySignals: [],
    discoveryStyle: '',
    briefDensity: '',
    preferredNextMove: '',
    proofPoints: [],
    customProofPoints: [],
    avoidPush: [],
    customAvoidPush: [],
    exceptions: [],
    customExceptions: [],
    sessionId: `cal3_${Date.now()}`,
    phase: 'boot',
    bootIndex: 0,
    currentStep: 0,
    lockedAt: null
  };
}

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  result.hidden = true;
  setStatus('Creating invite…');
  submit.disabled = true;

  const key = adminKey.value.trim();
  const body = {
    identity: {
      consultant_id: consultantId.value.trim(),
      first_name: firstName.value.trim(),
      full_name: fullName.value.trim(),
      firm: firm.value.trim()
    },
    ttl_days: Number(ttl.value),
    seed_state: buildDemoSeed()
  };

  try {
    const response = await fetch('/api/calibration/admin/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body),
      credentials: 'same-origin'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok || !payload?.invite_url) {
      throw new Error(payload?.error || `HTTP_${response.status}`);
    }

    inviteUrl.value = payload.invite_url;
    open.href = payload.invite_url;
    result.hidden = false;
    adminKey.value = '';
    setStatus(`Invite created · expires ${new Date(payload.expires_at).toLocaleString()}`, 'success');
  } catch (error) {
    setStatus(`Could not create invite: ${error?.message || 'Unknown error'}`, 'error');
  } finally {
    submit.disabled = false;
  }
});

copy.addEventListener('click', async () => {
  if (!inviteUrl.value) return;
  await navigator.clipboard.writeText(inviteUrl.value);
  const original = copy.textContent;
  copy.textContent = 'Copied';
  window.setTimeout(() => { copy.textContent = original; }, 1200);
});
