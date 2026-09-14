import { loadState, saveState, resetState, greeting } from './state.js';
import { addShell, setChapter, questionScene, revealWords, showInsight, choice, primary, iconButton, expandableInput, el, wireGlass, formatMoney } from './ui.js';

const root = document.getElementById('calibration-root');
let state = loadState();
const flow = ['services', 'icp', 'economics', 'review'];
const chapters = { services: 'Practice', icp: 'Opportunity', economics: 'Commercial', review: 'Review' };
const beats = [
  () => `${greeting()}, ${state.firstName}.`,
  () => 'I’m CLARIS.',
  () => 'Before I prepare opportunities the way you do,',
  () => 'I want to understand how your practice works.',
  () => 'I’ve already reviewed what I can.',
  () => 'So I’ll only ask about what actually matters.'
];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let transitioning = false;

function render() {
  const stage = addShell(root);
  if (state.phase === 'boot') return renderBoot(stage);
  const step = flow[state.currentStep] || 'review';
  setChapter(chapters[step], true);
  if (step === 'services') return renderServices(stage);
  if (step === 'icp') return renderIcp(stage);
  if (step === 'economics') return renderEconomics(stage);
  renderReview(stage);
}

async function renderBoot(stage) {
  setChapter('', false);
  const scene = el('div', 'scene boot-scene');
  const copy = el('div', 'boot-copy');
  const line = el('h1', 'hero-line');
  const index = Math.min(state.bootIndex, beats.length - 1);
  const duration = revealWords(line, beats[index](), index === 0 ? 155 : 145);
  copy.appendChild(line);
  scene.appendChild(copy);
  stage.appendChild(scene);

  if (index === beats.length - 1) {
    await wait(duration + 380);
    if (state.phase !== 'boot' || state.bootIndex !== index) return;
    const start = primary('Begin calibration', () => startCalibration(scene));
    start.classList.add('boot-action');
    scene.appendChild(start);
    requestAnimationFrame(() => start.classList.add('is-visible'));
    return;
  }

  await wait(duration + 620);
  if (state.phase !== 'boot' || state.bootIndex !== index) return;
  scene.classList.add('is-exiting');
  await wait(560);
  if (state.phase !== 'boot' || state.bootIndex !== index) return;
  state.bootIndex += 1;
  saveState(state);
  render();
}

function startCalibration(scene) {
  state.phase = 'calibration';
  state.currentStep = 0;
  saveState(state);
  scene.classList.add('is-exiting');
  setChapter('Practice', true);
  setTimeout(render, 720);
}

async function transitionTo(nextIndex, message = '') {
  if (transitioning) return;
  transitioning = true;

  document.querySelector('#stage .scene')?.classList.add('is-exiting');
  state.currentStep = Math.max(0, Math.min(nextIndex, flow.length - 1));
  saveState(state);
  setChapter(chapters[flow[state.currentStep]], true);

  await wait(610);

  if (message) {
    const stage = addShell(root);
    const transition = el('div', 'scene transition-scene');
    transition.appendChild(el('p', 'transition-thought', message));
    stage.appendChild(transition);
    await wait(1080);
    transition.classList.add('is-exiting');
    await wait(560);
  }

  transitioning = false;
  render();
}

function next(message) { transitionTo(state.currentStep + 1, message); }

function appendActions(zone, label, onContinue) {
  const row = el('div', 'answer-actions');
  if (state.currentStep > 0) {
    row.appendChild(iconButton('arrow-left', 'Back', () => transitionTo(state.currentStep - 1), 'back-action'));
  }
  row.appendChild(primary(label, onContinue));
  zone.appendChild(row);
}

function renderServices(stage) {
  const scene = questionScene(stage,
    `I found ${state.services.length} services in ${state.firm}’s public material.`,
    'Which are you actively taking on right now?',
    'Your operating profile can differ from what the website happens to advertise.'
  );
  const zone = el('div', 'answer-zone answer-zone--stack');
  const list = el('div', 'choice-list choice-list--stack');
  state.services.forEach((service) => {
    list.appendChild(choice(service.name, service.selected, (button) => {
      service.selected = !service.selected;
      button.setAttribute('aria-pressed', String(service.selected));
      saveState(state);
    }));
  });
  const tools = el('div', 'answer-tools');
  tools.appendChild(expandableInput('Add a service', (name) => {
    const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    state.services.push({ service_id: `SVC_${slug}`, name, selected: true, state: 'ACTIVE', preference: 'CORE' });
    saveState(state);
    render();
  }));
  zone.append(list, tools);
  appendActions(zone, 'Continue', () => {
    const active = state.services.filter((item) => item.selected);
    if (!active.length) return showInsight(root, 'Select at least one active service so I can calibrate service fit.');
    next(active.length === 1 ? 'That answer is specific enough. I can skip a separate priority question.' : 'I’ve got the active service set.');
  });
  scene.appendChild(zone);
}

