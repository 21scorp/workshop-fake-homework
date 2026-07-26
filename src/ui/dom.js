/**
 * dom.js — a 60-line view layer.
 *
 * The game UI is DOM on top of canvas, not canvas-drawn widgets: text stays
 * crisp at any DPI, it's accessible, and CSS gives us blur, gradients and
 * spring animations for free. This is the entire abstraction needed for that.
 */

/**
 * Create an element.
 * `el('div.card.is-new', { onclick }, child, child)`
 */
export function el(spec, props = null, ...children) {
  const [tagAndId, ...classes] = String(spec).split('.');
  const [tag, id] = tagAndId.split('#');
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');

  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') applyStyle(node, v);
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k in node && k !== 'list') node[k] = v;
      else node.setAttribute(k, v);
    }
  }

  add(node, children);
  return node;
}

/**
 * Apply a style object.
 *
 * `Object.assign(node.style, obj)` silently drops custom properties — `--c`
 * is not a CSSStyleDeclaration key, so the assignment is a no-op and every
 * `var(--c)` downstream falls back. Custom properties must go through
 * setProperty, which is the entire reason this helper exists.
 */
export function applyStyle(node, obj) {
  for (const k in obj) {
    const v = obj[k];
    if (v === null || v === undefined) continue;
    if (k.startsWith('--')) node.style.setProperty(k, String(v));
    else node.style[k] = v;
  }
  return node;
}

function add(node, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) add(node, c);
    else node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  add(f, children);
  return f;
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) { node.replaceChildren(); return node; }

/**
 * Replace a node's children, skipping nullish entries.
 * `replaceChildren(null)` stringifies to a literal "null" text node — this is
 * the safe version for conditional children.
 */
export function fill(node, ...children) {
  node.replaceChildren();
  add(node, children);
  return node;
}

/** Add a class for one animation, then remove it. */
export function pulse(node, cls = 'is-pulse', ms = 500) {
  node.classList.remove(cls);
  void node.offsetWidth;              // force reflow so the animation restarts
  node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

/** Count a number up, easing out. Returns a cancel function. */
export function countTo(node, to, { from = 0, duration = 900, format = (v) => Math.round(v).toLocaleString('nl-NL') } = {}) {
  const start = performance.now();
  let raf = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    node.textContent = format(from + (to - from) * e);
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Stagger children in with a CSS custom property index. */
export function stagger(nodes, { delay = 45, prop = '--i' } = {}) {
  nodes.forEach((n, i) => n.style.setProperty(prop, String(i)));
  return nodes;
}

/** Wait for the next frame — lets a freshly-mounted node transition. */
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Long-press helper for "hold to skip". */
export function onHold(node, ms, onDone, onProgress) {
  let timer = null, start = 0, raf = 0;
  const stop = () => {
    clearTimeout(timer); cancelAnimationFrame(raf);
    timer = null; onProgress?.(0);
  };
  node.addEventListener('pointerdown', () => {
    start = performance.now();
    timer = setTimeout(() => { stop(); onDone(); }, ms);
    const tick = () => {
      onProgress?.(Math.min(1, (performance.now() - start) / ms));
      raf = requestAnimationFrame(tick);
    };
    tick();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => node.addEventListener(ev, stop));
  return stop;
}
