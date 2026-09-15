import { loadState, saveState, resetState, greeting } from './state.js';
import { addShell, setChapter, questionScene, revealWords, showInsight, choice, primary, iconButton, expandableInput, el, wireGlass, formatMoney } from './ui.js';

const root = document.getElementById('calibration-root');
let state = loadState();
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

const SERVICE_STATE_OPTIONS = [
  { value: 'ACTIVE', label: 'Actively taking this on' },
  { value: 'SELECTIVE', label: 'Selective — only strong-fit cases' },
  { value: 'PAUSED', label: 'Paused for now' },
  { value: 'NO_LONGER', label: 'No longer part of the offer' }
];

const PAUSED_POLICY_OPTIONS = [
  { value: 'EXPLICIT_ONLY', label: 'Only surface it if the prospect explicitly asks' },
  { value: 'HIDE', label: 'Keep it out of opportunity briefs for now' }
];

function selectedServices() {
  return state.services.filter((service) => service.selected);
}

function currentServices() {
  return selectedServices().filter((service) => service.state === 'ACTIVE' || service.state === 'SELECTIVE');
}

function pausedServices() {
  return selectedServices().filter((service) => service.state === 'PAUSED');
}

function practiceSteps() {
  const steps = ['practice_services'];
  selectedServices().forEach((service) => steps.push(`practice_state:${service.service_id}`));
  if (currentServices().length > 1) steps.push('practice_lead');
  pausedServices().forEach((service) => steps.push(`practice_paused:${service.service_id}`));
  return steps;
}

function flow() {
  return [...practiceSteps(), 'icp', 'economics', 'review'];
}

function chapterFor(step) {
  if (step.startsWith('practice_')) return 'Practice';
  if (step === 'icp') return 'Opportunity';
  if (step === 'economics') return 'Commercial';
  return 'Review';
}

function serviceFromStep(step) {
  const [, serviceId] = step.split(':');
  return state.services.find((service) => service.service_id === serviceId);
}

function render() {
  const stage = addShell(root);
  if (state.phase === 'boot') return renderBoot(stage);

  const steps = flow();
  state.currentStep = Math.max(0, Math.min(Number(state.currentStep || 0), steps.length - 1));
  const step = steps[state.currentStep] || 'review';
  setChapter(chapterFor(step), true);

  if (step === 'practice_services') return renderPracticeServices(stage);
  if (step.startsWith('practice_state:')) return renderPracticeState(stage, serviceFromStep(step));
  if (step === 'practice_lead') return renderPracticeLead(stage);
  if (step.startsWith('practice_paused:')) return renderPracticePaused(stage, serviceFromStep(step));
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
  setTimeout(render, 900);
}

async function transitionTo(nextIndex, message = '') {
  if (transitioning) return;
  transitioning = true;

  const steps = flow();
  document.querySelector('#stage .scene')?.classList.add('is-exiting');
  state.currentStep = Math.max(0, Math.min(nextIndex, steps.length - 1));
  saveState(state);
  const nextStep = flow()[state.currentStep] || 'review';
  setChapter(chapterFor(nextStep), true);

  await wait(780);

  if (message) {
    const stage = addShell(root);
    const transition = el('div', 'scene transition-scene');
    transition.appendChild(el('p', 'transition-thought', message));
    stage.appendChild(transition);
    await wait(1500);
    transition.classList.add('is-exiting');
    await wait(700);
  }

  transitioning = false;
  render();
}

function next(message = '') {
  transitionTo(state.currentStep + 1, message);
}

function previous() {
  transitionTo(state.currentStep - 1);
}

function appendActions(zone, label, onContinue) {
  const row = el('div', 'answer-actions');
  if (state.currentStep > 0) row.appendChild(iconButton('arrow-left', 'Back', previous, 'back-action'));
  row.appendChild(primary(label, onContinue));
  zone.appendChild(row);
}

function singleChoiceList(options, selectedValue, onSelect, grid = false) {
  const list = el('div', `choice-list ${grid ? 'choice-list--grid' : 'choice-list--stack'}`);
  const entries = [];
  options.forEach((option) => {
    const button = choice(option.label, selectedValue === option.value, () => {
      onSelect(option.value);
      entries.forEach((entry) => entry.button.setAttribute('aria-pressed', String(entry.value === option.value)));
    });
    entries.push({ button, value: option.value });
    list.appendChild(button);
  });
  return list;
}

