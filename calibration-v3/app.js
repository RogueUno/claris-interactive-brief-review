import { loadState, saveState, resetState, greeting } from './state.js';
import {
  OPTIONS,
  SERVICE_STATE_OPTIONS,
  PAUSED_POLICY_OPTIONS,
  serviceQuestionCopy
} from './knowledge-contract.js';
import {
  addShell,
  setChapter,
  questionScene,
  revealWords,
  showInsight,
  choice,
  primary,
  iconButton,
  expandableInput,
  el,
  wireGlass,
  formatMoney
} from './ui.js';

const root = document.getElementById('calibration-root');
let state = loadState();
let transitioning = false;
const REVIEW_EDIT_SESSION_KEY = 'claris_review_edit_mode_v1';
const REVIEW_CORRECTION_SESSION_KEY = 'claris_review_correction_mode_v1';

function readSessionFlag(key) {
  try { return sessionStorage.getItem(key) === '1'; }
  catch { return false; }
}

let reviewEditMode = state._uiReviewMode === 'EDIT' || readSessionFlag(REVIEW_EDIT_SESSION_KEY);
let reviewCorrectionMode =
  state._uiReviewMode === 'CORRECTION' ||
  reviewEditMode ||
  readSessionFlag(REVIEW_CORRECTION_SESSION_KEY);

function setSessionFlag(key, enabled) {
  try {
    if (enabled) sessionStorage.setItem(key, '1');
    else sessionStorage.removeItem(key);
  } catch {}
}

function setReviewEditMode(enabled) {
  reviewEditMode = Boolean(enabled);
  setSessionFlag(REVIEW_EDIT_SESSION_KEY, reviewEditMode);
  if (reviewEditMode) state._uiReviewMode = 'EDIT';
  else if (state._uiReviewMode === 'EDIT') state._uiReviewMode = reviewCorrectionMode ? 'CORRECTION' : null;
}

function setReviewCorrectionMode(enabled) {
  reviewCorrectionMode = Boolean(enabled);
  setSessionFlag(REVIEW_CORRECTION_SESSION_KEY, reviewCorrectionMode);
  if (reviewCorrectionMode && !reviewEditMode) state._uiReviewMode = 'CORRECTION';
  if (!reviewCorrectionMode && !reviewEditMode) state._uiReviewMode = null;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const beats = [
  () => `${greeting()}, ${state.firstName}.`,
  () => 'I’m CLARIS.',
  () => 'Before I prepare opportunities the way you do,',
  () => 'I want to understand how your practice works.',
  () => 'I’ve already reviewed what I can.',
  () => 'So I’ll only ask about what actually matters.'
];

function persist() {
  state.lockedAt = null;
  saveState(state);
}

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
  const steps = [
    ...practiceSteps(),
    'opportunity_company_types',
    'opportunity_buyers',
    'opportunity_stage',
    'opportunity_geo_material'
  ];

  if (state.geographyMatters) steps.push('opportunity_geographies');

  steps.push(
    'commercial_minimum',
    'commercial_models',
    'commercial_budget',
    'commercial_disqualifiers',
    'commercial_caution',
    'judgment_first_call',
    'judgment_positive',
    'judgment_vanity',
    'strategy_discovery',
    'strategy_density',
    'strategy_next_move',
    'strategy_proof',
    'strategy_avoid',
    'exceptions',
    'review'
  );

  return steps;
}

function chapterFor(step) {
  if (step.startsWith('practice_')) return 'Practice';
  if (step.startsWith('opportunity_')) return 'Opportunity';
  if (step.startsWith('commercial_')) return 'Commercial';
  if (step.startsWith('judgment_')) return 'Judgment';
  if (step.startsWith('strategy_')) return 'Strategy';
  if (step === 'exceptions') return 'Exceptions';
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

  if (step === 'opportunity_company_types') return renderOpportunityCompanyTypes(stage);
  if (step === 'opportunity_buyers') return renderOpportunityBuyers(stage);
  if (step === 'opportunity_stage') return renderOpportunityStage(stage);
  if (step === 'opportunity_geo_material') return renderOpportunityGeographyMaterial(stage);
  if (step === 'opportunity_geographies') return renderOpportunityGeographies(stage);

  if (step === 'commercial_minimum') return renderCommercialMinimum(stage);
  if (step === 'commercial_models') return renderCommercialModels(stage);
  if (step === 'commercial_budget') return renderCommercialBudget(stage);
  if (step === 'commercial_disqualifiers') return renderCommercialDisqualifiers(stage);
  if (step === 'commercial_caution') return renderCommercialCaution(stage);

  if (step === 'judgment_first_call') return renderJudgmentFirstCall(stage);
  if (step === 'judgment_positive') return renderJudgmentPositive(stage);
  if (step === 'judgment_vanity') return renderJudgmentVanity(stage);

  if (step === 'strategy_discovery') return renderStrategyDiscovery(stage);
  if (step === 'strategy_density') return renderStrategyDensity(stage);
  if (step === 'strategy_next_move') return renderStrategyNextMove(stage);
  if (step === 'strategy_proof') return renderStrategyProof(stage);
  if (step === 'strategy_avoid') return renderStrategyAvoid(stage);

  if (step === 'exceptions') return renderExceptions(stage);
  return renderReview(stage);
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
  persist();
  scene.classList.add('is-exiting');
  setChapter('Practice', true);
  setTimeout(render, 900);
}

