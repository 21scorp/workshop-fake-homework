/**
 * Chrome.js — shared UI furniture: currency rail, nav bar, headers, buttons.
 * One place so every screen is visually identical without copy-paste.
 */

import { el, countTo, pulse } from '../dom.js';
import { CURRENCY, RARITY_INFO } from '../../data/constants.js';
import { save } from '../../core/Save.js';
import { bus, EV } from '../../core/Events.js';
import { abbrev } from '../../core/Math2.js';
import { Sfx } from '../../core/Audio.js';
import { haptic } from '../../core/Input.js';
import { accountProgress } from '../../systems/Economy.js';
import { spriteEl } from './SpriteCanvas.js';
import { astraSprite } from '../../data/astra.js';

/* ============================================================
   CURRENCY RAIL
   ============================================================ */

export function currencyRail(kinds = ['stardust', 'shards', 'echoes']) {
  const cells = {};
  const node = el('div.rail');

  for (const k of kinds) {
    const c = CURRENCY[k];
    const val = el('span.rail__v', { text: abbrev(save.profile.currency[k] ?? 0) });
    cells[k] = val;
    node.appendChild(el('div.rail__cell', { style: { '--c': c.color }, title: c.desc },
      el('span.rail__i', { text: c.symbol }),
      val,
    ));
  }

  const off = bus.on(EV.CURRENCY, ({ kind, total, amount }) => {
    const cell = cells[kind];
    if (!cell) return;
    const from = Number(String(cell.dataset.raw || 0));
    cell.dataset.raw = String(total);
    countTo(cell, total, { from, duration: 650, format: (v) => abbrev(v) });
    pulse(cell.parentElement, amount > 0 ? 'is-gain' : 'is-spend', 620);
  });
  node._dispose = off;

  for (const k of kinds) cells[k].dataset.raw = String(save.profile.currency[k] ?? 0);
  return node;
}

/* ============================================================
   PLAYER STRIP — level, XP, name
   ============================================================ */

export function playerStrip() {
  const p = save.profile;
  const prog = accountProgress();
  return el('div.pstrip', null,
    el('div.pstrip__lv', null, el('span', { text: String(prog.level) })),
    el('div.pstrip__mid', null,
      el('div.pstrip__name', { text: p.name }),
      el('div.pstrip__bar', null, el('i', { style: { transform: `scaleX(${prog.pct})` } })),
    ),
    el('div.pstrip__xp', { text: `${abbrev(prog.xp)}/${abbrev(prog.need)}` }),
  );
}

/* ============================================================
   BUTTONS
   ============================================================ */

export function button(label, opts = {}) {
  const {
    variant = 'primary', icon, sub, onclick, disabled = false,
    size = 'md', full = false, sfx = 'tap', haptics = 'light',
  } = opts;
  return el(`button.btn.btn--${variant}.btn--${size}${full ? '.btn--full' : ''}`, {
    disabled,
    onclick: (e) => {
      if (disabled) return;
      Sfx.play(sfx);
      haptic(haptics);
      onclick?.(e);
    },
  },
    icon ? el('span.btn__icon', { text: icon }) : null,
    el('span.btn__label', null,
      el('span.btn__main', { text: label }),
      sub ? el('span.btn__sub', { text: sub }) : null,
    ),
    el('span.btn__shine'),
  );
}

export function iconButton(icon, opts = {}) {
  return el('button.ibtn', {
    'aria-label': opts.label ?? icon,
    onclick: (e) => { Sfx.play(opts.sfx ?? 'tap'); haptic('light'); opts.onclick?.(e); },
  }, el('span', { text: icon }));
}

export function backButton(onclick) {
  return el('button.backbtn', {
    'aria-label': 'Terug',
    onclick: () => { Sfx.play('back'); haptic('light'); onclick?.(); },
  }, el('span', { text: '‹' }));
}

/* ============================================================
   SCREEN HEADER
   ============================================================ */

export function header(title, { onBack, right, sub } = {}) {
  return el('header.shead', null,
    onBack ? backButton(onBack) : el('div.shead__spacer'),
    el('div.shead__mid', null,
      el('h1.shead__title', { text: title }),
      sub ? el('div.shead__sub', { text: sub }) : null,
    ),
    right ?? el('div.shead__spacer'),
  );
}

