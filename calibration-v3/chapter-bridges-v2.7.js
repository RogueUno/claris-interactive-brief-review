const CHAPTER_ORDER = ['Practice', 'Opportunity', 'Commercial', 'Judgment', 'Strategy', 'Exceptions', 'Review'];
let previousChapter = '';
let activeBridge = null;
let bridgeTimer = null;

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
  const selective = services.filter((service) => service.state === 'SELECTIVE').map((service) => service.name);

  if (lead && selective.length) {
    return `${lead.name} leads when it fits; ${joinNatural(selective)} stays selective.`;
  }
  if (lead) return `${lead.name} is the clearest lead when several paths fit.`;
  if (services.length === 1) return `${services[0].name} is the current service anchor.`;
  if (services.length > 1) return `The current service set is clear, without forcing one default lead.`;
  return 'The current service model is clear.';
}

function opportunityConclusion(snapshot) {
  const opportunity = snapshot?.opportunity || {};
  const types = list(opportunity.companyTypes);
  const buyers = list(opportunity.buyerRoles);
  if (types.length && buyers.length) {
    return `${joinNatural(types.slice(0, 2))} is the market shape; ${joinNatural(buyers.slice(0, 2))} are the people who usually make it real.`;
  }
  if (types.length) return `${joinNatural(types.slice(0, 2))} defines the strongest market pattern.`;
  return 'The opportunity boundary is clear.';
}

function commercialConclusion(snapshot) {
  const commercial = snapshot?.commercial || {};
  const floor = Number(commercial.minimumEngagement || 0);
  if (floor) {
    const currency = commercial.currency || '';
    return `${currency} ${floor.toLocaleString()} is the commercial floor I should protect.`.trim();
  }
  return 'The commercial guardrails are clear.';
}

function judgmentConclusion(snapshot) {
  const rules = list(snapshot?.judgment?.firstCallRules);
  if (rules.length) return 'I know what has to be true before a first call earns attention.';
  return 'The first-call judgment boundary is clear.';
}

function strategyConclusion(snapshot) {
  const strategy = snapshot?.strategy || {};
  if (strategy.discoveryStyle || strategy.briefDensity || strategy.preferredNextMove) {
    return 'I know how you want a strong opportunity prepared and approached.';
  }
  return 'The default preparation playbook is clear.';
}

function exceptionConclusion(snapshot) {
  const exceptions = list(snapshot?.exceptions);
  return exceptions.length
    ? 'I know where the normal pattern can bend without weakening the evidence standard.'
    : 'I know the default rules — and there are no explicit exception paths to add.';
}

const bridgeLogic = {
  Practice: {
    next: 'Opportunity',
    conclusion: practiceConclusion,
    reason: 'Now I need to know who those services are really for.'
  },
  Opportunity: {
    next: 'Commercial',
    conclusion: opportunityConclusion,
    reason: 'Fit is clear. Now I need to know what makes the work worth taking on.'
  },
  Commercial: {
    next: 'Judgment',
    conclusion: commercialConclusion,
    reason: 'Now I need to know what makes a first call worth your time.'
  },
  Judgment: {
    next: 'Strategy',
    conclusion: judgmentConclusion,
    reason: 'Next I need to know how you want a good opportunity approached.'
  },
  Strategy: {
    next: 'Exceptions',
    conclusion: strategyConclusion,
    reason: 'One last thing: where should that default playbook be allowed to bend?'
  },
  Exceptions: {
    next: 'Review',
    conclusion: exceptionConclusion,
    reason: 'That completes the reasoning model. Let’s review what I’ll use.'
  }
};

function readingDuration(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(4100, Math.min(5600, 2600 + words * 115));
}

function removeBridge(shell) {
  if (!shell) return;
  shell.classList.add('is-leaving');
  document.body.classList.remove('claris-bridge-active');
  window.setTimeout(() => shell.remove(), 560);
  if (activeBridge === shell) activeBridge = null;
}

function showBridge(chapter) {
  const logic = bridgeLogic[chapter];
  if (!logic) return;

  activeBridge?.remove();
  if (bridgeTimer) window.clearTimeout(bridgeTimer);

  const snapshot = safeProfile();
  const conclusion = logic.conclusion(snapshot);
  const reason = logic.reason;
  const totalText = `${conclusion} ${reason}`;
  const duration = readingDuration(totalText);

  const shell = document.createElement('section');
  shell.className = 'claris-reasoning-bridge';
  shell.setAttribute('aria-live', 'polite');
  shell.style.setProperty('--bridge-duration', `${duration}ms`);

  const inner = document.createElement('div');
  inner.className = 'claris-reasoning-bridge__inner';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'claris-reasoning-bridge__eyebrow';
  eyebrow.textContent = `${chapter}  →  ${logic.next}`;

  const conclusionNode = document.createElement('p');
  conclusionNode.className = 'claris-reasoning-bridge__conclusion';
  conclusionNode.textContent = conclusion;

  const reasonNode = document.createElement('p');
  reasonNode.className = 'claris-reasoning-bridge__reason';
  reasonNode.textContent = reason;

  inner.append(eyebrow, conclusionNode, reasonNode);
  shell.appendChild(inner);
  document.body.appendChild(shell);
  document.body.classList.add('claris-bridge-active');
  activeBridge = shell;

  bridgeTimer = window.setTimeout(() => removeBridge(shell), duration);
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
  previousChapter = current;
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