function transitionThoughtDuration(message) {
  const words = String(message || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2800, Math.min(4300, 2050 + words * 145));
}

async function transitionTo(nextIndex, message = '') {
  if (transitioning) return;
  transitioning = true;

  const steps = flow();
  const departingStep = steps[state.currentStep] || 'review';
  const departingChapter = chapterFor(departingStep);

  document.querySelector('#stage .scene')?.classList.add('is-exiting');

  state.currentStep = Math.max(0, Math.min(nextIndex, steps.length - 1));
  saveState(state);

  const nextStep = flow()[state.currentStep] || 'review';
  const nextChapter = chapterFor(nextStep);
  const chapterChanged = nextChapter !== departingChapter;
  setChapter(nextChapter, true);

  await wait(820);

  // Chapter boundaries have their own paced reasoning bridge. Showing the
  // short transition-thought underneath it created duplicate / unreadable
  // interstitials, so these thoughts are reserved for movement inside a chapter.
  if (message && !chapterChanged) {
    const stage = addShell(root);
    const transition = el('div', 'scene transition-scene');
    transition.appendChild(el('p', 'transition-thought', message));
    stage.appendChild(transition);

    await wait(transitionThoughtDuration(message));
    transition.classList.add('is-exiting');
    await wait(760);
  }

  transitioning = false;
  render();
}

function reviewStepIndex() {
  return flow().indexOf('review');
}

function returnToReview({ discardDraft = false } = {}) {
  if (discardDraft) state = loadState();
  setReviewEditMode(false);
  setReviewCorrectionMode(true);
  window.__CLARIS_SUPPRESS_NEXT_BRIDGE__ = true;
  transitionTo(reviewStepIndex());
}

function openReviewEdit(step) {
  const index = flow().indexOf(step);
  if (index < 0) {
    showInsight(root, 'That point is no longer part of the active calibration path.');
    return;
  }
  setReviewEditMode(true);
  setReviewCorrectionMode(true);
  window.__CLARIS_SUPPRESS_NEXT_BRIDGE__ = true;
  transitionTo(index);
}

function next(message = '') {
  if (reviewEditMode) {
    returnToReview();
    return;
  }
  transitionTo(state.currentStep + 1, message);
}

function previous() {
  // While correcting from the final review, Back means “cancel this edit and
  // return to review”. In the normal flow it still discards the current draft.
  if (reviewEditMode) {
    returnToReview({ discardDraft: true });
    return;
  }

  state = loadState();
  transitionTo(state.currentStep - 1);
}

function appendActions(zone, label, onContinue) {
  const row = el('div', 'answer-actions');
  if (state.currentStep > 0) {
    row.appendChild(iconButton(
      'arrow-left',
      reviewEditMode ? 'Cancel edit' : 'Back',
      previous,
      'back-action'
    ));
  }
  row.appendChild(primary(reviewEditMode ? 'Save & return' : label, onContinue));
  zone.appendChild(row);
}

function singleChoiceList(options, selectedValue, onSelect, grid = false) {
  const list = el('div', `choice-list ${grid ? 'choice-list--grid' : 'choice-list--stack'}`);
  const entries = [];

  options.forEach((option) => {
    const normalized = typeof option === 'string' ? { value: option, label: option } : option;
    const button = choice(normalized.label, selectedValue === normalized.value, () => {
      onSelect(normalized.value);
      entries.forEach((entry) => {
        entry.button.setAttribute('aria-pressed', String(entry.value === normalized.value));
      });
    });
    entries.push({ button, value: normalized.value });
    list.appendChild(button);
  });

  return list;
}

function selectedValues(field, customField) {
  return new Set([
    ...(Array.isArray(state[field]) ? state[field] : []),
    ...(customField && Array.isArray(state[customField]) ? state[customField] : [])
  ]);
}

