import { loadState, saveState, resetState, greeting } from './state.js';
import { addShell, setChapter, questionScene, showInsight, choice, primary, el, wireGlass, formatMoney } from './ui.js';

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

function renderBoot(stage) {
  setChapter('', false);
  const scene = el('div', 'scene boot-scene');
  const copy = el('div', 'boot-copy');
  const index = Math.min(state.bootIndex, beats.length - 1);
  copy.appendChild(el('h1', 'hero-line', beats[index]()));
  scene.appendChild(copy);
  stage.appendChild(scene);
  const advance = () => {
    if (state.bootIndex < beats.length - 1) state.bootIndex += 1;
    else { state.phase = 'calibration'; state.currentStep = 0; }
    saveState(state); render();
  };
  if (index === beats.length - 1) scene.appendChild(primary('Begin calibration →', advance));
  else setTimeout(() => state.phase === 'boot' && state.bootIndex === index && advance(), index === 0 ? 1400 : 1650);
}

function next(message) {
  if (message) showInsight(root, message);
  state.currentStep = Math.min(state.currentStep + 1, flow.length - 1);
  saveState(state);
  setTimeout(render, message ? 520 : 120);
}

function back(scene) {
  if (state.currentStep === 0) return;
  const button = el('button', 'back-action', '← Back');
  button.addEventListener('click', () => { state.currentStep -= 1; saveState(state); render(); });
  scene.appendChild(button);
}

function addCustom(zone, placeholder, commit) {
  if (zone.querySelector('.custom-row')) return;
  const row = wireGlass(el('div', 'custom-row glass'));
  const input = el('input');
  input.placeholder = placeholder;
  const button = el('button', 'icon-button', '→');
  const submit = () => { const value = input.value.trim(); if (value) commit(value); };
  button.addEventListener('click', submit);
  input.addEventListener('keydown', e => e.key === 'Enter' && submit());
  row.append(input, button); zone.appendChild(row); input.focus();
}

function renderServices(stage) {
  const scene = questionScene(stage, `I found ${state.services.length} services in ${state.firm}’s public material.`, 'Which are you actively taking on right now?', 'I’ll keep your operating profile separate from what your website happens to advertise.');
  const zone = el('div', 'answer-zone');
  const grid = el('div', 'choice-grid');
  state.services.forEach(service => grid.appendChild(choice(service.name, service.selected, button => {
    service.selected = !service.selected;
    button.setAttribute('aria-pressed', String(service.selected));
    saveState(state);
  })));
  grid.appendChild(choice('+  Add another', false, () => addCustom(zone, 'Service name', name => {
    const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    state.services.push({ service_id:`SVC_${slug}`, name, selected:true, state:'ACTIVE', preference:'CORE' });
    saveState(state); render();
  })));
  zone.appendChild(grid);
  zone.appendChild(primary('Continue →', () => {
    const active = state.services.filter(item => item.selected);
    if (!active.length) return showInsight(root, 'I need at least one active service before I can calibrate service fit.');
    next(active.length === 1 ? 'That’s enough—I don’t need a separate service-priority question.' : 'Service model established.');
  }));
  scene.appendChild(zone);
}

function renderIcp(stage) {
  const scene = questionScene(stage, 'Your public positioning points mostly toward B2B technology companies.', 'How should I understand your actual target market today?', 'Choose everything that belongs in your core profile. You can add your own.');
  const candidates = ['B2B SaaS','Software','FinTech','HealthTech','AI / Cloud infrastructure'];
  const selected = new Set([...(state.companyTypes || []), ...(state.customCompanyTypes || [])]);
  const zone = el('div', 'answer-zone');
  const grid = el('div', 'choice-grid');
  candidates.forEach(value => grid.appendChild(choice(value, selected.has(value), button => {
    selected.has(value) ? selected.delete(value) : selected.add(value);
    state.companyTypes = candidates.filter(item => selected.has(item));
    state.customCompanyTypes = [...selected].filter(item => !candidates.includes(item));
    button.setAttribute('aria-pressed', String(selected.has(value))); saveState(state);
  })));
  (state.customCompanyTypes || []).forEach(value => grid.appendChild(choice(value, true, () => {
    state.customCompanyTypes = state.customCompanyTypes.filter(item => item !== value); saveState(state); render();
  })));
  grid.appendChild(choice('+  Add another', false, () => addCustom(zone, 'Company type or market', value => {
    state.customCompanyTypes = [...new Set([...(state.customCompanyTypes || []), value])]; saveState(state); render();
  })));
  zone.appendChild(grid);
  zone.appendChild(primary('Continue →', () => {
    if (!(state.companyTypes.length + state.customCompanyTypes.length)) return showInsight(root, 'I need at least one company type to define the operating ICP.');
    next('Best-fit opportunity model established.');
  }));
  scene.appendChild(zone); back(scene);
}

function renderEconomics(stage) {
  const scene = questionScene(stage, 'One commercial rule.', 'What is the smallest engagement that is commercially worth taking on?', 'I’ll use this as your rule. I still won’t infer a prospect’s budget without direct evidence.');
  const zone = el('div', 'answer-zone');
  const control = wireGlass(el('div', 'money-control glass'));
  control.appendChild(el('span', 'currency', state.currency));
  const input = el('input'); input.type='number'; input.value=state.minimumEngagement || ''; input.placeholder='7500';
  input.addEventListener('input', () => { state.minimumEngagement = Number(input.value || 0); saveState(state); });
  control.appendChild(input); control.appendChild(el('span', 'currency', 'minimum')); zone.appendChild(control);
  zone.appendChild(primary('Review calibration →', () => {
    if (!Number(state.minimumEngagement)) return showInsight(root, 'Add the commercial floor you want CLARIS to use.');
    next(`Got it. I’ll treat ${formatMoney(state.minimumEngagement, state.currency)} as the commercial floor.`);
  }));
  scene.appendChild(zone); back(scene);
}

function renderReview(stage) {
  const scene = el('div', 'scene');
  scene.appendChild(el('h1', 'review-title', `Calibration complete, ${state.firstName}.`));
  scene.appendChild(el('p', 'review-sub', `Here’s the operating model I’ll use when I prepare opportunities for ${state.firm}.`));
  const grid = el('div', 'review-grid');
  const active = state.services.filter(item => item.selected);
  grid.append(reviewCard('Practice', active.map(item => item.name).join(' · '), `${active.length} confirmed active services`));
  grid.append(reviewCard('Best-fit opportunity', [...state.companyTypes, ...state.customCompanyTypes].join(' · '), 'Consultant-confirmed operating ICP'));
  grid.append(reviewCard('Commercial guardrail', formatMoney(state.minimumEngagement, state.currency), 'Budget remains direct-evidence only'));
  scene.appendChild(grid);
  const lock = primary(state.lockedAt ? 'Operating profile locked ✓' : 'Lock operating profile', () => {
    state.lockedAt = new Date().toISOString(); saveState(state); showInsight(root, 'Done. I’ll use this profile when I prepare your opportunities.'); setTimeout(render, 450);
  });
  lock.disabled = Boolean(state.lockedAt); scene.appendChild(lock); back(scene); stage.appendChild(scene);
}

function reviewCard(title, value, meta) {
  const card = wireGlass(el('article', 'review-card glass'));
  card.append(el('h3','',title), el('p','review-value',value || 'Still open'), el('p','review-meta',meta));
  return card;
}

window.__CLARIS_CALIBRATION_PREVIEW__ = { reset() { state = resetState(); render(); } };
render();
