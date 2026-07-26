/**
 * Router.js — screen router for the meta layer.
 *
 * Screens are functions: `(ctx) => { node, dispose? }`. The router owns mounting,
 * the enter/exit transition, the back stack and the nav bar. Screens never touch
 * each other — they navigate by name.
 */

import { el } from './dom.js';
import { navBar } from './components/Chrome.js';
import { bus, EV } from '../core/Events.js';

const NAV_SCREENS = new Set(['home', 'summon', 'collection', 'shop']);

export class Router {
  /**
   * @param {HTMLElement} root
   * @param {object} ctx  shared context handed to every screen
   */
  constructor(root, ctx) {
    this.root = root;
    this.ctx = { ...ctx, go: (n, p) => this.go(n, p), back: () => this.back() };
    this.screens = new Map();
    this.current = null;
    this.currentName = null;
    this.stack = [];
    this.busy = false;

    this.shell = el('div.shell', null,
      this.viewport = el('div.viewport'),
      this.navWrap = el('div.navwrap'),
    );
  }

  register(name, factory) { this.screens.set(name, factory); return this; }

  mount() {
    this.root.replaceChildren(this.shell);
    return this;
  }

  /** @param {string} name @param {object} params */
  go(name, params = {}) {
    if (this.busy) return;
    const factory = this.screens.get(name);
    if (!factory) { console.error(`[router] unknown screen "${name}"`); return; }
    if (name === this.currentName && !params.force) return;

    if (this.currentName && !params.replace) this.stack.push({ name: this.currentName, params: this.currentParams });
    if (this.stack.length > 12) this.stack.shift();

    this._swap(name, params, params.dir ?? 'forward');
  }

  back(fallback = 'home') {
    const prev = this.stack.pop();
    if (prev) this._swap(prev.name, { ...prev.params, restored: true }, 'back');
    else this._swap(fallback, {}, 'back');
  }

  _swap(name, params, dir) {
    const factory = this.screens.get(name);
    if (!factory) return;
    this.busy = true;

    const old = this.current;
    const oldNode = old?.node;

    let screen;
    try {
      screen = factory(this.ctx, params) ?? {};
    } catch (err) {
      console.error(`[router] screen "${name}" failed to build`, err);
      screen = { node: el('div.screen', null, el('div.empty', null, 'Er ging iets mis.')) };
      this.busy = false;
    }

    const node = screen.node;
    node.classList.add('screen');
    node.dataset.dir = dir;
    node.dataset.state = 'enter';

    this.viewport.appendChild(node);
    requestAnimationFrame(() => {
      node.dataset.state = 'active';
      if (oldNode) oldNode.dataset.state = dir === 'back' ? 'exit-back' : 'exit';
    });

    setTimeout(() => {
      try { old?.dispose?.(); } catch (e) { console.error('[router] dispose threw', e); }
      oldNode?.remove();
      this.busy = false;
    }, 340);

    this.current = screen;
    this.currentName = name;
    this.currentParams = params;

    this._renderNav(name);
    document.body.dataset.screen = name;
    bus.emit(EV.NAV, { name, params });
  }

  _renderNav(name) {
    const show = NAV_SCREENS.has(name);
    this.navWrap.dataset.on = show ? '1' : '0';
    this.navWrap.replaceChildren(show ? navBar(name, (n) => this.go(n, { replace: true })) : el('span'));
  }

  destroy() {
    try { this.current?.dispose?.(); } catch { /* teardown is best-effort */ }
    this.root.replaceChildren();
    this.current = null;
    this.currentName = null;
  }
}
