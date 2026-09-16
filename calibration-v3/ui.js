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

export function addShell(root) {
  root.className = 'claris-shell';
  let stage = root.querySelector('#stage');
  if (stage) {
    clear(stage);
    return stage;
  }

  const topbar = el('header', 'calibration-topbar');
  const logo = el('img', 'wordmark');
  logo.src = './claris-logo.svg';
  logo.alt = 'CLARIS';
  logo.width = 72;
  logo.height = 23;
  logo.style.width = '72px';
  logo.style.height = 'auto';
  logo.style.transform = 'translate(-6px, -7px)';
  logo.style.display = 'block';
  topbar.appendChild(logo);
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
  setTimeout(() => {
    title.textContent = label || '';
    wrapper.className = 'chapter-identity is-entering';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wrapper.className = 'chapter-identity is-settled';
    }));
  }, 460);
}

export function questionScene(stage, context, title, helper = '') {
  const scene = el('div', 'scene question-scene');
  const copy = el('div', 'question-copy');
  if (context) copy.appendChild(el('p', 'question-context', context));
  copy.appendChild(el('h1', 'question-title', title));
  if (helper) copy.appendChild(el('p', 'question-helper', helper));
  scene.appendChild(copy);
  stage.appendChild(scene);
  return scene;
}

export function revealWords(node, text, stagger = 145) {
  const words = text.trim().split(/\s+/);
  let delay = 0;
  words.forEach((word, index) => {
    const span = el('span', 'intro-word', word);
    span.style.setProperty('--word-delay', `${delay}ms`);
    node.appendChild(span);
    if (index < words.length - 1) node.appendChild(document.createTextNode(' '));
    delay += stagger;
    if (/[,.!?—:]$/.test(word)) delay += 170;
  });
  return delay + 760;
}

export function showInsight(root, text) {
  root.querySelector('.insight')?.remove();
  const insight = el('div', 'insight', text);
  root.appendChild(insight);
  setTimeout(() => insight.remove(), 3000);
}

export function choice(label, selected, onClick) {
  const button = el('button', 'choice-row');
  button.type = 'button';
  button.setAttribute('aria-pressed', String(Boolean(selected)));
  const marker = el('span', 'choice-marker');
  marker.appendChild(svgIcon('check'));
  button.append(marker, el('span', 'choice-label', label));
  button.addEventListener('click', () => onClick(button));
  return button;
}

export function primary(label, onClick) {
  const button = wireGlass(el('button', 'primary-action glass'));
  button.type = 'button';
  button.append(el('span', 'primary-label', label), svgIcon('arrow-right'));
  button.addEventListener('click', onClick);
  return button;
}

export function iconButton(name, label, onClick, className = '') {
  const button = el('button', `icon-only ${className}`.trim());
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.appendChild(svgIcon(name));
  button.addEventListener('click', onClick);
  return button;
}

export function expandableInput(placeholder, onSubmit) {
  const shell = wireGlass(el('div', 'add-expand glass'));
  const toggle = iconButton('plus', 'Add another', () => {
    shell.classList.add('is-open');
    setTimeout(() => input.focus(), 280);
  }, 'add-toggle');
  const input = el('input', 'add-input');
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  const submit = iconButton('arrow-right', 'Add', () => commit(), 'add-submit');

  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    onSubmit(value);
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') {
      input.value = '';
      shell.classList.remove('is-open');
      toggle.focus();
    }
  });

  shell.append(toggle, input, submit);
  return shell;
}

export function formatMoney(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toLocaleString()}`;
  }
}
