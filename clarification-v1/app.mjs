const ROOT = document.getElementById('clarification-root');
const PREVIEW_HOST_RE = /\.github\.io$/i;
const PREVIEW_PROGRESS_KEY = 'claris_clarification_preview_v1';
const API = Object.freeze({
  resolve: '/api/clarification/resolve',
  session: '/api/clarification/session',
  progress: '/api/clarification/progress',
  submit: '/api/clarification/submit'
});

const previewPackage = {
  schema_version: 'claris_clarification_package_v1',
  opportunity_id: 'opp_preview_acme',
  consultant: { first_name: 'Sarah', firm: 'Northstar Security' },
  prospect: { first_name: 'Alex', role: 'VP Engineering', company: 'Acme' },
  intro_context: 'I found a few public signals about Acme’s security program. These questions only clarify what is still uncertain before the conversation.',
  status: 'OPEN',
  expires_at: '2099-01-01T00:00:00.000Z',
  questions: [
    {
      question_id: 'q_priority',
      mode: 'CONFIRM',
      prompt: 'Is SOC 2 still the immediate compliance priority?',
      display_context: 'Acme currently presents SOC 2 readiness publicly as part of its security work.',
      response_type: 'SINGLE_CHOICE',
      options: ['Yes — SOC 2 is the priority', 'No — another framework is more urgent', 'It is still being decided'],
      required: true
    },
    {
      question_id: 'q_owner',
      mode: 'CONTRAST',
      prompt: 'Who will own this initiative internally?',
      display_context: 'Public information points to both an internal security function and external advisory support.',
      response_type: 'SINGLE_CHOICE',
      options: ['Security / GRC', 'Engineering / IT', 'Executive leadership', 'Shared ownership', 'Not decided yet'],
      required: true
    },
    {
      question_id: 'q_trigger',
      mode: 'DISCOVER',
      prompt: 'What made this conversation worth having now?',
      display_context: null,
      response_type: 'LONG_TEXT',
      options: [],
      required: true
    }
  ]
};

let state = {
  preview: PREVIEW_HOST_RE.test(window.location.hostname),
  clarification: null,
  opportunityVersion: null,
  committed: {},
  draft: undefined,
  step: -1,
  submitting: false,
  saving: false
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function shell() {
  const wrapper = el('div', 'clarification-shell');
  const topbar = el('header', 'topbar');
  topbar.append(el('div', 'wordmark', 'CLARIS'));
  topbar.append(el('div', 'private-note', 'Private pre-call clarification'));
  wrapper.append(topbar);
  const stage = el('section', 'stage');
  wrapper.append(stage);
  if (state.preview) wrapper.append(el('div', 'preview-badge', 'Fixture preview'));
  ROOT.replaceChildren(wrapper);
  return stage;
}

function inviteFromFragment() {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const token = raw ? String(new URLSearchParams(raw).get('invite') || '').trim() : '';
  return token || null;
}

function clearFragment() {
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
}

async function requestJson(url, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...headers }
  });
  let body = null;
  try { body = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, body };
}

