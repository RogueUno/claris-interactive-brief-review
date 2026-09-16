const chapterOrder = ['Practice', 'Opportunity', 'Commercial', 'Judgment', 'Strategy', 'Exceptions', 'Review'];
let previousChapter = '';
let activeRecap = null;

function text(values, fallback = 'still open') {
  const clean = (values || []).filter(Boolean);
  return clean.length ? clean.join(', ') : fallback;
}

function profile() {
  try {
    return window.__CLARIS_CALIBRATION_V3_PREVIEW__?.profile?.() || null;
  } catch {
    return null;
  }
}

function chapterSummary(chapter, snapshot) {
  if (!snapshot) return null;

  if (chapter === 'Practice') {
    const services = (snapshot.practice?.services || []).filter((service) => service.selected && ['ACTIVE', 'SELECTIVE', 'PAUSED'].includes(service.state));
    const active = services.filter((service) => service.state === 'ACTIVE').map((service) => service.name);
    const selective = services.filter((service) => service.state === 'SELECTIVE').map((service) => service.name);
    const paused = services.filter((service) => service.state === 'PAUSED').map((service) => service.name);
    const parts = [];
    if (active.length) parts.push(`${text(active)} ${active.length === 1 ? 'is' : 'are'} active`);
    if (selective.length) parts.push(`${text(selective)} ${selective.length === 1 ? 'is' : 'are'} selective`);
    if (paused.length) parts.push(`${text(paused)} ${paused.length === 1 ? 'is' : 'are'} paused`);
    return parts.length ? `I’ve got the service model: ${parts.join('; ')}.` : 'I’ve got the current service model.';
  }

  if (chapter === 'Opportunity') {
    const opportunity = snapshot.opportunity || {};
    const types = text(opportunity.companyTypes, 'the confirmed company profile');
    const buyers = text(opportunity.buyerRoles, 'the relevant stakeholders');
    const geo = opportunity.geographyMatters
      ? `with ${text(opportunity.geographies, 'the confirmed regions')} preferred`
      : 'with geography left neutral';
    return `The opportunity model is clearer now: ${types}, ${buyers}, ${geo}.`;
  }

  if (chapter === 'Commercial') {
    const commercial = snapshot.commercial || {};
    const floor = commercial.minimumEngagement ? `${commercial.currency || ''} ${Number(commercial.minimumEngagement).toLocaleString()}`.trim() : 'the confirmed commercial floor';
    const models = text(commercial.engagementModels, 'the preferred engagement models');
    const budget = commercial.budgetRequired ? 'direct budget evidence is required before call one' : 'budget may remain unknown before call one';
    return `Commercially, I’ll protect a ${floor} floor, favor ${models}, and remember that ${budget}.`;
  }

  if (chapter === 'Judgment') {
    const judgment = snapshot.judgment || {};
    const rules = text(judgment.firstCallRules, 'the confirmed first-call rules');
    const vanity = text(judgment.vanitySignals, 'attractive signals that are never enough alone');
    return `I’ve got the judgment boundary: first-call value depends on ${rules}, while ${vanity} will not qualify an opportunity by themselves.`;
  }

  if (chapter === 'Strategy') {
    const strategy = snapshot.strategy || {};
    const posture = strategy.discoveryStyle || 'the confirmed discovery style';
    const density = strategy.briefDensity || 'the confirmed brief depth';
    const nextMove = strategy.preferredNextMove || 'the preferred next move';
    return `The preparation style is set: ${posture}, ${density}, with ${nextMove} as the default direction when the opportunity supports it.`;
  }

  if (chapter === 'Exceptions') {
    const exceptions = snapshot.exceptions || [];
    return exceptions.length
      ? `I’ll keep ${text(exceptions)} as legitimate reasons to look closer — never as permission to weaken the evidence standard.`
      : 'There are no explicit exception rules to override the normal opportunity model.';
  }

  return null;
}

function showRecap(chapter) {
  const summary = chapterSummary(chapter, profile());
  if (!summary) return;

  activeRecap?.remove();

  const shell = document.createElement('section');
  shell.className = 'claris-chapter-recap';
  shell.setAttribute('aria-live', 'polite');

  const inner = document.createElement('div');
  inner.className = 'claris-chapter-recap__inner';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'claris-chapter-recap__eyebrow';
  eyebrow.textContent = `${chapter} calibrated`;

  const copy = document.createElement('p');
  copy.className = 'claris-chapter-recap__text';
  copy.textContent = summary;

  inner.append(eyebrow, copy);
  shell.appendChild(inner);
  document.body.appendChild(shell);
  activeRecap = shell;

  window.setTimeout(() => {
    if (activeRecap === shell) activeRecap = null;
    shell.remove();
  }, 2520);
}

function handleChapterChange() {
  const node = document.querySelector('.chapter-title');
  if (!node) return;
  const current = node.textContent.trim();
  if (!current || !chapterOrder.includes(current)) return;

  if (!previousChapter) {
    previousChapter = current;
    return;
  }

  if (current === previousChapter) return;

  const departing = previousChapter;
  previousChapter = current;
  showRecap(departing);
}

function watchChapter() {
  const target = document.getElementById('chapterIdentity') || document.body;
  const observer = new MutationObserver(handleChapterChange);
  observer.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });
  handleChapterChange();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(watchChapter), { once: true });
} else {
  requestAnimationFrame(watchChapter);
}
