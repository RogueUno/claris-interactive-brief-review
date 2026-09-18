const ROOT = document.getElementById('clarification-root');
const PREVIEW_HOST_RE = /\.github\.io$/i;
const API = Object.freeze({
  resolve: '/api/clarification/resolve',
  session: '/api/clarification/session',
  submit: '/api/clarification/submit'
});

const previewPackage = {
  schema_version: 'claris_clarification_package_v1',
  opportunity_id: 'opp_preview_acme',
  consultant: { first_name: 'Sarah', firm: 'Northstar Security' },
  prospect: { first_name: 'Alex', company: 'Acme' },
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
  submitting: false
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

function renderQuestion() {
  const stage = shell();
  const pkg = state.clarification;
  const question = pkg.questions[state.step];
  state.draft = cloneAnswer(state.draft ?? state.committed[question.question_id]);

  const scene = el('div', 'scene');
  scene.append(el('p', 'eyebrow', modeLabel(question.mode)));
  scene.append(el('h1', 'question-title', question.prompt));
  if (question.display_context) scene.append(el('div', 'context', question.display_context));

  const answers = el('div', 'answers');
  if (question.response_type === 'SINGLE_CHOICE' || question.response_type === 'MULTI_CHOICE') {
    if (question.response_type === 'MULTI_CHOICE' && !Array.isArray(state.draft)) state.draft = [];
    question.options.forEach((option) => {
      const button = el('button', 'choice');
      button.type = 'button';
      const selected = question.response_type === 'MULTI_CHOICE'
        ? state.draft.includes(option)
        : state.draft === option;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.append(el('span', 'marker'));
      button.append(el('span', 'choice-label', option));
      button.addEventListener('click', () => {
        if (question.response_type === 'MULTI_CHOICE') {
          state.draft = state.draft.includes(option)
            ? state.draft.filter((item) => item !== option)
            : [...state.draft, option];
        } else {
          state.draft = option;
        }
        renderQuestion();
      });
      answers.append(button);
    });
  } else {
    const input = document.createElement('textarea');
    input.className = `text-answer${question.response_type === 'LONG_TEXT' ? ' long' : ''}`;
    input.placeholder = question.response_type === 'LONG_TEXT' ? 'Share the context that matters…' : 'Type your answer…';
    input.value = state.draft || '';
    input.maxLength = question.response_type === 'SHORT_TEXT' ? 500 : 1500;
    input.addEventListener('input', () => { state.draft = input.value; updatePrimary(); });
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
  primary.disabled = !hasAnswer(question, state.draft) || state.submitting;
  primary.dataset.primary = 'true';
  primary.addEventListener('click', async () => {
    if (!hasAnswer(question, state.draft) || state.submitting) return;
    state.committed[question.question_id] = cloneAnswer(state.draft);
    state.draft = undefined;

    if (!last) {
      state.step += 1;
      const next = pkg.questions[state.step];
      state.draft = cloneAnswer(state.committed[next.question_id]);
      renderQuestion();
      return;
    }
    await submit();
  });
  actions.append(primary);
  scene.append(actions);
  stage.append(scene);

  function updatePrimary() {
    primary.disabled = !hasAnswer(question, state.draft) || state.submitting;
  }
}

async function submit() {
  if (state.preview) {
    renderDone(true);
    return;
  }

  state.submitting = true;
  renderQuestion();
  const answers = state.clarification.questions.flatMap((question) => (
    Object.prototype.hasOwnProperty.call(state.committed, question.question_id)
      ? [{ question_id: question.question_id, value: state.committed[question.question_id] }]
      : []
  ));

  const result = await requestJson(API.submit, {
    method: 'POST',
    body: JSON.stringify({
      answers,
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
      ? 'This fixture shows the complete prospect experience. No data was submitted.'
      : `${pkg.consultant.first_name} will have this context before your conversation. There’s nothing else you need to prepare here.`
  ));
  stage.append(scene);
}

async function bootstrap() {
  if (state.preview) {
    state.clarification = previewPackage;
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
      renderBlocked('A private clarification link is required.', 'Open the CLARIS link you received to continue.');
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

  renderIntro();
}

bootstrap();
