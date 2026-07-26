/**
 * CardPicker.js — the level-up choice.
 *
 * This is the most-screenshotted screen in the game, so it gets the most care:
 * three cards, staggered entry, rarity-coloured glow, tilt on touch, and a
 * re-roll that costs nothing the first time (players who feel railroaded stop
 * playing; players who feel in control keep going).
 */

import { el, stagger, pulse } from './dom.js';
import { RARITY_INFO } from '../data/constants.js';
import { Sfx } from '../core/Audio.js';
import { haptic } from '../core/Input.js';

export class CardPicker {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.node = null;
    this.rerollsLeft = 1;
  }

  /**
   * @param {Array} cards
   * @param {object} opts { level, stacks, onPick, onReroll }
   */
  open(cards, { level = 1, stacks = {}, onPick, onReroll } = {}) {
    this.close();

    const title = el('div.lvl__head', null,
      el('div.lvl__eyebrow', { text: 'NIVEAU BEREIKT' }),
      el('div.lvl__level', null, 'Lv ', el('b', { text: String(level) })),
      el('div.lvl__hint', { text: 'Kies één' }),
    );

    const cardEls = cards.map((c, i) => this.buildCard(c, stacks[c.id] ?? 0, () => {
      Sfx.play('confirm');
      haptic('medium');
      this.animateOut(i);
      setTimeout(() => { this.close(); onPick?.(c); }, 220);
    }));

    stagger(cardEls);

    const reroll = el('button.lvl__reroll', {
      disabled: this.rerollsLeft <= 0,
      onclick: () => {
        if (this.rerollsLeft <= 0) return;
        this.rerollsLeft--;
        Sfx.play('tap');
        haptic('light');
        onReroll?.();
      },
    }, `↻ Opnieuw trekken (${this.rerollsLeft})`);

    this.node = el('div.lvl', null,
      el('div.lvl__scrim'),
      el('div.lvl__panel', null, title, el('div.lvl__cards', null, ...cardEls), reroll),
    );

    this.root.appendChild(this.node);
    requestAnimationFrame(() => this.node.dataset.in = '1');
    Sfx.play('levelup');
  }

  buildCard(card, stack, onPick) {
    const info = RARITY_INFO[card.rarity];
    const node = el('button.card', {
      dataset: { rarity: info.key.toLowerCase() },
      style: { '--c': card.color ?? info.color, '--glow': info.glow },
      onclick: onPick,
    },
      el('div.card__glow'),
      el('div.card__inner', null,
        el('div.card__top', null,
          el('div.card__icon', { text: card.icon ?? '✦' }),
          el('div.card__tier', { text: info.short }),
        ),
        el('div.card__name', { text: card.name }),
        el('div.card__desc', { text: typeof card.desc === 'function' ? card.desc(stack) : card.desc }),
        el('div.card__foot', null,
          el('span.card__tag', { text: card.tag ?? '' }),
          stack > 0 ? el('span.card__stack', { text: `${stack}/${card.max}` }) : null,
        ),
      ),
      el('div.card__shine'),
    );

    // Parallax tilt while the thumb is on the card.
    node.addEventListener('pointermove', (e) => {
      const r = node.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      node.style.setProperty('--tx', (dx * 10).toFixed(2) + 'deg');
      node.style.setProperty('--ty', (-dy * 12).toFixed(2) + 'deg');
      node.style.setProperty('--sx', ((dx + 0.5) * 100).toFixed(1) + '%');
    });
    const reset = () => {
      node.style.setProperty('--tx', '0deg');
      node.style.setProperty('--ty', '0deg');
    };
    node.addEventListener('pointerleave', reset);
    node.addEventListener('pointerup', reset);
    node.addEventListener('pointerenter', () => Sfx.play('tap', { gate: 0.1 }));

    return node;
  }

  animateOut(chosenIndex) {
    if (!this.node) return;
    [...this.node.querySelectorAll('.card')].forEach((c, i) => {
      c.dataset.chosen = i === chosenIndex ? '1' : '0';
    });
    this.node.dataset.in = '0';
  }

  close() {
    if (!this.node) return;
    const n = this.node;
    this.node = null;
    n.dataset.in = '0';
    setTimeout(() => n.remove(), 260);
  }

  resetRerolls() { this.rerollsLeft = 1; }
}