function advanceFromPractice(message = '') {
  const steps = flow();
  const upcoming = steps[state.currentStep + 1];
  if (upcoming === 'icp') {
    if (!currentServices().length) {
      showInsight(root, 'Keep at least one service active or selective before I build the opportunity model.');
      return;
    }
    next(message || practiceSummaryThought());
    return;
  }
  next(message);
}

function practiceSummaryThought() {
  const current = currentServices();
  const lead = current.find((service) => service.service_id === state.leadServiceId);
  const selective = current.filter((service) => service.state === 'SELECTIVE');
  if (lead && selective.length) return `I’ll lead with ${lead.name} when it fits, and treat ${selective.map((service) => service.name).join(' and ')} more selectively.`;
  if (lead) return `I’ve got the service hierarchy. ${lead.name} is the clearest lead when more than one path fits.`;
  if (current.length === 1) return `${current[0].name} is the current service anchor. I don’t need a separate priority rule.`;
  return 'I’ve got the current service set. Next I want to understand the opportunities you actually want more of.';
}

function renderPracticeServices(stage) {
  const scene = questionScene(
    stage,
    `I found ${state.services.length} services in ${state.firm}’s public material.`,
    'Which of these still belong in the practice today?',
    'I’m using the website as a starting point, not as operating truth.'
  );

  const zone = el('div', 'answer-zone answer-zone--stack');
  const list = el('div', 'choice-list choice-list--stack');
  state.services.forEach((service) => {
    list.appendChild(choice(service.name, service.selected, (button) => {
      service.selected = !service.selected;
      if (!service.selected && state.leadServiceId === service.service_id) state.leadServiceId = null;
      button.setAttribute('aria-pressed', String(service.selected));
      saveState(state);
    }));
  });

  const tools = el('div', 'answer-tools');
  tools.appendChild(expandableInput('Add a service', (name) => {
    const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    state.services.push({ service_id: `SVC_${slug}_${Date.now().toString(36).toUpperCase()}`, name, selected: true, state: 'ACTIVE', preference: 'CORE' });
    saveState(state);
    render();
  }));
  zone.append(list, tools);

  appendActions(zone, 'Continue', () => {
    if (!selectedServices().length) return showInsight(root, 'Keep at least one service in the current practice so I have something real to calibrate.');
    next('Good. I’ll calibrate how each current service actually sits in the practice.');
  });
  scene.appendChild(zone);
}

function renderPracticeState(stage, service) {
  if (!service) return next();

  const scene = questionScene(
    stage,
    'You’ve kept this service in the current set.',
    `How does ${service.name} sit in the practice today?`,
    'This changes how strongly I should treat a service match when I prepare an opportunity.'
  );

  const zone = el('div', 'answer-zone answer-zone--stack');
  zone.appendChild(singleChoiceList(SERVICE_STATE_OPTIONS, service.state, (value) => {
    service.state = value;
    if (value === 'SELECTIVE') service.preference = 'SELECTIVE';
    if (value === 'PAUSED' || value === 'NO_LONGER') {
      service.preference = 'ONLY_IF_REQUESTED';
      if (state.leadServiceId === service.service_id) state.leadServiceId = null;
    }
    if (value === 'ACTIVE' && service.preference === 'SELECTIVE') service.preference = 'CORE';
    saveState(state);
  }));

  appendActions(zone, 'Continue', () => {
    const upcoming = flow()[state.currentStep + 1];
    const message = upcoming === 'practice_lead' ? 'There’s more than one current path. I need one last distinction.' : '';
    advanceFromPractice(message);
  });
  scene.appendChild(zone);
}