function renderMultiChoice({
  stage,
  context,
  title,
  helper,
  options,
  field,
  customField = null,
  addLabel = null,
  grid = false,
  required = false,
  continueLabel = 'Continue',
  onContinue = null
}) {
  const scene = questionScene(stage, context, title, helper);
  const zone = el('div', `answer-zone ${grid ? 'answer-zone--grid' : 'answer-zone--stack'}`);
  const list = el('div', `choice-list ${grid ? 'choice-list--grid' : 'choice-list--stack'}`);
  const canonical = options.map((option) => typeof option === 'string' ? option : option.value);
  const labelMap = new Map(options.map((option) => {
    const normalized = typeof option === 'string' ? { value: option, label: option } : option;
    return [normalized.value, normalized.label];
  }));
  const selected = selectedValues(field, customField);

  const sync = () => {
    state[field] = canonical.filter((value) => selected.has(value));
    if (customField) {
      state[customField] = [...selected].filter((value) => !canonical.includes(value));
    }
  };

  canonical.forEach((value) => {
    list.appendChild(choice(labelMap.get(value) || value, selected.has(value), (button) => {
      selected.has(value) ? selected.delete(value) : selected.add(value);
      sync();
      button.setAttribute('aria-pressed', String(selected.has(value)));
    }));
  });

  if (customField) {
    (state[customField] || []).forEach((value) => {
      list.appendChild(choice(value, selected.has(value), (button) => {
        selected.has(value) ? selected.delete(value) : selected.add(value);
        sync();
        button.setAttribute('aria-pressed', String(selected.has(value)));
      }));
    });
  }

  zone.appendChild(list);

  if (customField && addLabel) {
    const tools = el('div', 'answer-tools');
    tools.appendChild(expandableInput(addLabel, (value) => {
      const clean = value.trim();
      if (!clean) return;
      selected.add(clean);
      state[customField] = [...new Set([...(state[customField] || []), clean])];
      render();
    }));
    zone.appendChild(tools);
  }

  appendActions(zone, continueLabel, () => {
    if (required && selected.size === 0) {
      showInsight(root, 'Choose at least one option so this part of the operating profile is explicit.');
      return;
    }
    if (onContinue) onContinue(selected);
    else next();
  });

  scene.appendChild(zone);
}

function renderSingleChoice({
  stage,
  context,
  title,
  helper,
  options,
  value,
  onSelect,
  continueLabel = 'Continue',
  onContinue = null,
  grid = false
}) {
  const scene = questionScene(stage, context, title, helper);
  const zone = el('div', `answer-zone ${grid ? 'answer-zone--grid' : 'answer-zone--stack'}`);

  zone.appendChild(singleChoiceList(options, value, (selected) => {
    onSelect(selected);
  }, grid));

  appendActions(zone, continueLabel, () => {
    if (onContinue) onContinue();
    else next();
  });

  scene.appendChild(zone);
}

function advanceFromPractice(message = '') {
  const upcoming = flow()[state.currentStep + 1];

  if (upcoming === 'opportunity_company_types') {
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

  if (lead && selective.length) {
    return `I’ll lead with ${lead.name} when it fits, and treat ${selective.map((service) => service.name).join(' and ')} more selectively.`;
  }
  if (lead) {
    return `I’ve got the service hierarchy. ${lead.name} is the clearest lead when more than one path fits.`;
  }
  if (current.length === 1) {
    return `${current[0].name} is the current service anchor. I don’t need a separate priority rule.`;
  }
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
    }));
  });

  const tools = el('div', 'answer-tools');
  tools.appendChild(expandableInput('Add a service', (name) => {
    const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    state.services.push({
      service_id: `SVC_${slug}_${Date.now().toString(36).toUpperCase()}`,
      name,
      selected: true,
      state: 'ACTIVE',
      preference: 'CORE'
    });
    render();
  }));

  zone.append(list, tools);

  appendActions(zone, 'Continue', () => {
    if (!selectedServices().length) {
      showInsight(root, 'Keep at least one service in the current practice so I have something real to calibrate.');
      return;
    }
    next('Good. Now I want to understand how each of those services actually sits in the practice.');
  });

  scene.appendChild(zone);
}

function renderPracticeState(stage, service) {
  if (!service) return next();

  const copy = serviceQuestionCopy(service);

  renderSingleChoice({
    stage,
    context: copy.context,
    title: copy.title,
    helper: copy.helper,
    options: SERVICE_STATE_OPTIONS,
    value: service.state,
    onSelect: (value) => {
      service.state = value;

      if (value === 'SELECTIVE') service.preference = 'SELECTIVE';

      if (value === 'PAUSED' || value === 'NO_LONGER') {
        service.preference = 'ONLY_IF_REQUESTED';
        if (state.leadServiceId === service.service_id) state.leadServiceId = null;
      }

      if (value === 'ACTIVE' && service.preference === 'SELECTIVE') {
        service.preference = 'CORE';
      }
    },
    onContinue: () => {
      const upcoming = flow()[state.currentStep + 1];
      const message = upcoming === 'practice_lead'
        ? 'There’s more than one current path. One distinction will help me present them the way you would.'
        : '';
      advanceFromPractice(message);
    }
  });
}

function renderPracticeLead(stage) {
  const services = currentServices();
  const options = [
    ...services.map((service) => ({ value: service.service_id, label: service.name })),
    { value: 'NO_DEFAULT', label: 'No default — follow the opportunity' }
  ];

  renderSingleChoice({
    stage,
    context: `${services.length} services are genuinely in play.`,
    title: 'When more than one fits, which should I usually lead with?',
    helper: 'This is a presentation preference, not permission to force a service onto weak evidence.',
    options,
    value: state.leadServiceId || 'NO_DEFAULT',
    onSelect: (value) => {
      state.leadServiceId = value === 'NO_DEFAULT' ? null : value;

      state.services.forEach((service) => {
        if (!service.selected) return;
        if (service.state === 'SELECTIVE') service.preference = 'SELECTIVE';
        else if (service.state === 'ACTIVE') {
          service.preference = service.service_id === state.leadServiceId ? 'LEAD_WITH' : 'CORE';
        }
      });
    },
    onContinue: () => advanceFromPractice()
  });
}

