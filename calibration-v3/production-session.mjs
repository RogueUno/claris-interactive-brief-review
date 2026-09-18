import { STORAGE_KEY, SCHEMA_VERSION } from './state.js';

const API = Object.freeze({
  resolve: '/api/calibration/resolve',
  profile: '/api/calibration/profile',
  lock: '/api/calibration/lock'
});

const SERVER_HOST_RE = /\.vercel\.app$/i;
const SAVE_DEBOUNCE_MS = 900;
const LIFECYCLE_STORAGE_PREFIX = 'claris_profile_lifecycle_v1:';
const REVIEW_SESSION_KEYS = Object.freeze([
  'claris_review_edit_mode_v1',
  'claris_review_correction_mode_v1'
]);

function onServerHost() {
  return SERVER_HOST_RE.test(window.location.hostname) || window.location.hostname === 'localhost';
}

function readLocalState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalState(value) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, schemaVersion: SCHEMA_VERSION }));
}

function clearStaleLocalConsultantData() {
  REVIEW_SESSION_KEYS.forEach((key) => {
    try { window.sessionStorage.removeItem(key); } catch {}
  });

  const local = readLocalState();
  const consultantId = String(local?.consultantId || '');
  if (!consultantId || consultantId.startsWith('consultant_prototype_')) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(`${LIFECYCLE_STORAGE_PREFIX}${consultantId}`);
}

function inviteFromFragment() {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const token = String(params.get('invite') || '').trim();
  return token || null;
}

function clearFragment() {
  const clean = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, document.title, clean);
}

async function requestJson(url, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...headers }
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { ok: response.ok, status: response.status, body };
}

function bindCanonicalIdentity(state, identity) {
  return {
    ...(state || {}),
    schemaVersion: SCHEMA_VERSION,
    consultantId: identity?.consultant_id,
    firstName: identity?.first_name,
    fullName: identity?.full_name,
    firm: identity?.firm
  };
}

function fingerprint(state) {
  if (!state) return '';
  return JSON.stringify(state);
}

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export async function bootstrapProductionSession() {
  const status = {
    mode: onServerHost() ? 'server-capable' : 'preview',
    authenticated: false,
    profileStatus: null,
    runtimeV3: null,
    error: null
  };

  if (!onServerHost()) return status;

  const inviteToken = inviteFromFragment();
  let result = null;

  try {
    if (inviteToken) {
      clearFragment();
      clearStaleLocalConsultantData();
      result = await requestJson(API.resolve, {
        method: 'POST',
        body: JSON.stringify({ invite_token: inviteToken })
      });
      if (!result.ok) {
        status.error = result.body?.error || `INVITE_RESOLVE_${result.status}`;
        status.mode = 'invite-error';
        return status;
      }
    } else {
      result = await requestJson(API.profile, { method: 'GET' });
      if (!result.ok) {
        if (result.status === 401) {
          clearStaleLocalConsultantData();
          status.mode = 'preview';
          return status;
        }
        status.error = result.body?.error || `PROFILE_LOAD_${result.status}`;
        status.mode = 'server-error';
        return status;
      }
    }
  } catch (error) {
    status.error = error?.message || 'NETWORK_ERROR';
    status.mode = inviteToken ? 'invite-error' : 'server-error';
    return status;
  }

  const payload = result.body || {};
  const resume = payload.resume_state;
  if (!resume || typeof resume !== 'object') {
    status.error = 'CALIBRATION_SEED_REQUIRED';
    status.mode = 'seed-required';
    return status;
  }

  const state = bindCanonicalIdentity(resume, payload.identity || {});
  writeLocalState(state);
  status.mode = 'authenticated';
  status.authenticated = true;
  status.profileStatus = payload.profile_status || 'NEW';
  status.runtimeV3 = payload.runtime_v3 || null;
  emit('claris:server-session-ready', { status, identity: payload.identity || null });
  return status;
}

export function startProductionPersistence(sessionStatus) {
  if (!sessionStatus?.authenticated || !onServerHost()) return () => {};

  let lastSeen = fingerprint(readLocalState());
  let lastSaved = lastSeen;
  let timer = null;
  let stopped = false;
  let inFlight = Promise.resolve();
  let lockAttemptedFor = '';

  function expireLocalSession() {
    clearStaleLocalConsultantData();
    window.setTimeout(() => window.location.reload(), 120);
  }

  async function save(state) {
    const result = await requestJson(API.profile, {
      method: 'PUT',
      body: JSON.stringify({ calibration_state: state })
    });
    if (!result.ok) {
      if (result.status === 401) expireLocalSession();
      if (result.status === 409 && result.body?.error === 'PROFILE_LOCKED') {
        window.setTimeout(() => window.location.reload(), 120);
      }
      throw new Error(result.body?.error || `PROFILE_SAVE_${result.status}`);
    }
    lastSaved = fingerprint(state);
    emit('claris:server-profile-saved', { result: result.body });
  }

  async function lock(state) {
    const result = await requestJson(API.lock, {
      method: 'POST',
      body: JSON.stringify({ calibration_state: state })
    });
    if (!result.ok) {
      if (result.status === 401) expireLocalSession();
      throw new Error(result.body?.error || `PROFILE_LOCK_${result.status}`);
    }
    const lockedState = { ...state, lockedAt: result.body?.locked_at || state.lockedAt };
    writeLocalState(lockedState);
    lastSeen = fingerprint(lockedState);
    lastSaved = lastSeen;
    emit('claris:server-profile-locked', { result: result.body });
  }

  function queue(task) {
    inFlight = inFlight.then(task, task).catch((error) => {
      emit('claris:server-persistence-error', { error: error.message || String(error) });
    });
  }

  function scheduleSave() {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      const latest = readLocalState();
      if (!latest || latest.lockedAt) return;
      const next = fingerprint(latest);
      if (next === lastSaved) return;
      queue(() => save(latest));
    }, SAVE_DEBOUNCE_MS);
  }

  const poll = window.setInterval(() => {
    if (stopped) return;
    const state = readLocalState();
    if (!state) return;
    const next = fingerprint(state);
    if (next === lastSeen) return;
    lastSeen = next;

    if (state.lockedAt) {
      if (lockAttemptedFor === next) return;
      lockAttemptedFor = next;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      queue(async () => {
        try {
          await lock(state);
        } catch (error) {
          const current = readLocalState();
          if (current?.lockedAt) {
            writeLocalState({ ...current, lockedAt: null });
            window.setTimeout(() => window.location.reload(), 120);
          }
          throw error;
        }
      });
      return;
    }

    scheduleSave();
  }, 400);

  return () => {
    stopped = true;
    window.clearInterval(poll);
    if (timer) window.clearTimeout(timer);
  };
}

export function renderProductionBlock(status) {
  const root = document.getElementById('calibration-root');
  if (!root) return;
  const title = status?.mode === 'seed-required'
    ? 'This calibration is not ready yet.'
    : 'This calibration link could not be opened.';
  const detail = status?.mode === 'seed-required'
    ? 'The consultant identity was verified, but the approved research seed is missing. Nothing has been saved.'
    : 'Please request a fresh CLARIS calibration link.';
  root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:32px;font-family:Inter,system-ui,sans-serif"><div style="max-width:620px;text-align:center"><h1 style="font-weight:300;letter-spacing:-.03em">${title}</h1><p style="opacity:.7;line-height:1.6">${detail}</p></div></div>`;
}