/* ============================================================
   ASTRA CARD — used in the collection grid and pull results
   ============================================================ */

export function astraCard(astra, entry, opts = {}) {
  const info = RARITY_INFO[astra.rarity];
  const owned = !!entry;
  const stars = entry?.stars ?? 0;

  const node = el('button.acard', {
    dataset: { rarity: info.key.toLowerCase(), owned: owned ? '1' : '0', new: entry?.isNew ? '1' : '0' },
    style: { '--c': info.color, '--glow': info.glow, '--p': astra.colors.primary },
    onclick: () => { Sfx.play('tap'); haptic('light'); opts.onclick?.(astra, entry); },
  },
    el('div.acard__bg'),
    el('div.acard__art', null,
      spriteEl(astraSprite(astra, 'idle'), {
        size: opts.size ?? 96,
        tint: astra.colors.primary,
        tint2: astra.colors.secondary,
        // Grid thumbnails clip anyway, so trade a little glow headroom for a
        // silhouette that actually reads at this size.
        scale: 1.32,
      }),
    ),
    el('div.acard__rarity', { text: info.short }),
    el('div.acard__name', { text: owned ? astra.name : '???' }),
    el('div.acard__stars', null,
      ...Array.from({ length: info.stars }, (_, i) =>
        el('span.acard__star', { dataset: { on: i < stars ? '1' : '0' }, text: '★' })),
    ),
    entry?.isNew ? el('div.acard__new', { text: 'NIEUW' }) : null,
    opts.equipped ? el('div.acard__eq', { text: '✓' }) : null,
  );
  return node;
}

/* ============================================================
   BOTTOM NAV
   ============================================================ */

const NAV = [
  { id: 'home', icon: '⌂', label: 'Basis' },
  { id: 'summon', icon: '✦', label: 'Summon' },
  { id: 'collection', icon: '◈', label: 'Astra' },
  { id: 'shop', icon: '⬡', label: 'Winkel' },
];

export function navBar(current, onNav) {
  const node = el('nav.nav');
  for (const item of NAV) {
    node.appendChild(el('button.nav__item', {
      dataset: { on: item.id === current ? '1' : '0' },
      onclick: () => { if (item.id === current) return; Sfx.play('tap'); haptic('light'); onNav(item.id); },
    },
      el('span.nav__icon', { text: item.icon }),
      el('span.nav__label', { text: item.label }),
      el('span.nav__dot'),
    ));
  }
  return node;
}

/* ============================================================
   MISC
   ============================================================ */

export function statTile(label, value, opts = {}) {
  return el('div.stile', { style: opts.color ? { '--c': opts.color } : null },
    el('div.stile__v', { text: value }),
    el('div.stile__l', { text: label }),
  );
}

export function sheet(title, body, { onClose } = {}) {
  const node = el('div.sheet', null,
    el('div.sheet__scrim', { onclick: () => close() }),
    el('div.sheet__panel', null,
      el('div.sheet__grab'),
      el('div.sheet__head', null,
        el('h2', { text: title }),
        iconButton('✕', { label: 'Sluiten', sfx: 'back', onclick: () => close() }),
      ),
      el('div.sheet__body', null, body),
    ),
  );
  function close() {
    node.dataset.out = '1';
    setTimeout(() => { node.remove(); onClose?.(); }, 280);
  }
  node.close = close;
  requestAnimationFrame(() => node.dataset.in = '1');
  return node;
}

export function progressBar(frac, { color = 'var(--accent)', height = 6, label } = {}) {
  return el('div.pbar', { style: { '--c': color, '--h': height + 'px' } },
    el('i', { style: { transform: `scaleX(${Math.max(0, Math.min(1, frac))})` } }),
    label ? el('span.pbar__label', { text: label }) : null,
  );
}

export function emptyState(icon, title, body) {
  return el('div.empty', null,
    el('div.empty__icon', { text: icon }),
    el('div.empty__title', { text: title }),
    el('div.empty__body', { text: body }),
  );
}
