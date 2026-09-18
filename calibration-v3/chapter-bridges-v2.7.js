const CHAPTER_ORDER = ['Practice', 'Opportunity', 'Commercial', 'Judgment', 'Strategy', 'Exceptions', 'Review'];
let previousChapter = '';
let activeBridge = null;
let bridgeTimers = [];

function safeProfile() {
  try {
    return window.__CLARIS_CALIBRATION_V3_PREVIEW__?.profile?.() || null;
  } catch {
    return null;
  }
}

function list(values = []) {
  return values.filter(Boolean);
}

function joinNatural(values = []) {
  const clean = list(values);
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean.at(-1)}`;
}

function practiceConclusion(snapshot) {
  const services = list(snapshot?.practice?.services)
    .filter((service) => service.selected && ['ACTIVE', 'SELECTIVE'].includes(service.state));
  const lead = services.find((service) => service.service_id === snapshot?.practice?.leadServiceId);
  const selective = services
    .filter((service) => service.state === 'SELECTIVE' && service.service_id !== lead?.service_id)
    .map((service) => service.name);

  if (lead && selective.length) return `${lead.name} leads; ${joinNatural(selective)} stays selective.`;
  if (lead) return `${lead.name} is the clearest lead when several paths fit.`;
  if (services.length === 1) return `${services[0].name} is the current service anchor.`;
  if (services.length > 1) return 'The service set is clear, without forcing one default lead.';
  return 'The current service model is clear.';
}

function opportunityConclusion(snapshot) {
  const opportunity = snapshot?.opportunity || {};
  const types = list(opportunity.companyTypes).slice(0, 2);
  const buyers = list(opportunity.buyerRoles).slice(0, 2);
  if (types.length && buyers.length) return `Best fit centers on ${joinNatural(types)}, usually with ${joinNatural(buyers)} in the conversation.`;
  if (types.length) return `Best fit centers on ${joinNatural(types)}.`;
  return 'The opportunity boundary is clear.';
}

function commercialConclusion(snapshot) {
  const commercial = snapshot?.commercial || {};
  const floor = Number(commercial.minimumEngagement || 0);
  if (floor) {
    const currency = commercial.currency || '';
    return `${currency} ${floor.toLocaleString()} is the floor I should protect.`.trim();
  }
  return 'The commercial guardrails are clear.';
}

function judgmentConclusion(snapshot) {
  const rules = list(snapshot?.judgment?.firstCallRules);
  return rules.length
    ? 'I know what has to be true before a first call earns attention.'
    : 'The first-call judgment boundary is clear.';
}

function strategyConclusion(snapshot) {
  const strategy = snapshot?.strategy || {};
  return (strategy.discoveryStyle || strategy.briefDensity || strategy.preferredNextMove)
    ? 'I know how you want a strong opportunity prepared and approached.'
    : 'The default preparation playbook is clear.';
}

function exceptionConclusion(snapshot) {
  const exceptions = list(snapshot?.exceptions);
  return exceptions.length
    ? 'I know where the normal pattern can bend without weakening the evidence standard.'
    : 'The default rules are clear, with no explicit exception path added.';
}

const bridgeLogic = {
  Practice: {
    next: 'Opportunity',
    conclusion: practiceConclusion,
    reason: 'Now I need to know who that work is really for.',
    split: true
  },
  Opportunity: {
    next: 'Commercial',
    conclusion: opportunityConclusion,
    reason: 'Next: what makes that fit worth taking on?',
    split: false
  },
  Commercial: {
    next: 'Judgment',
    conclusion: commercialConclusion,
    reason: 'Next: what makes a first call worth your time?',
    split: true
  },
  Judgment: {
    next: 'Strategy',
    conclusion: judgmentConclusion,
    reason: 'Next: how do you want a good opportunity approached?',
    split: false
  },
  Strategy: {
    next: 'Exceptions',
    conclusion: strategyConclusion,
    reason: 'Last: where should that default playbook bend?',
    split: false
  },
  Exceptions: {
    next: 'Review',
    conclusion: exceptionConclusion,
    reason: 'The reasoning model is complete. Let’s review what I’ll use.',
    split: true
  }
};

function readingDuration(text, { splitPhase = false } = {}) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  if (splitPhase) return Math.max(3900, Math.min(5200, 3000 + words * 150));
  return Math.max(6000, Math.min(7800, 3900 + words * 165));
}

function clearBridgeTimers() {
  bridgeTimers.forEach((timer) => window.clearTimeout(timer));
  bridgeTimers = [];
}

function removeBridge(shell) {
  if (!shell) return;
  clearBridgeTimers();
  shell.classList.add('is-leaving');
  document.body.classList.remove('claris-bridge-active');
  window.setTimeout(() => shell.remove(), 620);
  if (activeBridge === shell) activeBridge = null;
}

function makeEyebrow(text) {
  const node = document.createElement('p');
  node.className = 'claris-reasoning-bridge__eyebrow';
  node.textContent = text;
  return node;
}

function makeConclusion(text) {
  const node = document.createElement('p');
  node.className = 'claris-reasoning-bridge__conclusion';
  node.textContent = text;
  return node;
}

function makeReason(text) {
  const node = document.createElement('p');
  node.className = 'claris-reasoning-bridge__reason';
  node.textContent = text;
  return node;
}

function showBridge(chapter) {
  const logic = bridgeLogic[chapter];
  if (!logic) return;

  if (activeBridge) activeBridge.remove();
  clearBridgeTimers();

  const snapshot = safeProfile();
  const conclusion = logic.conclusion(snapshot);
  const reason = logic.reason;

  const shell = document.createElement('section');
  shell.className = 'claris-reasoning-bridge';
  shell.setAttribute('aria-live', 'polite');
  shell.setAttribute('aria-label', `${chapter} to ${logic.next}`);

  const inner = document.createElement('div');
  inner.className = 'claris-reasoning-bridge__inner';

  let duration;

  if (logic.split) {
    shell.classList.add('is-split');

    const firstDuration = readingDuration(conclusion, { splitPhase: true });
    const secondDuration = readingDuration(reason, { splitPhase: true });
    const phaseTransition = 700;
    duration = firstDuration + secondDuration + phaseTransition;

    const summaryPanel = document.createElement('div');
    summaryPanel.className = 'claris-reasoning-bridge__panel claris-reasoning-bridge__panel--summary';
    summaryPanel.append(
      makeEyebrow(`${chapter} understood`),
      makeConclusion(conclusion)
    );

    const nextPanel = document.createElement('div');
    nextPanel.className = 'claris-reasoning-bridge__panel claris-reasoning-bridge__panel--next';
    nextPanel.append(
      makeEyebrow(`Next · ${logic.next}`),
      makeReason(reason)
    );

    inner.append(summaryPanel, nextPanel);

    bridgeTimers.push(window.setTimeout(() => {
      if (activeBridge === shell) shell.classList.add('is-phase-two');
    }, firstDuration));
  } else {
    duration = readingDuration(`${conclusion} ${reason}`);
    inner.append(
      makeEyebrow(`${chapter}  →  ${logic.next}`),
      makeConclusion(conclusion),
      makeReason(reason)
    );
  }

  shell.style.setProperty('--bridge-duration', `${duration}ms`);
  shell.appendChild(inner);
  document.body.appendChild(shell);
  document.body.classList.add('claris-bridge-active');
  activeBridge = shell;

  bridgeTimers.push(window.setTimeout(() => removeBridge(shell), duration));
}

function currentChapter() {
  const node = document.querySelector('.chapter-title');
  const value = node?.textContent?.trim() || '';
  return CHAPTER_ORDER.includes(value) ? value : '';
}

function handleChapterChange() {
  const current = currentChapter();
  if (!current) return;

  if (!previousChapter) {
    previousChapter = current;
    return;
  }
  if (current === previousChapter) return;

  const departing = previousChapter;
  const fromIndex = CHAPTER_ORDER.indexOf(departing);
  const toIndex = CHAPTER_ORDER.indexOf(current);
  previousChapter = current;

  // Bridges narrate forward chapter completion only.
  // Back navigation should feel immediate and must never replay the recap
  // for the chapter the user is returning from.
  if (toIndex <= fromIndex) {
    if (activeBridge) removeBridge(activeBridge);
    return;
  }

  const logic = bridgeLogic[departing];
  if (!logic || logic.next !== current) return;
  showBridge(departing);
}

function start() {
  const target = document.getElementById('chapterIdentity') || document.body;
  const observer = new MutationObserver(handleChapterChange);
  observer.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });
  handleChapterChange();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(start), { once: true });
} else {
  requestAnimationFrame(start);
}