function renderPracticeLead(stage) {
  const services = currentServices();
  const options = [
    ...services.map((service) => ({ value: service.service_id, label: service.name })),
    { value: 'NO_DEFAULT', label: 'No default — follow the opportunity' }
  ];
  const selectedValue = state.leadServiceId || 'NO_DEFAULT';

  const scene = questionScene(
    stage,
    `${services.length} services are currently in play.`,
    'When more than one genuinely fits, which should I usually lead with?',
    'This is a presentation preference, not permission to force a service onto weak evidence.'
  );

  const zone = el('div', 'answer-zone answer-zone--stack');
  zone.appendChild(singleChoiceList(options, selectedValue, (value) => {
    state.leadServiceId = value === 'NO_DEFAULT' ? null : value;
    state.services.forEach((service) => {
      if (!service.selected) return;
      if (service.state === 'SELECTIVE') service.preference = 'SELECTIVE';
      else if (service.state === 'ACTIVE') service.preference = service.service_id === state.leadServiceId ? 'LEAD_WITH' : 'CORE';
    });
    saveState(state);
  }));

  appendActions(zone, 'Continue', () => advanceFromPractice());
  scene.appendChild(zone);
}

function renderPracticePaused(stage, service) {
  if (!service) return next();
  const selectedPolicy = state.pausedPolicies?.[service.service_id] || 'EXPLICIT_ONLY';

  const scene = questionScene(
    stage,
    `You’ve marked ${service.name} as paused.`,
    'If a prospect brings it up anyway, how should I handle it?',
    'I won’t treat a paused service as a normal fit signal.'
  );

  const zone = el('div', 'answer-zone answer-zone--stack');
  zone.appendChild(singleChoiceList(PAUSED_POLICY_OPTIONS, selectedPolicy, (value) => {
    state.pausedPolicies = { ...(state.pausedPolicies || {}), [service.service_id]: value };
    saveState(state);
  }));

  appendActions(zone, 'Continue', () => advanceFromPractice());
  scene.appendChild(zone);
}

function renderIcp(stage) {
  const scene = questionScene(
    stage,
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
  const scene = questionScene(
    stage,
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

function serviceStateLabel(service) {
  const labels = {
    ACTIVE: 'Active',
    SELECTIVE: 'Selective',
    PAUSED: 'Paused',
    NO_LONGER: 'No longer offered'
  };
  return labels[service.state] || service.state;
}

function pausedPolicyLabel(service) {
  const value = state.pausedPolicies?.[service.service_id] || 'EXPLICIT_ONLY';
  return value === 'HIDE'
    ? 'Keep out of opportunity briefs'
    : 'Only surface on explicit prospect request';
}

function practiceLeadValue() {
  const current = currentServices();
  const lead = current.find((service) => service.service_id === state.leadServiceId);
  if (lead) return lead.name;
  if (current.length === 1) return `${current[0].name} · single service anchor`;
  return 'No default — follow the opportunity';
}

function renderReview(stage) {
  const scene = el('div', 'scene review-scene');
  const head = el('div', 'review-head');
  head.appendChild(el('p', 'review-eyebrow', 'Operating profile'));
  head.appendChild(el('h1', 'review-title', `Calibration complete, ${state.firstName}.`));
  head.appendChild(el('p', 'review-sub', `Here’s the model I’ll use when I prepare opportunities for ${state.firm}.`));
  scene.appendChild(head);

  const grid = el('div', 'review-grid');
  const serviceSummary = selectedServices()
    .map((service) => `${service.name} · ${serviceStateLabel(service)}`)
    .join(' · ');
  const paused = pausedServices();
  const pausedSummary = paused.length
    ? paused.map((service) => `${service.name} · ${pausedPolicyLabel(service)}`).join(' · ')
    : 'No paused-service exceptions';

  grid.append(
    reviewCard('Current services', serviceSummary, 'Consultant-confirmed service states'),
    reviewCard('Service hierarchy', practiceLeadValue(), 'Used only when more than one service genuinely fits'),
    reviewCard('Paused service handling', pausedSummary, 'Paused services never count as normal fit signals'),
    reviewCard('Best-fit opportunity', [...state.companyTypes, ...state.customCompanyTypes].join(' · '), 'Consultant-confirmed operating ICP'),
    reviewCard('Commercial guardrail', formatMoney(state.minimumEngagement, state.currency), 'Budget remains direct-evidence only')
  );
  scene.appendChild(grid);

  const actions = el('div', 'review-actions');
  actions.appendChild(iconButton('arrow-left', 'Back', previous, 'back-action'));
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

window.__CLARIS_CALIBRATION_PREVIEW__ = {
  reset() {
    state = resetState();
    render();
  }
};

render();