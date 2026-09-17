import { STORAGE_KEY as CALIBRATION_STORAGE_KEY, fixture, clone } from '../state.js';

const API = Object.freeze({
  resolve: '/api/calibration/resolve',
  profile: '/api/calibration/profile',
  lock: '/api/calibration/lock'
});

const SYNC_POLL_MS = 500;
const SAVE_DEBOUNCE_MS = 900;

let authenticated = false;
let serverLocked = false;
let previousFingerprint = '';
let saveTimer = null;
let pollTimer = null;
let inFlight = false;
let queued = false;
let lastError = null;
let lastServerStatus = null;

function readState() {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeState(state) {
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(state));
}

function freshState(identity) {
  const state = clone(fixture);
  return {
    ...state,
    consultantId: identity.consultant_id,
    firstName: identity.first_name,
    fullName: identity.full_name,
    firm: identity.firm,
    services: [],
    leadServiceId: null,
    pausedPolicies: {},
    companyTypes: [],
    customCompanyTypes: [],
    buyerRoles: [],
    customBuyerRoles: [],
    companyStage: '',
    geographyMatters: false,
    geographies: [],
    customGeographies: [],
    minimumEngagement: 0,
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

function bindIdentity(state, identity) {
  return {
    ...(state || {}),
    consultantId: identity.consultant_id,
    firstName: identity.first_name,
    fullName: identity.full_name,
    firm: identity.firm
  };
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = { ok: false, error: `HTTP_${response.status}` };
  }

  return { response, body };
}

function inviteTokenFromHash() {
  const raw = String(location.hash || '').replace(/^#/, '');
  const params = new URLSearchParams(raw);
  const token = params.get('invite');
  return token ? token.trim() : '';
}

function clearInviteHash() {
  const cleanUrl = `${location.pathname}${location.search}`;
  history.replaceState(null, '', cleanUrl);
}

function stateFingerprint(state) {
  if (!state) return '';
  const copy = { ...state };
  delete copy.bootIndex;
  return JSON.stringify(copy);
}

function dispatch(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

async function resolveInvite(token) {
  const { response, body } = await request(API.resolve, {
    method: 'POST',
    body: JSON.stringify({ invite_token: token })
  });

  if (!response.ok || !body?.ok) {
    lastError = body?.error || `HTTP_${response.status}`;
    dispatch('claris:server-session-error', { stage: 'resolve', error: lastError });
    return false;
  }

  authenticated = true;
  lastServerStatus = body.profile_status || 'NEW';
  serverLocked = body.profile_status === 'LOCKED';

  const nextState = body.resume_state
    ? bindIdentity(body.resume_state, body.identity)
    : freshState(body.identity);

  writeState(nextState);
  previousFingerprint = stateFingerprint(nextState);
  clearInviteHash();
  dispatch('claris:server-session-resolved', {
    identity: body.identity,
    profile_status: body.profile_status,
    runtime_v3: body.runtime_v3
  });

  location.reload();
  return true;
}

async function restoreExistingSession() {
  const { response, body } = await request(API.profile, { method: 'GET' });

  if (response.status === 401) {
    authenticated = false;
    return false;
  }

  if (!response.ok || !body?.ok) {
    lastError = body?.error || `HTTP_${response.status}`;
    dispatch('claris:server-session-error', { stage: 'load', error: lastError });
    return false;
  }

  authenticated = true;
  lastServerStatus = body.profile_status || 'NEW';
  serverLocked = body.profile_status === 'LOCKED';

  if (body.resume_state) {
    const serverState = bindIdentity(body.resume_state, body.identity);
    const localState = readState();
    const localMatchesIdentity = localState?.consultantId === body.identity?.consultant_id;
    const shouldRestore = !localMatchesIdentity || stateFingerprint(localState) !== stateFingerprint(serverState);

    if (shouldRestore) {
      writeState(serverState);
      previousFingerprint = stateFingerprint(serverState);
      dispatch('claris:server-session-restored', {
        identity: body.identity,
        profile_status: body.profile_status,
        runtime_v3: body.runtime_v3
      });
      location.reload();
      return true;
    }
  } else {
    const localState = readState();
    if (localState?.consultantId === body.identity?.consultant_id) {
      previousFingerprint = stateFingerprint(localState);
    }
  }

  dispatch('claris:server-session-ready', {
    identity: body.identity,
    profile_status: body.profile_status,
    runtime_v3: body.runtime_v3
  });
  return true;
}

async function saveToServer(state) {
  if (!authenticated || serverLocked || !state?.consultantId) return;
  if (inFlight) {
    queued = true;
    return;
  }

  inFlight = true;
  queued = false;

  try {
    if (state.lockedAt) {
      const { response, body } = await request(API.lock, {
        method: 'POST',
        body: JSON.stringify({ calibration_state: state })
      });

      if (response.ok && body?.ok) {
        serverLocked = true;
        lastServerStatus = 'LOCKED';
        const current = readState();
        if (current) {
          current.lockedAt = body.locked_at || current.lockedAt;
          writeState(current);
          previousFingerprint = stateFingerprint(current);
        }
        dispatch('claris:server-profile-locked', {
          locked_at: body.locked_at,
          runtime_v3: body.runtime_v3
        });
        return;
      }

      lastError = body?.error || `HTTP_${response.status}`;
      const current = readState();
      if (current?.lockedAt) {
        current.lockedAt = null;
        writeState(current);
      }
      dispatch('claris:server-session-error', { stage: 'lock', error: lastError, detail: body });
      location.reload();
      return;
    }

    const { response, body } = await request(API.profile, {
      method: 'PUT',
      body: JSON.stringify({ calibration_state: state })
    });

    if (response.status === 401) {
      authenticated = false;
      lastError = body?.error || 'SESSION_REQUIRED';
      dispatch('claris:server-session-error', { stage: 'save', error: lastError });
      return;
    }

    if (response.status === 409 && body?.error === 'PROFILE_LOCKED') {
      serverLocked = true;
      lastServerStatus = 'LOCKED';
      return;
    }

    if (!response.ok || !body?.ok) {
      lastError = body?.error || `HTTP_${response.status}`;
      dispatch('claris:server-session-error', { stage: 'save', error: lastError, detail: body });
      return;
    }

    lastServerStatus = body.profile_status || lastServerStatus;
    dispatch('claris:server-profile-saved', {
      profile_status: body.profile_status,
      runtime_v3: body.runtime_v3,
      updated_at: body.updated_at
    });
  } catch (error) {
    lastError = error?.message || 'NETWORK_ERROR';
    dispatch('claris:server-session-error', { stage: 'save', error: lastError });
  } finally {
    inFlight = false;
    if (queued) {
      queued = false;
      const latest = readState();
      if (latest) await saveToServer(latest);
    }
  }
}

function scheduleSync() {
  if (!authenticated || serverLocked) return;
  const state = readState();
  if (!state?.consultantId) return;

  const next = stateFingerprint(state);
  if (!next || next === previousFingerprint) return;
  previousFingerprint = next;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveToServer(readState()), SAVE_DEBOUNCE_MS);
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(scheduleSync, SYNC_POLL_MS);
}

async function start() {
  const inviteToken = inviteTokenFromHash();
  if (inviteToken) {
    await resolveInvite(inviteToken);
    return;
  }

  await restoreExistingSession();
  startPolling();
}

window.__CLARIS_SERVER_SESSION__ = {
  status() {
    return {
      authenticated,
      serverLocked,
      lastServerStatus,
      lastError,
      inFlight
    };
  },
  async reload() {
    return restoreExistingSession();
  },
  async syncNow() {
    const state = readState();
    return saveToServer(state);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
