export function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function svgIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const paths = {
    'arrow-right': ['M5 12h13', 'm14 6 6 6-6 6'],
    'arrow-left': ['M19 12H6', 'm10 6-6 6 6 6'],
    plus: ['M12 5v14', 'M5 12h14'],
    check: ['m6 12 4 4 8-9']
  };
  (paths[name] || paths['arrow-right']).forEach((d) => {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  });
  return svg;
}

export function wireGlass(node) {
  node.addEventListener('pointermove', (event) => {
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--px', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    node.style.setProperty('--py', `${((event.clientY - rect.top) / rect.height) * 100}%`);
  });
  node.addEventListener('pointerleave', () => {
    node.style.setProperty('--px', '36%');
    node.style.setProperty('--py', '32%');
  });
  return node;
}

function clarisWordmark() {
  const logo = el('span', 'wordmark', 'CLARIS');
  logo.setAttribute('role', 'img');
  logo.setAttribute('aria-label', 'CLARIS');
  logo.style.display = 'block';
  logo.style.width = '72px';
  logo.style.fontFamily = 'InterVariable, Inter, sans-serif';
  logo.style.fontSize = '17px';
  logo.style.fontWeight = '400';
  logo.style.lineHeight = '1';
  logo.style.letterSpacing = '0.29em';
  logo.style.color = '#fff';
  logo.style.whiteSpace = 'nowrap';
  logo.style.transform = 'translate(-1px, -1px)';
  logo.style.fontFeatureSettings = '"liga" 0, "calt" 0';
  return logo;
}

export function addShell(root) {
  root.className = 'claris-shell';
  let stage = root.querySelector('#stage');
  if (stage) {
    clear(stage);
    return stage;
  }

  const topbar = el('header', 'calibration-topbar');
  topbar.appendChild(clarisWordmark());
  const chapter = el('div', 'chapter-identity');
  chapter.id = 'chapterIdentity';
  chapter.appendChild(el('span', 'chapter-title', ''));
  topbar.appendChild(chapter);
  root.appendChild(topbar);

  stage = el('section', 'stage');
  stage.id = 'stage';
  root.appendChild(stage);
  return stage;
}

export function setChapter(label, animate = true) {
  const wrapper = document.getElementById('chapterIdentity');
  const title = wrapper?.querySelector('.chapter-title');
  if (!wrapper || !title || title.textContent === label) return;

  if (!animate) {
    title.textContent = label || '';
    wrapper.className = 'chapter-identity is-settled';
    return;
  }

  if (!title.textContent) {
    title.textContent = label || '';
    wrapper.className = 'chapter-identity is-entering';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wrapper.className = 'chapter-identity is-settled';
    }));
    return;
  }

  wrapper.className = 'chapter-identity is-leaving';
  window.setTimeout(() => {
    title.textContent = label || '';
    wrapper.className = 'chapter-identity is-entering';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wrapper.className = 'chapter-identity is-settled';
    }));
  }, 360);
}

export function revealWords(node, text, cadence = 145) {
  node.textContent = '';
  const words = text.split(' ');
  words.forEach((word, index) => {
    const span = el('span', 'reveal-word', `${word}${index === words.length - 1 ? '' : ' '}`);
    span.style.animationDelay = `${index * cadence}ms`;
    node.appendChild(span);
  });
  return Math.max(480, words.length * cadence + 340);
}

export function questionScene(stage, eyebrow, prompt, support = '') {
  const scene = el('div', 'scene question-scene');
  const frame = el('div', 'question-frame');
  if (eyebrow) frame.appendChild(el('p', 'question-eyebrow', eyebrow));
  frame.appendChild(el('h1', 'question-title', prompt));
  if (support) frame.appendChild(el('p', 'question-support', support));
  scene.appendChild(frame);
  stage.appendChild(scene);
  return scene;
}

export function showInsight(text, timeout = 1800) {
  const host = document.getElementById('insightHost');
  if (!host) return;
  clear(host);
  const insight = el('div', 'insight-toast glass', text);
  host.appendChild(insight);
  wireGlass(insight);
  requestAnimationFrame(() => insight.classList.add('is-visible'));
  window.setTimeout(() => insight.classList.remove('is-visible'), timeout);
}

export function choice(label, selected, onClick) {
  const button = el('button', `choice-pill glass${selected ? ' is-selected' : ''}`);
  button.type = 'button';
  button.setAttribute('aria-pressed', String(selected));
  button.appendChild(el('span', 'choice-label', label));
  const indicator = el('span', 'choice-indicator');
  indicator.appendChild(svgIcon('check'));
  button.appendChild(indicator);
  button.addEventListener('click', () => {
    onClick(button);
    button.classList.toggle('is-selected', button.getAttribute('aria-pressed') === 'true');
  });
  return wireGlass(button);
}

export function primary(label, onClick) {
  const button = el('button', 'primary-action glass');
  button.type = 'button';
  button.appendChild(el('span', '', label));
  button.appendChild(svgIcon('arrow-right'));
  button.addEventListener('click', onClick);
  return wireGlass(button);
}

export function iconButton(icon, label, onClick, className = '') {
  const button = el('button', `icon-action glass ${className}`.trim());
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.appendChild(svgIcon(icon));
  button.addEventListener('click', onClick);
  return wireGlass(button);
}

export function expandableInput({ placeholder = 'Add another', onCommit }) {
  const wrap = el('div', 'expandable-input');
  const trigger = el('button', 'add-trigger');
  trigger.type = 'button';
  trigger.appendChild(svgIcon('plus'));
  trigger.appendChild(el('span', '', placeholder));
  const input = el('input', 'quiet-input glass');
  input.type = 'text';
  input.placeholder = placeholder;
  input.hidden = true;

  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    onCommit(value);
    input.value = '';
  };
  trigger.addEventListener('click', () => {
    trigger.hidden = true;
    input.hidden = false;
    input.focus();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') {
      input.value = '';
      input.hidden = true;
      trigger.hidden = false;
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) commit();
    input.hidden = true;
    trigger.hidden = false;
  });
  wrap.append(trigger, input);
  return wrap;
}

export function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}