function renderPracticePaused(stage, service) {
  if (!service) return next();

  renderSingleChoice({
    stage,
    context: `${service.name} is paused, so I’ll keep it out of normal-fit reasoning.`,
    title: 'If a prospect brings it up anyway, how should I handle it?',
    helper: 'A paused service will never become a positive fit signal just because a prospect mentions it.',
    options: PAUSED_POLICY_OPTIONS,
    value: state.pausedPolicies?.[service.service_id] || 'EXPLICIT_ONLY',
    onSelect: (value) => {
      state.pausedPolicies = {
        ...(state.pausedPolicies || {}),
        [service.service_id]: value
      };
    },
    onContinue: () => advanceFromPractice()
  });
}

function renderOpportunityCompanyTypes(stage) {
  renderMultiChoice({
    stage,
    context: 'Your public positioning points mainly toward technology companies.',
    title: 'Which company types belong in your real operating ICP today?',
    helper: 'Choose the patterns you actually want CLARIS to favor — not every company you could technically serve.',
    options: OPTIONS.companyTypes,
    field: 'companyTypes',
    customField: 'customCompanyTypes',
    addLabel: 'Add a company type',
    grid: true,
    required: true,
    onContinue: () => next('Good. Company type gives me the market boundary; now I want the people who usually make the opportunity real.')
  });
}

function renderOpportunityBuyers(stage) {
  renderMultiChoice({
    stage,
    context: 'Company fit alone is too broad to qualify a consulting opportunity.',
    title: 'Which buyer or stakeholder roles most often matter to a good first conversation?',
    helper: 'This is about the people who make progress possible — not a rule that one exact title must always be present.',
    options: OPTIONS.buyerRoles,
    field: 'buyerRoles',
    customField: 'customBuyerRoles',
    addLabel: 'Add a stakeholder',
    grid: true,
    onContinue: () => next()
  });
}

function renderOpportunityStage(stage) {
  renderSingleChoice({
    stage,
    context: 'Two B2B software companies can look identical from a category label and still be very different opportunities.',
    title: 'Which company stage is closest to your natural sweet spot?',
    helper: 'Choose “No hard size rule” if stage is less important than the underlying security or compliance pressure.',
    options: OPTIONS.companyStage,
    value: state.companyStage,
    onSelect: (value) => {
      state.companyStage = value;
    },
    onContinue: () => next()
  });
}

function renderOpportunityGeographyMaterial(stage) {
  renderSingleChoice({
    stage,
    context: 'I don’t want to create a geography filter unless it genuinely affects delivery or commercial fit.',
    title: 'Does geography materially change whether you want the opportunity?',
    helper: 'If not, I’ll leave geography neutral rather than treating absence of location data as a negative.',
    options: [
      { value: false, label: 'No — geography is not a meaningful filter' },
      { value: true, label: 'Yes — there are regions I meaningfully prioritize' }
    ],
    value: Boolean(state.geographyMatters),
    onSelect: (value) => {
      state.geographyMatters = value;
      if (!value) {
        state.geographies = [];
        state.customGeographies = [];
      }
    },
    onContinue: () => {
      const upcoming = flow()[state.currentStep + 1];
      if (upcoming === 'commercial_minimum') {
        next('I’ve got the opportunity boundary. Now I want to understand what makes the work commercially worth taking on.');
      } else {
        next();
      }
    }
  });
}

function renderOpportunityGeographies(stage) {
  renderMultiChoice({
    stage,
    context: 'You said geography does matter.',
    title: 'Which regions should I treat as genuinely preferred?',
    helper: 'This preference should only affect commercial fit when location is known — never turn an unknown location into a negative.',
    options: OPTIONS.geography,
    field: 'geographies',
    customField: 'customGeographies',
    addLabel: 'Add a region',
    grid: true,
    required: true,
    onContinue: () => next('I’ve got the opportunity boundary. Now I want to understand what makes the work commercially worth taking on.')
  });
}

function renderCommercialMinimum(stage) {
  const scene = questionScene(
    stage,
    'First, one hard commercial guardrail.',
    'What is the smallest engagement that is genuinely worth taking on?',
    'I’ll store the original currency exactly as you state it; I won’t silently relabel EUR or GBP as USD.'
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
  });

  control.appendChild(input);
  control.appendChild(el('span', 'money-caption', 'minimum'));
  zone.appendChild(control);

  appendActions(zone, 'Continue', () => {
    if (!Number(state.minimumEngagement)) {
      showInsight(root, 'Add the commercial floor you want CLARIS to use.');
      return;
    }
    next();
  });

  scene.appendChild(zone);
}

