const ROOT = document.getElementById('clarification-root');
const PREVIEW_HOST_RE = /\.github\.io$/i;
const PREVIEW_PROGRESS_KEY = 'claris_clarification_preview_v2';
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
  intro_context: 'We already have most of the context on Acme and your role. These quick checks only resolve what the available signals cannot settle reliably.',
  status: 'OPEN',
  expires_at: '2099-01-01T00:00:00.000Z',
  questions: [
    {
      question_id: 'q_priority',
      mode: 'CONFIRM',
      prompt: 'Is SOC 2 still the immediate priority?',
      display_context: 'We can see SOC 2 is part of Acme’s current security story. A quick check helps us avoid assuming it is still the main priority.',
      response_type: 'SINGLE_CHOICE',
      options: [
        { option_id: 'priority_soc2', label: 'Yes — SOC 2 is the priority' },
        { option_id: 'priority_other_framework', label: 'Another framework or requirement is more urgent' },
        { option_id: 'priority_deciding', label: 'We’re still deciding what comes first' }
      ],
      allow_other: true,
      allow_unsure: true,
      other_label: 'Something else',
      unsure_label: 'Not sure yet',
      required: true
    },
    {
      question_id: 'q_owner',
      mode: 'CONTRAST',
      prompt: 'Who is most likely to own this internally?',
      display_context: 'We have signals pointing to both your engineering role and a broader compliance initiative, so we’d rather confirm the owner than guess.',
      response_type: 'SINGLE_CHOICE',
      options: [
        { option_id: 'owner_engineering', label: 'Engineering / IT' },
        { option_id: 'owner_security', label: 'Security / GRC' },
        { option_id: 'owner_shared', label: 'Shared ownership across teams' }
      ],
      allow_other: true,
      allow_unsure: true,
      other_label: 'Someone else',
      unsure_label: 'Not sure yet',
      required: true
    },
    {
      question_id: 'q_trigger',
      mode: 'DISCOVER',
      prompt: 'What best describes why this became a priority now?',
      display_context: 'We already have most of the background. This just helps us understand what changed recently.',
      response_type: 'SINGLE_CHOICE',
      options: [
        { option_id: 'trigger_customer', label: 'A customer or prospect is asking for security or compliance evidence' },
        { option_id: 'trigger_upmarket', label: 'Larger customers are raising the security bar' },
        { option_id: 'trigger_deadline', label: 'A compliance milestone or deadline is approaching' },
        { option_id: 'trigger_maturing', label: 'We’re formalizing security as the company grows' }
      ],
      allow_other: true,
      allow_unsure: true,
      other_label: 'Something else',
      unsure_label: 'Not sure yet',
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

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
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
    schema_version: 'claris_clarification_preview_progress_v2',
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
  scene.append(el('h1', '', `We already have most of the context, ${pkg.prospect.first_name}.`));
  scene.append(el('p', 'lede',
    `Just ${pkg.questions.length === 1 ? 'one quick check' : `${pkg.questions.length} quick checks`} will help ${pkg.consultant.first_name} focus the conversation on what matters most right now.`
  ));
  if (pkg.intro_context) scene.append(el('div', 'context', pkg.intro_context));

  const actions = el('div', 'actions');
  const button = el('button', 'primary', 'Continue');
  button.type = 'button';
  button.addEventListener('click', () => {
    state.step = 0;
    state.draft = deepClone(state.committed[pkg.questions[0].question_id]);
    renderQuestion();
  });
  actions.append(button);
  scene.append(actions);
  stage.append(scene);
}

function modeLabel(mode) {
  if (mode === 'CONFIRM') return 'A quick check';
  if (mode === 'CONTRAST') return 'One thing to confirm';
  return 'One last detail';
}

function isChoice(question) {
  return question.response_type === 'SINGLE_CHOICE' || question.response_type === 'MULTI_CHOICE';
}

function optionId(option) {
  return typeof option === 'string' ? option : option?.option_id;
}

function optionLabel(option) {
  return typeof option === 'string' ? option : option?.label;
}

function isValidSingleChoice(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const kind = String(value.kind || '').toUpperCase();
  if (kind === 'OPTION') return Boolean(value.option_id);
  if (kind === 'UNSURE') return true;
  if (kind === 'OTHER') return Boolean(String(value.text || '').trim());
  return false;
}

function hasAnswer(question, value) {
  if (!question.required) return true;
  if (question.response_type === 'SINGLE_CHOICE') return isValidSingleChoice(value);
  if (question.response_type === 'MULTI_CHOICE') {
    return Array.isArray(value) && value.length > 0 && value.every(isValidSingleChoice);
  }
  return value != null && String(value).trim() !== '';
}

function answerPayload() {
  if (!state.clarification) return [];
  return state.clarification.questions.flatMap((question) => (
    Object.prototype.hasOwnProperty.call(state.committed, question.question_id)
      ? [{ question_id: question.question_id, value: deepClone(state.committed[question.question_id]) }]
      : []
  ));
}

function legacyChoiceValue(question, value) {
  const match = (question.options || []).find((option) => optionLabel(option) === value || optionId(option) === value);
  return match ? { kind: 'OPTION', option_id: optionId(match) } : value;
}

function clientValueFromStoredAnswer(question, answer) {
  if (!answer) return undefined;

  if (!answer.answer_kind) {
    if (isChoice(question) && typeof answer.value === 'string') return legacyChoiceValue(question, answer.value);
    return deepClone(answer.value);
  }

  if (answer.answer_kind === 'OPTION') {
    return { kind: 'OPTION', option_id: answer.selected_option_id };
  }
  if (answer.answer_kind === 'OTHER') {
    return { kind: 'OTHER', text: String(answer.value || '') };
  }
  if (answer.answer_kind === 'UNSURE') {
    return { kind: 'UNSURE' };
  }
  if (answer.answer_kind === 'MULTI' && Array.isArray(answer.value)) {
    return answer.value.map((item) => {
      if (item.answer_kind === 'OPTION') return { kind: 'OPTION', option_id: item.selected_option_id };
      if (item.answer_kind === 'OTHER') return { kind: 'OTHER', text: String(item.value || '') };
      return { kind: 'UNSURE' };
    });
  }
  return deepClone(answer.value);
}

function applyProgress(progress) {
  state.committed = {};
  for (const answer of progress?.answers || []) {
    if (!answer?.question_id) continue;
    const question = state.clarification?.questions?.find((item) => item.question_id === answer.question_id);
    if (!question) continue;
    state.committed[answer.question_id] = clientValueFromStoredAnswer(question, answer);
  }

  const resumeId = String(progress?.resume_question_id || '').trim();
  const index = state.clarification?.questions?.findIndex((question) => question.question_id === resumeId) ?? -1;
  if (index >= 0) {
    state.step = index;
    state.draft = deepClone(state.committed[resumeId]);
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
    if (recovered) renderQuestion('We refreshed this page from your latest saved answers.');
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
  state.draft = deepClone(state.draft ?? state.committed[question.question_id]);

  const scene = el('div', 'scene');
  scene.append(el('p', 'eyebrow', modeLabel(question.mode)));
  scene.append(el('h1', 'question-title', question.prompt));
  if (question.display_context) scene.append(el('div', 'context', question.display_context));

  const answers = el('div', 'answers');
  const choiceButtons = [];
  let otherInput = null;
  let otherWrap = null;

  function singleSelected(kind, id = null) {
    if (!state.draft || Array.isArray(state.draft)) return false;
    if (state.draft.kind !== kind) return false;
    return kind !== 'OPTION' || state.draft.option_id === id;
  }

  function multiSelected(kind, id = null) {
    if (!Array.isArray(state.draft)) return false;
    return state.draft.some((item) => item?.kind === kind && (kind !== 'OPTION' || item.option_id === id));
  }

  function choiceSelected(kind, id = null) {
    return question.response_type === 'MULTI_CHOICE'
      ? multiSelected(kind, id)
      : singleSelected(kind, id);
  }

  function setSingle(value) {
    state.draft = value;
  }

  function toggleMulti(value) {
    if (!Array.isArray(state.draft)) state.draft = [];
    const exists = state.draft.findIndex((item) => (
      item?.kind === value.kind &&
      (value.kind !== 'OPTION' || item.option_id === value.option_id)
    ));
    if (exists >= 0) state.draft.splice(exists, 1);
    else state.draft.push(value);
  }

  function selectChoice(value) {
    if (question.response_type === 'MULTI_CHOICE') toggleMulti(value);
    else setSingle(value);
    syncChoiceButtons();
    syncOtherInput();
    updatePrimary();
  }

  function addChoice(label, kind, id = null) {
    const button = el('button', 'choice');
    button.type = 'button';
    button.append(el('span', 'marker'));
    button.append(el('span', 'choice-label', label));
    choiceButtons.push({ button, kind, id });
    button.addEventListener('click', () => {
      if (kind === 'OTHER') {
        const existingText = question.response_type === 'MULTI_CHOICE'
          ? (Array.isArray(state.draft) ? state.draft.find((item) => item?.kind === 'OTHER')?.text : '')
          : (state.draft?.kind === 'OTHER' ? state.draft.text : '');
        selectChoice({ kind: 'OTHER', text: existingText || '' });
        window.requestAnimationFrame(() => otherInput?.focus());
        return;
      }
      selectChoice(kind === 'OPTION' ? { kind: 'OPTION', option_id: id } : { kind: 'UNSURE' });
    });
    answers.append(button);
  }

  if (isChoice(question)) {
    if (question.response_type === 'MULTI_CHOICE' && !Array.isArray(state.draft)) state.draft = [];

    for (const option of question.options || []) {
      addChoice(optionLabel(option), 'OPTION', optionId(option));
    }
    if (question.allow_unsure) addChoice(question.unsure_label || 'Not sure yet', 'UNSURE');
    if (question.allow_other) addChoice(question.other_label || 'Something else', 'OTHER');

    if (question.allow_other) {
      otherWrap = el('div', 'other-answer');
      otherInput = document.createElement('textarea');
      otherInput.className = 'text-answer';
      otherInput.placeholder = 'Tell us in a few words…';
      otherInput.maxLength = 500;
      otherInput.rows = 2;
      otherInput.addEventListener('input', () => {
        if (question.response_type === 'MULTI_CHOICE') {
          const item = Array.isArray(state.draft) ? state.draft.find((entry) => entry?.kind === 'OTHER') : null;
          if (item) item.text = otherInput.value;
        } else if (state.draft?.kind === 'OTHER') {
          state.draft.text = otherInput.value;
        }
        updatePrimary();
      });
      otherWrap.append(otherInput);
      answers.append(otherWrap);
    }
  } else {
    const input = document.createElement('textarea');
    input.className = `text-answer${question.response_type === 'LONG_TEXT' ? ' long' : ''}`;
    input.placeholder = 'Tell us what matters in a few words…';
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
      state.draft = deepClone(state.committed[previous.question_id]);
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

    state.committed[question.question_id] = deepClone(state.draft);
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
        showError('We could not save that answer. Nothing was submitted. Please try Continue again.');
        return;
      }

      state.step = nextStep;
      state.draft = deepClone(state.committed[next.question_id]);
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
  syncOtherInput();
  updatePrimary();

  function syncChoiceButtons() {
    for (const { button, kind, id } of choiceButtons) {
      button.setAttribute('aria-pressed', choiceSelected(kind, id) ? 'true' : 'false');
    }
  }

  function syncOtherInput() {
    if (!otherWrap || !otherInput) return;
    const selected = choiceSelected('OTHER');
    otherWrap.hidden = !selected;
    if (!selected) return;
    const value = question.response_type === 'MULTI_CHOICE'
      ? (Array.isArray(state.draft) ? state.draft.find((item) => item?.kind === 'OTHER')?.text : '')
      : (state.draft?.kind === 'OTHER' ? state.draft.text : '');
    if (otherInput.value !== (value || '')) otherInput.value = value || '';
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
      renderQuestion('We refreshed this page from your latest saved answers. Please review and send again.');
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
  scene.append(el('h1', '', 'Perfect — that’s all we need.'));
  scene.append(el('p', 'lede',
    preview
      ? 'This fixture shows the complete low-friction prospect experience. Its preview progress is saved only in this browser.'
      : `${pkg.consultant.first_name} will have this context before your conversation, so you do not need to prepare anything else here.`
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
        if (answer?.question_id) state.committed[answer.question_id] = deepClone(answer.value);
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
