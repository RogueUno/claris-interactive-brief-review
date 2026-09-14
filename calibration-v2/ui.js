export function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function wireGlass(node) {
  node.addEventListener('pointermove', (event) => {
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--px', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    node.style.setProperty('--py', `${((event.clientY - rect.top) / rect.height) * 100}%`);
  });
  node.addEventListener('pointerleave', () => { node.style.setProperty('--px', '28%'); node.style.setProperty('--py', '28%'); });
  return node;
}
export function addShell(root) {
  clear(root);
  root.className = 'claris-shell';
  const topbar = el('header', 'calibration-topbar');
  topbar.appendChild(el('div', 'wordmark', 'CLARIS'));
  const chapter = el('div', 'chapter-identity');
  chapter.id = 'chapterIdentity';
  chapter.appendChild(el('span', 'chapter-title', ''));
  topbar.appendChild(chapter);
  root.appendChild(topbar);
  const stage = el('section', 'stage');
  stage.id = 'stage';
  root.appendChild(stage);
  return stage;
}
export function setChapter(label, animate = true) {
  const wrapper = document.getElementById('chapterIdentity');
  const title = wrapper?.querySelector('.chapter-title');
  if (!wrapper || !title || title.textContent === label) return;
  if (!animate || !title.textContent) {
    title.textContent = label || '';
    wrapper.className = 'chapter-identity is-entering';
    requestAnimationFrame(() => wrapper.classList.add('is-settled'));
    return;
  }
  wrapper.className = 'chapter-identity is-leaving';
  setTimeout(() => {
    title.textContent = label || '';
    wrapper.className = 'chapter-identity is-entering';
    requestAnimationFrame(() => requestAnimationFrame(() => wrapper.classList.add('is-settled')));
  }, 360);
}
export function questionScene(stage, kicker, title, helper = '') {
  const scene = el('div', 'scene');
  if (kicker) scene.appendChild(el('div', 'question-kicker', kicker));
  scene.appendChild(el('h1', 'question-title', title));
  if (helper) scene.appendChild(el('p', 'question-helper', helper));
  stage.appendChild(scene);
  return scene;
}
export function showInsight(root, text) {
  root.querySelector('.insight')?.remove();
  const insight = wireGlass(el('div', 'insight glass', text));
  root.appendChild(insight);
  setTimeout(() => insight.remove(), 3300);
}
export function choice(label, selected, onClick) {
  const button = wireGlass(el('button', 'choice glass', label));
  button.type = 'button';
  button.setAttribute('aria-pressed', String(Boolean(selected)));
  button.addEventListener('click', () => onClick(button));
  return button;
}
export function primary(label, onClick) {
  const button = wireGlass(el('button', 'primary-action glass', label));
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}
export function formatMoney(amount, currency = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount)); }
  catch { return `${currency} ${Number(amount).toLocaleString()}`; }
}