function renderCommercialModels(stage) {
  renderMultiChoice({
    stage,
    context: 'A good-fit company can still be the wrong kind of engagement.',
    title: 'Which engagement models do you actually want more of?',
    helper: 'This stays a commercial preference; it does not let CLARIS invent a buying model from weak public signals.',
    options: OPTIONS.engagementModels,
    field: 'engagementModels',
    customField: 'customEngagementModels',
    addLabel: 'Add an engagement model',
    grid: true,
    onContinue: () => next()
  });
}

function renderCommercialBudget(stage) {
  renderSingleChoice({
    stage,
    context: 'Budget is one place where false confidence can make a prospect look better than the evidence supports.',
    title: 'Do you require an explicit budget signal before the first call?',
    helper: 'Whatever you choose, CLARIS should never infer budget from company size, funding, or prestige alone.',
    options: [
      { value: false, label: 'No — budget can remain unknown before call one' },
      { value: true, label: 'Yes — I want direct budget evidence first' }
    ],
    value: Boolean(state.budgetRequired),
    onSelect: (value) => {
      state.budgetRequired = value;
    },
    onContinue: () => next()
  });
}

function renderCommercialDisqualifiers(stage) {
  renderMultiChoice({
    stage,
    context: 'Now the opposite side of fit: reasons you would rather not spend a first-call slot.',
    title: 'Which conditions are genuine hard disqualifiers for you?',
    helper: 'Leave everything unselected if there are no additional hard rules; Continue will record that explicitly.',
    options: OPTIONS.hardDisqualifiers,
    field: 'hardDisqualifiers',
    customField: 'customHardDisqualifiers',
    addLabel: 'Add a hard disqualifier',
    grid: true,
    onContinue: () => {
      state.hardDisqualifiersConfirmed = true;
      persist();
      next();
    }
  });
}

function renderCommercialCaution(stage) {
  renderMultiChoice({
    stage,
    context: 'Some signals are not disqualifiers — they simply deserve more caution.',
    title: 'Which patterns should make me lower confidence rather than reject the opportunity?',
    helper: 'These are “look closer” signals, not permission to turn missing evidence into a negative.',
    options: OPTIONS.cautionSignals,
    field: 'cautionSignals',
    customField: 'customCautionSignals',
    addLabel: 'Add a caution signal',
    grid: true,
    onContinue: () => next('Commercially, I know what is worth protecting. Next I want to learn how you decide whether a first conversation deserves attention.')
  });
}

function renderJudgmentFirstCall(stage) {
  renderMultiChoice({
    stage,
    context: 'This is the core qualification question.',
    title: 'What must be true for a first call to be worth taking?',
    helper: 'Keep this strict. Unknown information can stay unknown; it should not quietly become evidence against the prospect.',
    options: OPTIONS.firstCallRules,
    field: 'firstCallRules',
    grid: false,
    required: true,
    onContinue: () => next()
  });
}

function renderJudgmentPositive(stage) {
  renderMultiChoice({
    stage,
    context: 'Once basic fit exists, some real-world conditions make an opportunity more commercially meaningful.',
    title: 'Which signals genuinely strengthen your interest when they are directly evidenced?',
    helper: 'These can raise attention only when the signal itself is supported — never because CLARIS assumes it is probably happening.',
    options: OPTIONS.positiveSignals,
    field: 'positiveSignals',
    grid: true,
    onContinue: () => next()
  });
}

function renderJudgmentVanity(stage) {
  renderMultiChoice({
    stage,
    context: 'I also want to learn what not to overvalue.',
    title: 'Which signals can look impressive but should never qualify a prospect by themselves?',
    helper: 'This helps prevent attractive public signals from masquerading as actual buying context.',
    options: OPTIONS.vanitySignals,
    field: 'vanitySignals',
    grid: true,
    onContinue: () => next('I’ve got the judgment boundary. Now I want the brief and call strategy to feel more like yours.')
  });
}

function renderStrategyDiscovery(stage) {
  renderSingleChoice({
    stage,
    context: 'Two consultants can agree on fit and still run the first conversation very differently.',
    title: 'Which discovery posture is closest to how you naturally work?',
    helper: 'This should shape preparation and emphasis, not rewrite what is true about the prospect.',
    options: OPTIONS.discoveryStyle,
    value: state.discoveryStyle,
    onSelect: (value) => {
      state.discoveryStyle = value;
    },
    onContinue: () => next()
  });
}

function renderStrategyDensity(stage) {
  renderSingleChoice({
    stage,
    context: 'The same research can be presented as a terse brief or a deeper working dossier.',
    title: 'How much pre-call context is actually useful to you?',
    helper: 'I’ll optimize for decision usefulness, not maximum information density.',
    options: OPTIONS.briefDensity,
    value: state.briefDensity,
    onSelect: (value) => {
      state.briefDensity = value;
    },
    onContinue: () => next()
  });
}

function renderStrategyNextMove(stage) {
  renderSingleChoice({
    stage,
    context: 'When a first call goes well, the best next step is not always “send a proposal.”',
    title: 'What next move do you most often want CLARIS to prepare toward?',
    helper: 'You can keep this flexible; it is a strategy preference, not a forced sales motion.',
    options: OPTIONS.preferredNextMove,
    value: state.preferredNextMove,
    onSelect: (value) => {
      state.preferredNextMove = value;
    },
    onContinue: () => next()
  });
}

