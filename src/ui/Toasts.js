/**
 * Toasts.js — transient messages.
 * Capped at three on screen; the oldest is evicted rather than stacking a wall
 * of text over the play field.
 */

import { el } from './dom.js';
import { bus, EV } from '../core/Events.js';

const ICONS = { good: '✦', bad: '⚠', gold: '★', info: '›' };

export class Toasts {
  constructor(root) {
    this.root = root;
    this.items = [];
    bus.on(EV.TOAST, (t) => this.push(t));
  }

  push({ text, tone = 'info', ttl = 1800, icon } = {}) {
    if (!text) return;
    const node = el('div.toast', { dataset: { tone } },
      el('span.toast__icon', { text: icon ?? ICONS[tone] ?? ICONS.info }),
      el('span.toast__text', { text }),
    );
    this.root.appendChild(node);
    this.items.push(node);

    // Two at a time. Three stacked toasts cover the thing the player is
    // looking at, which is the opposite of what a toast is for.
    while (this.items.length > 2) this.dismiss(this.items[0]);
    setTimeout(() => this.dismiss(node), ttl);
  }

  dismiss(node) {
    const i = this.items.indexOf(node);
    if (i < 0) return;
    this.items.splice(i, 1);
    node.dataset.out = '1';
    setTimeout(() => node.remove(), 320);
  }
}