function renderIcp(stage) {
  const scene = questionScene(stage,
    'Your public positioning points mostly toward B2B technology companies.',
    'How should I understand your actual target market today?',
    'Choose the company types that belong in the core profile.'
  );
  const candidates = ['B2B SaaS', 'Software', 'FinTech', 'HealthTech', 'AI / Cloud infrastructure'];
  const selected = new Set([...(state.companyTypes || []), ...(state.customCompanyTypes || [])]);
  const zone = el('div', 'answer-zone answer-zone--grid');
  const grid = el('div', 'choice-list choice-list--grid');
  candidates.forEach((value) => {
    grid.appendChild(choice(value, selected.has(value), (button) => {
      selected.has(value) ? selected.delete(value) : selected.add(value);
      state.companyTypes = candidates.filter((item) => selected.has(item));
      state.customCompanyTypes = [...selected].filter((item) => !candidates.includes(item));
      button.setAttribute('aria-pressed', String(selected.has(value)));
      saveState(state);
    }));
  });
  (state.customCompanyTypes || []).forEach((value) => {
    grid.appendChild(choice(value, true, () => {
      state.customCompanyTypes = state.customCompanyTypes.filter((item) => item !== value);
      saveState(state);
      render();
    }));
  });
  const tools = el('div', 'answer-tools');
  tools.appendChild(expandableInput('Add a company type', (value) => {
    state.customCompanyTypes = [...new Set([...(state.customCompanyTypes || []), value])];
    saveState(state);
    render();
  }));
  zone.append(grid, tools);
  appendActions(zone, 'Continue', () => {
    if (!(state.companyTypes.length + state.customCompanyTypes.length)) return showInsight(root, 'Choose at least one company type for the operating ICP.');
    next('That gives me a cleaner best-fit opportunity model.');
  });
  scene.appendChild(zone);
}

function renderEconomics(stage) {
  const scene = questionScene(stage,
    'One commercial guardrail.',
    'What is the smallest engagement that is commercially worth taking on?',
    'I’ll use your floor without inferring a prospect’s budget from weak signals.'
  );
  const zone = el('div', 'answer-zone answer-zone--stack');
  const control = wireGlass(el('div', 'money-control glass'));
  control.appendChild(el('span', 'currency-label', state.currency));
  const input = el('input');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.value = state.minimumEngagement || '';
  input.placeholder = '7500';
  input.setAttribute('aria-label', 'Minimum viable engagement');
  input.addEventListener('input', () => {
    state.minimumEngagement = Number(input.value || 0);
    saveState(state);
  });
  control.appendChild(input);
  control.appendChild(el('span', 'money-caption', 'minimum'));
  zone.appendChild(control);
  appendActions(zone, 'Review calibration', () => {
    if (!Number(state.minimumEngagement)) return showInsight(root, 'Add the commercial floor you want CLARIS to use.');
    next(`I’ll treat ${formatMoney(state.minimumEngagement, state.currency)} as the commercial floor.`);
  });
  scene.appendChild(zone);
}

function renderReview(stage) {
  const scene = el('div', 'scene review-scene');
  const head = el('div', 'review-head');
  head.appendChild(el('p', 'review-eyebrow', 'Operating profile'));
  head.appendChild(el('h1', 'review-title', `Calibration complete, ${state.firstName}.`));
  head.appendChild(el('p', 'review-sub', `Here’s the model I’ll use when I prepare opportunities for ${state.firm}.`));
  scene.appendChild(head);
  const grid = el('div', 'review-grid');
  const active = state.services.filter((item) => item.selected);
  grid.append(
    reviewCard('Practice', active.map((item) => item.name).join(' · '), `${active.length} confirmed active services`),
    reviewCard('Best-fit opportunity', [...state.companyTypes, ...state.customCompanyTypes].join(' · '), 'Consultant-confirmed operating ICP'),
    reviewCard('Commercial guardrail', formatMoney(state.minimumEngagement, state.currency), 'Budget remains direct-evidence only')
  );
  scene.appendChild(grid);

  const actions = el('div', 'review-actions');
  actions.appendChild(iconButton('arrow-left', 'Back', () => transitionTo(state.currentStep - 1), 'back-action'));
  const lock = primary(state.lockedAt ? 'Operating profile locked' : 'Lock operating profile', () => {
    state.lockedAt = new Date().toISOString();
    saveState(state);
    showInsight(root, 'Done. I’ll use this profile when I prepare your opportunities.');
    setTimeout(render, 460);
  });
  lock.disabled = Boolean(state.lockedAt);
  actions.appendChild(lock);
  scene.appendChild(actions);
  stage.appendChild(scene);
}

function reviewCard(title, value, meta) {
  const card = el('article', 'review-card');
  card.append(el('h3', '', title), el('p', 'review-value', value || 'Still open'), el('p', 'review-meta', meta));
  return card;
}

window.__CLARIS_CALIBRATION_PREVIEW__ = { reset() { state = resetState(); render(); } };
render();