function renderStrategyProof(stage) {
  renderMultiChoice({
    stage,
    context: 'A strong brief should know which proof helps — without dumping every credential into the conversation.',
    title: 'What kind of proof is most useful when an opportunity genuinely matches?',
    helper: 'These are assets to surface selectively, after fit exists.',
    options: OPTIONS.proofPoints,
    field: 'proofPoints',
    customField: 'customProofPoints',
    addLabel: 'Add a proof type',
    grid: true,
    onContinue: () => next()
  });
}

function renderStrategyAvoid(stage) {
  renderMultiChoice({
    stage,
    context: 'Last strategic guardrail: good preparation also knows what not to push.',
    title: 'What should I avoid introducing prematurely?',
    helper: 'This keeps call strategy useful without turning CLARIS into an overeager sales script.',
    options: OPTIONS.avoidPush,
    field: 'avoidPush',
    customField: 'customAvoidPush',
    addLabel: 'Add something to avoid',
    grid: true,
    onContinue: () => next('The default operating model is clear. One final thing: where should I allow sensible exceptions?')
  });
}

function renderExceptions(stage) {
  renderMultiChoice({
    stage,
    context: 'Senior judgment often lives in the exceptions, not the headline ICP.',
    title: 'Which situations can still be worth attention even when the normal pattern is imperfect?',
    helper: 'These exceptions do not erase evidence requirements. They tell me when a non-standard opportunity deserves a closer look.',
    options: OPTIONS.exceptions,
    field: 'exceptions',
    customField: 'customExceptions',
    addLabel: 'Add an exception',
    grid: true,
    onContinue: () => next('That gives me a much closer model of how you actually judge opportunities.')
  });
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

function listSummary(values, fallback = 'Still open') {
  const clean = (values || []).filter(Boolean);
  return clean.length ? clean.join(' · ') : fallback;
}

function commercialSummary() {
  const amount = formatMoney(state.minimumEngagement, state.currency);
  const budget = state.budgetRequired ? 'budget required before call one' : 'budget may remain unknown';
  return `${amount} floor · ${budget}`;
}

function opportunitySummary() {
  const types = [...state.companyTypes, ...state.customCompanyTypes];
  const geo = state.geographyMatters
    ? listSummary([...state.geographies, ...state.customGeographies], 'preferred geography not set')
    : 'geography neutral';

  return `${listSummary(types)} · ${state.companyStage} · ${geo}`;
}

function judgmentSummary() {
  return listSummary(state.firstCallRules);
}

function strategySummary() {
  return `${state.discoveryStyle} · ${state.briefDensity} · ${state.preferredNextMove}`;
}

function criticalGaps() {
  const gaps = [];
  if (!currentServices().length) gaps.push('at least one current service');
  if (!(state.companyTypes.length + state.customCompanyTypes.length)) gaps.push('operating ICP');
  if (!Number(state.minimumEngagement)) gaps.push('commercial floor');
  if (!state.hardDisqualifiersConfirmed) gaps.push('hard-disqualifier confirmation');
  if (!state.firstCallRules.length) gaps.push('first-call qualification rule');
  if (state.geographyMatters && !(state.geographies.length + state.customGeographies.length)) gaps.push('preferred geography');
  return gaps;
}

function reviewSecondary(label, onClick) {
  const button = wireGlass(el('button', 'review-secondary glass'));
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function reviewEditPoint(label, value, step) {
  return { label, value: value || 'Still open', step };
}

function renderReview(stage) {
  const scene = el('div', `scene review-scene${reviewCorrectionMode ? ' is-correcting' : ''}`);
  const head = el('div', 'review-head');

  head.appendChild(el('p', 'review-eyebrow', 'Operating profile'));
  head.appendChild(el('h1', 'review-title', `Calibration complete. Are we all set, ${state.firstName}?`));
  head.appendChild(el(
    'p',
    'review-sub',
    reviewCorrectionMode
      ? 'Choose anything that doesn’t feel right. Save the change and I’ll bring you straight back here.'
      : `Here’s the operating model I’ll use for ${state.firm}. If something feels off, choose “Not quite yet”.`
  ));
  scene.appendChild(head);

  const grid = el('div', 'review-grid');

  const serviceSummary = selectedServices()
    .map((service) => `${service.name} · ${serviceStateLabel(service)}`)
    .join(' · ');

  const leadPreference = state.leadServiceId
    ? state.services.find((service) => service.service_id === state.leadServiceId)?.name || 'Follow the opportunity'
    : 'No forced lead service';

  const commercialMeta = [
    ...state.engagementModels,
    ...state.customEngagementModels,
    ...(state.hardDisqualifiers.length || state.customHardDisqualifiers.length
      ? [`Hard stops: ${[...state.hardDisqualifiers, ...state.customHardDisqualifiers].join(', ')}`]
      : ['No additional hard stops'])
  ].join(' · ');

  const judgmentMeta = [
    state.positiveSignals.length ? `Strengthen: ${state.positiveSignals.join(', ')}` : null,
    state.vanitySignals.length ? `Never enough alone: ${state.vanitySignals.join(', ')}` : null
  ].filter(Boolean).join(' · ');

  const strategyMeta = [
    [...state.proofPoints, ...state.customProofPoints].length
      ? `Proof: ${[...state.proofPoints, ...state.customProofPoints].join(', ')}`
      : null,
    [...state.avoidPush, ...state.customAvoidPush].length
      ? `Avoid early: ${[...state.avoidPush, ...state.customAvoidPush].join(', ')}`
      : null
  ].filter(Boolean).join(' · ');

  const practicePoints = [
    reviewEditPoint('Services offered', listSummary(selectedServices().map((service) => service.name)), 'practice_services'),
    ...selectedServices().map((service) =>
      reviewEditPoint(`${service.name} status`, serviceStateLabel(service), `practice_state:${service.service_id}`)
    )
  ];
  if (currentServices().length > 1) {
    practicePoints.push(reviewEditPoint('Lead preference', leadPreference, 'practice_lead'));
  }
  pausedServices().forEach((service) => {
    practicePoints.push(reviewEditPoint(
      `${service.name} paused policy`,
      state.pausedPolicies?.[service.service_id] || 'Still open',
      `practice_paused:${service.service_id}`
    ));
  });

  const opportunityPoints = [
    reviewEditPoint('Company types', listSummary([...state.companyTypes, ...state.customCompanyTypes]), 'opportunity_company_types'),
    reviewEditPoint('Buyer roles', listSummary([...state.buyerRoles, ...state.customBuyerRoles]), 'opportunity_buyers'),
    reviewEditPoint('Company stage', state.companyStage || 'Still open', 'opportunity_stage'),
    reviewEditPoint('Geography rule', state.geographyMatters ? 'Geography matters' : 'Geography neutral', 'opportunity_geo_material')
  ];
  if (state.geographyMatters) {
    opportunityPoints.push(reviewEditPoint(
      'Preferred geographies',
      listSummary([...state.geographies, ...state.customGeographies]),
      'opportunity_geographies'
    ));
  }

  const commercialPoints = [
    reviewEditPoint('Commercial floor', formatMoney(state.minimumEngagement, state.currency), 'commercial_minimum'),
    reviewEditPoint('Engagement models', listSummary([...state.engagementModels, ...state.customEngagementModels]), 'commercial_models'),
    reviewEditPoint('Budget before call one', state.budgetRequired ? 'Required' : 'May remain unknown', 'commercial_budget'),
    reviewEditPoint(
      'Hard disqualifiers',
      listSummary([...state.hardDisqualifiers, ...state.customHardDisqualifiers], 'No additional hard stops'),
      'commercial_disqualifiers'
    ),
    reviewEditPoint(
      'Caution signals',
      listSummary([...state.cautionSignals, ...state.customCautionSignals], 'No additional caution signals'),
      'commercial_caution'
    )
  ];

  const judgmentPoints = [
    reviewEditPoint('First-call rules', judgmentSummary(), 'judgment_first_call'),
    reviewEditPoint('Signals that strengthen interest', listSummary(state.positiveSignals, 'No additional strengthening signals'), 'judgment_positive'),
    reviewEditPoint('Signals not to overvalue', listSummary(state.vanitySignals, 'No vanity-signal guardrails added'), 'judgment_vanity')
  ];

  const strategyPoints = [
    reviewEditPoint('Discovery style', state.discoveryStyle || 'Still open', 'strategy_discovery'),
    reviewEditPoint('Brief density', state.briefDensity || 'Still open', 'strategy_density'),
    reviewEditPoint('Preferred next move', state.preferredNextMove || 'Still open', 'strategy_next_move'),
    reviewEditPoint('Proof to surface', listSummary([...state.proofPoints, ...state.customProofPoints], 'No proof preference added'), 'strategy_proof'),
    reviewEditPoint('Avoid introducing early', listSummary([...state.avoidPush, ...state.customAvoidPush], 'No additional guardrail'), 'strategy_avoid')
  ];

  const exceptionPoints = [
    reviewEditPoint(
      'Exceptions',
      listSummary([...state.exceptions, ...state.customExceptions], 'No explicit exceptions'),
      'exceptions'
    )
  ];

  grid.append(
    reviewCard('Practice', serviceSummary, `Lead preference: ${leadPreference}`, practicePoints),
    reviewCard('Opportunity', opportunitySummary(), `Stakeholders: ${listSummary([...state.buyerRoles, ...state.customBuyerRoles], 'Still open')}`, opportunityPoints),
    reviewCard('Commercial', commercialSummary(), commercialMeta, commercialPoints),
    reviewCard('Judgment', judgmentSummary(), judgmentMeta || 'No additional signal preferences', judgmentPoints),
    reviewCard('Strategy', strategySummary(), strategyMeta || 'No additional strategy guardrails', strategyPoints),
    reviewCard(
      'Exceptions',
      listSummary([...state.exceptions, ...state.customExceptions], 'No explicit exceptions'),
      'Exceptions invite a closer look; they do not erase evidence requirements',
      exceptionPoints
    )
  );

  scene.appendChild(grid);

  const actions = el('div', 'review-actions');
  const revise = reviewSecondary(
    reviewCorrectionMode ? 'Done reviewing' : 'Not quite yet',
    () => {
      setReviewCorrectionMode(!reviewCorrectionMode);
      saveState(state);
      render();
    }
  );
  revise.disabled = Boolean(state.lockedAt);
  actions.appendChild(revise);

  const gaps = criticalGaps();
  const lock = primary(
    state.lockedAt ? 'Operating profile locked' : gaps.length ? 'Resolve critical gaps' : 'Lock operating profile',
    () => {
      if (gaps.length) {
        setReviewCorrectionMode(true);
        showInsight(root, `Still needed: ${gaps.join(', ')}. Choose the matching point to fix it.`);
        setTimeout(render, 360);
        return;
      }

      state.lockedAt = new Date().toISOString();
      setReviewEditMode(false);
      setReviewCorrectionMode(false);
      saveState(state);

      const awaitingServerConfirmation = Boolean(window.__CLARIS_PRODUCTION_SESSION__?.authenticated);
      showInsight(
        root,
        awaitingServerConfirmation
          ? 'Locking your operating profile…'
          : 'Done. I’ll use this operating profile when I prepare your opportunities.'
      );
      setTimeout(render, 460);
    }
  );

  lock.disabled = Boolean(state.lockedAt);

  // “Not quite yet” is a deliberate correction state. Require the consultant
  // to finish reviewing and return to the clean summary before the irreversible
  // lock action is offered again.
  if (!reviewCorrectionMode) actions.appendChild(lock);

  scene.appendChild(actions);
  stage.appendChild(scene);
}

function reviewCard(title, value, meta, points = []) {
  const card = el('article', 'review-card');
  card.append(
    el('h3', '', title),
    el('p', 'review-value', value || 'Still open'),
    el('p', 'review-meta', meta || '')
  );

  if (reviewCorrectionMode && points.length) {
    const editList = el('div', 'review-edit-list');
    points.forEach((point) => {
      const button = el('button', 'review-edit-point');
      button.type = 'button';
      button.append(
        el('span', 'review-edit-label', point.label),
        el('span', 'review-edit-current', point.value),
        el('span', 'review-edit-action', 'Change')
      );
      button.addEventListener('click', () => openReviewEdit(point.step));
      editList.appendChild(button);
    });
    card.appendChild(editList);
  }

  return card;
}

function profileSnapshot() {
  return JSON.parse(JSON.stringify({
    consultant: {
      consultantId: state.consultantId,
      firstName: state.firstName,
      fullName: state.fullName,
      firm: state.firm
    },
    practice: {
      services: state.services,
      leadServiceId: state.leadServiceId,
      pausedPolicies: state.pausedPolicies
    },
    opportunity: {
      companyTypes: [...state.companyTypes, ...state.customCompanyTypes],
      buyerRoles: [...state.buyerRoles, ...state.customBuyerRoles],
      companyStage: state.companyStage,
      geographyMatters: state.geographyMatters,
      geographies: [...state.geographies, ...state.customGeographies]
    },
    commercial: {
      minimumEngagement: state.minimumEngagement,
      currency: state.currency,
      engagementModels: [...state.engagementModels, ...state.customEngagementModels],
      budgetRequired: state.budgetRequired,
      hardDisqualifiers: [...state.hardDisqualifiers, ...state.customHardDisqualifiers],
      hardDisqualifiersConfirmed: state.hardDisqualifiersConfirmed,
      cautionSignals: [...state.cautionSignals, ...state.customCautionSignals]
    },
    judgment: {
      firstCallRules: state.firstCallRules,
      positiveSignals: state.positiveSignals,
      vanitySignals: state.vanitySignals
    },
    strategy: {
      discoveryStyle: state.discoveryStyle,
      briefDensity: state.briefDensity,
      preferredNextMove: state.preferredNextMove,
      proofPoints: [...state.proofPoints, ...state.customProofPoints],
      avoidPush: [...state.avoidPush, ...state.customAvoidPush]
    },
    exceptions: [...state.exceptions, ...state.customExceptions],
    lockedAt: state.lockedAt
  }));
}

window.addEventListener('claris:server-profile-locked', () => {
  state = loadState();
  setReviewEditMode(false);
  setReviewCorrectionMode(false);
  showInsight(root, 'Done. I’ll use this operating profile when I prepare your opportunities.');
  setTimeout(render, 180);
});

window.__CLARIS_CALIBRATION_V3_PREVIEW__ = {
  reset() {
    state = resetState();
    setReviewEditMode(false);
    setReviewCorrectionMode(false);
    render();
  },
  profile() {
    return profileSnapshot();
  }
};

render();