function readPreviewProgress() {
  try {
    const raw = window.localStorage.getItem(PREVIEW_PROGRESS_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value?.opportunity_id === previewPackage.opportunity_id ? value : null;
  } catch {
    return null;
  }
}

function writePreviewProgress(resumeQuestionId, submitted = false) {
  window.localStorage.setItem(PREVIEW_PROGRESS_KEY, JSON.stringify({
    schema_version: 'claris_clarification_preview_progress_v1',
    opportunity_id: previewPackage.opportunity_id,
    resume_question_id: resumeQuestionId || null,
    submitted,
    answers: answerPayload()
  }));
}

function clearPreviewProgress() {
  try { window.localStorage.removeItem(PREVIEW_PROGRESS_KEY); } catch {}
}

function renderBlocked(title, detail) {
  const stage = shell();
  const scene = el('div', 'scene blocked');
  scene.append(el('p', 'eyebrow', 'Private clarification'));
  scene.append(el('h1', '', title));
  scene.append(el('p', 'lede', detail));
  stage.append(scene);
}

function renderIntro() {
  const stage = shell();
  const pkg = state.clarification;
  const scene = el('div', 'scene');
  scene.append(el('p', 'eyebrow', 'Before your conversation'));
  scene.append(el('h1', '', `A few details for ${pkg.consultant.first_name}, ${pkg.prospect.first_name}.`));
  scene.append(el('p', 'lede',
    `CLARIS has already done the background research on ${pkg.prospect.company}. I only need ${pkg.questions.length === 1 ? 'one detail' : `${pkg.questions.length} details`} that public information can’t settle reliably.`
  ));
  if (pkg.intro_context) scene.append(el('div', 'context', pkg.intro_context));

  const actions = el('div', 'actions');
  const button = el('button', 'primary', 'Continue');
  button.type = 'button';
  button.addEventListener('click', () => {
    state.step = 0;
    state.draft = cloneAnswer(state.committed[pkg.questions[0].question_id]);
    renderQuestion();
  });
  actions.append(button);
  scene.append(actions);
  stage.append(scene);
}

function modeLabel(mode) {
  if (mode === 'CONFIRM') return 'A quick check';
  if (mode === 'CONTRAST') return 'One detail to reconcile';
  return 'A little context';
}

function cloneAnswer(value) {
  return Array.isArray(value) ? [...value] : value;
}

function hasAnswer(question, value) {
  if (!question.required) return true;
  if (Array.isArray(value)) return value.length > 0;
  return value != null && String(value).trim() !== '';
}

function answerPayload() {
  if (!state.clarification) return [];
  return state.clarification.questions.flatMap((question) => (
    Object.prototype.hasOwnProperty.call(state.committed, question.question_id)
      ? [{ question_id: question.question_id, value: state.committed[question.question_id] }]
      : []
  ));
}

function applyProgress(progress) {
  state.committed = {};
  for (const answer of progress?.answers || []) {
    if (answer?.question_id) state.committed[answer.question_id] = cloneAnswer(answer.value);
  }

  const resumeId = String(progress?.resume_question_id || '').trim();
  const index = state.clarification?.questions?.findIndex((question) => question.question_id === resumeId) ?? -1;
  if (index >= 0) {
    state.step = index;
    state.draft = cloneAnswer(state.committed[resumeId]);
    return true;
  }

  state.step = -1;
  state.draft = undefined;
  return false;
}

async function recoverServerProgress() {
  const latest = await requestJson(API.session, { method: 'GET' });
  if (!latest.ok || !latest.body?.clarification) return false;
  state.clarification = latest.body.clarification;
  state.opportunityVersion = latest.body.opportunity_version || null;
  return applyProgress(latest.body.progress);
}

async function persistProgress(resumeQuestionId) {
  if (state.preview) {
    writePreviewProgress(resumeQuestionId, false);
    return true;
  }

  state.saving = true;
  const result = await requestJson(API.progress, {
    method: 'PUT',
    body: JSON.stringify({
      answers: answerPayload(),
      resume_question_id: resumeQuestionId,
      opportunity_version: state.opportunityVersion
    })
  });
  state.saving = false;

  if (result.ok) {
    state.opportunityVersion = result.body?.opportunity_version || state.opportunityVersion;
    return true;
  }

  if (result.status === 409 && result.body?.error === 'CLARIFICATION_CONFLICT') {
    const recovered = await recoverServerProgress();
    if (recovered) renderQuestion('This page was refreshed from your latest saved answers.');
    return false;
  }

  if (result.status === 401) {
    renderBlocked('This private session is no longer active.', 'Please reopen the latest CLARIS clarification link you received.');
    return false;
  }

  return false;
}

function renderQuestion(notice = '') {
  const stage = shell();
  const pkg = state.clarification;
  const question = pkg.questions[state.step];
  state.draft = cloneAnswer(state.draft ?? state.committed[question.question_id]);

  const scene = el('div', 'scene');
  scene.append(el('p', 'eyebrow', modeLabel(question.mode)));
  scene.append(el('h1', 'question-title', question.prompt));
  if (question.display_context) scene.append(el('div', 'context', question.display_context));

  const answers = el('div', 'answers');
  const choiceButtons = [];

  if (question.response_type === 'SINGLE_CHOICE' || question.response_type === 'MULTI_CHOICE') {
    if (question.response_type === 'MULTI_CHOICE' && !Array.isArray(state.draft)) state.draft = [];

    question.options.forEach((option) => {
      const button = el('button', 'choice');
      button.type = 'button';
      button.append(el('span', 'marker'));
      button.append(el('span', 'choice-label', option));
      choiceButtons.push({ button, option });

      button.addEventListener('click', () => {
        if (question.response_type === 'MULTI_CHOICE') {
          state.draft = state.draft.includes(option)
            ? state.draft.filter((item) => item !== option)
            : [...state.draft, option];
        } else {
          state.draft = option;
        }
        syncChoiceButtons();
        updatePrimary();
      });
      answers.append(button);
    });
  } else {
    const input = document.createElement('textarea');
    input.className = `text-answer${question.response_type === 'LONG_TEXT' ? ' long' : ''}`;
    input.placeholder = question.response_type === 'LONG_TEXT' ? 'Share the context that matters…' : 'Type your answer…';
    input.value = state.draft || '';
    input.maxLength = question.response_type === 'SHORT_TEXT' ? 500 : 1500;
    input.addEventListener('input', () => {
      state.draft = input.value;
      updatePrimary();
    });
    answers.append(input);
  }
  scene.append(answers);

  const actions = el('div', 'actions');
  if (state.step > 0) {
    const back = el('button', 'secondary', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => {
      state.draft = undefined;
      state.step -= 1;
      const previous = pkg.questions[state.step];
      state.draft = cloneAnswer(state.committed[previous.question_id]);
      renderQuestion();
    });
    actions.append(back);
  }

  const last = state.step === pkg.questions.length - 1;
  const primary = el('button', 'primary', last ? 'Send securely' : 'Continue');
  primary.type = 'button';
  primary.dataset.primary = 'true';
  primary.addEventListener('click', async () => {
    if (!hasAnswer(question, state.draft) || state.submitting || state.saving) return;

    state.committed[question.question_id] = cloneAnswer(state.draft);
    state.draft = undefined;

    if (!last) {
      const nextStep = state.step + 1;
      const next = pkg.questions[nextStep];
      primary.disabled = true;
      primary.textContent = 'Saving…';

      const saved = await persistProgress(next.question_id);
      if (!saved) {
        if (ROOT.querySelector('.blocked')) return;
        primary.textContent = 'Continue';
        updatePrimary();
        showError('I could not save that answer. Nothing was submitted. Please try Continue again.');
        return;
      }

      state.step = nextStep;
      state.draft = cloneAnswer(state.committed[next.question_id]);
      renderQuestion();
      return;
    }

    primary.disabled = true;
    primary.textContent = 'Sending…';
    await submit();
  });
  actions.append(primary);
  scene.append(actions);

  const message = el('div', 'error', notice);
  if (!notice) message.hidden = true;
  scene.append(message);
  stage.append(scene);

  syncChoiceButtons();
  updatePrimary();

  function syncChoiceButtons() {
    for (const { button, option } of choiceButtons) {
      const selected = question.response_type === 'MULTI_CHOICE'
        ? state.draft.includes(option)
        : state.draft === option;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  }

  function updatePrimary() {
    primary.disabled = !hasAnswer(question, state.draft) || state.submitting || state.saving;
  }

  function showError(text) {
    message.textContent = text;
    message.hidden = false;
  }
}

async function submit() {
  if (state.preview) {
    state.submitting = false;
    writePreviewProgress(null, true);
    renderDone(true);
    return;
  }

  state.submitting = true;
  const result = await requestJson(API.submit, {
    method: 'POST',
    body: JSON.stringify({
      answers: answerPayload(),
      opportunity_version: state.opportunityVersion
    })
  });
  state.submitting = false;

  if (result.ok) {
    state.opportunityVersion = result.body?.opportunity_version || state.opportunityVersion;
    renderDone(false);
    return;
  }

  if (result.status === 409 && result.body?.error === 'CLARIFICATION_ALREADY_SUBMITTED') {
    renderDone(false);
    return;
  }

  if (result.status === 409 && result.body?.error === 'CLARIFICATION_CONFLICT') {
    const recovered = await recoverServerProgress();
    if (recovered) {
      renderQuestion('This page was refreshed from your latest saved answers. Please review and send again.');
      return;
    }
  }

  if (result.status === 401) {
    renderBlocked('This private session is no longer active.', 'Please reopen the latest CLARIS clarification link you received.');
    return;
  }

  const stage = shell();
  const scene = el('div', 'scene');
  scene.append(el('p', 'eyebrow', 'Could not submit'));
  scene.append(el('h1', 'question-title', 'Your answers were not changed.'));
  scene.append(el('p', 'lede', 'Please reopen your private CLARIS link and try again. Nothing was partially submitted.'));
  stage.append(scene);
}

function renderDone(preview) {
  const stage = shell();
  const pkg = state.clarification;
  const scene = el('div', 'scene');
  scene.append(el('div', 'done-mark'));
  scene.append(el('p', 'eyebrow', preview ? 'Preview complete' : 'Sent securely'));
  scene.append(el('h1', '', `Thank you, ${pkg.prospect.first_name}. You’re all set.`));
  scene.append(el('p', 'lede',
    preview
      ? 'This fixture shows the complete prospect experience. Its preview progress is saved only in this browser.'
      : `${pkg.consultant.first_name} will have this context before your conversation. There’s nothing else you need to prepare here.`
  ));

  if (preview) {
    const actions = el('div', 'actions');
    const restart = el('button', 'secondary', 'Restart preview');
    restart.type = 'button';
    restart.addEventListener('click', () => {
      clearPreviewProgress();
      state.committed = {};
      state.draft = undefined;
      state.step = -1;
      renderIntro();
    });
    actions.append(restart);
    scene.append(actions);
  }

  stage.append(scene);
}

async function bootstrap() {
  if (state.preview) {
    state.clarification = previewPackage;
    const progress = readPreviewProgress();
    if (progress?.submitted) {
      for (const answer of progress.answers || []) {
        if (answer?.question_id) state.committed[answer.question_id] = cloneAnswer(answer.value);
      }
      renderDone(true);
      return;
    }
    if (progress && applyProgress(progress)) {
      renderQuestion();
      return;
    }
    renderIntro();
    return;
  }

  const inviteToken = inviteFromFragment();
  let result;
  try {
    if (inviteToken) {
      clearFragment();
      result = await requestJson(API.resolve, {
        method: 'POST',
        body: JSON.stringify({ invite_token: inviteToken })
      });
    } else {
      result = await requestJson(API.session, { method: 'GET' });
    }
  } catch {
    renderBlocked('This clarification could not be opened.', 'Please use the private CLARIS link you received or request a fresh one.');
    return;
  }

  if (!result.ok) {
    if (result.status === 401) {
      renderBlocked('A private clarification link is required.', 'Open the latest CLARIS link you received to continue.');
    } else if (result.status === 410) {
      renderBlocked('This clarification link has expired.', 'Please request a fresh link before your conversation.');
    } else {
      renderBlocked('This clarification could not be opened.', 'Please use the private CLARIS link you received or request a fresh one.');
    }
    return;
  }

  state.clarification = result.body?.clarification;
  state.opportunityVersion = result.body?.opportunity_version || null;

  if (!state.clarification) {
    renderBlocked('This clarification is not ready.', 'No prospect questions are available for this opportunity.');
    return;
  }

  if (result.body?.status === 'SUBMITTED') {
    renderDone(false);
    return;
  }

  if (state.clarification.status === 'NO_CLARIFICATION' || state.clarification.questions.length === 0) {
    renderBlocked('Nothing else is needed.', `${state.clarification.consultant.first_name} already has enough context for the conversation.`);
    return;
  }

  if (result.body?.progress && applyProgress(result.body.progress)) {
    renderQuestion();
    return;
  }

  renderIntro();
}

bootstrap();
