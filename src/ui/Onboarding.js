/**
 * Onboarding.js — coach marks for the first run.
 *
 * No tutorial level, no forced sequence, no wall of text. The game starts
 * immediately and hints appear exactly when they become relevant, then leave
 * the moment the player demonstrates they understood. Anything a player can
 * work out in two seconds by touching the screen doesn't get a hint at all.
 *
 * Every hint fires at most once, ever, and the whole thing is inert after the
 * first run completes.
 */

import { el } from './dom.js';
import { bus, EV } from '../core/Events.js';
import { save } from '../core/Save.js';

const SHOWN = new Set();

export class Onboarding {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.node = null;
    this.active = false;
    this.moved = false;
    this._offs = [];

    bus.on(EV.RUN_START, () => this.onRunStart());
    bus.on(EV.RUN_END, () => this.finish());
    bus.on(EV.LEVEL_UP, () => this.hide());
    bus.on(EV.ULT_READY, () => this.coach('ult'));
  }

  get done() { return !!save.profile.flags.tutorialDone; }

  onRunStart() {
    if (this.done) return;
    this.active = true;
    this.moved = false;
    // Give the intro animation room before the first hint lands.
    setTimeout(() => { if (this.active && !this.moved) this.coach('move'); }, 1500);
  }

  /** Called by the run each frame with the current state. */
  tick(run, input) {
    if (!this.active || this.done) return;

    if (!this.moved && (Math.abs(input.dx) > 3 || Math.abs(input.dy) > 3)) {
      this.moved = true;
      this.hide();
      setTimeout(() => { if (this.active) this.coach('collect'); }, 2600);
    }
    if (run.ult >= run.ultMax && !SHOWN.has('ult')) this.coach('ult');
    if (run.player.hp <= 1 && !SHOWN.has('lowhp')) this.coach('lowhp');
  }

  coach(kind) {
    if (this.done || SHOWN.has(kind)) return;
    SHOWN.add(kind);

    const COPY = {
      move:    { icon: '👆', title: 'Sleep om te vliegen', body: 'Overal op het scherm. Je schip volgt je duim — je vingers bedekken nooit je schip.' },
      collect: { icon: '◈', title: 'Pak de Prisms', body: 'Elke vijand laat Prisms vallen. Genoeg Prisms is een level, en elk level is een nieuwe kaart.' },
      ult:     { icon: '✦', title: 'Ultimate klaar', body: 'Tik de gloeiende bol rechtsonder. Bewaar hem voor als het misgaat.' },
      lowhp:   { icon: '⚠', title: 'Laatste leven', body: 'Eén treffer nog. Zoek ruimte — hartjes vallen uit vijanden.' },
    };
    const c = COPY[kind];
    if (!c) return;

    this.hide();
    this.node = el('div.coach', { dataset: { kind } },
      el('div.coach__icon', { text: c.icon }),
      el('div.coach__mid', null,
        el('div.coach__title', { text: c.title }),
        el('div.coach__body', { text: c.body }),
      ),
    );
    this.root.appendChild(this.node);
    requestAnimationFrame(() => (this.node.dataset.in = '1'));

    const ttl = kind === 'move' ? 6000 : 4200;
    this._timer = setTimeout(() => this.hide(), ttl);
  }

  hide() {
    clearTimeout(this._timer);
    const n = this.node;
    if (!n) return;
    this.node = null;
    n.dataset.in = '0';
    setTimeout(() => n.remove(), 300);
  }

  /** After one complete run the player has seen everything that matters. */
  finish() {
    this.hide();
    if (!this.active) return;
    this.active = false;
    save.profile.flags.tutorialDone = true;
    save.touch();
  }
}

/* ------------------------------------------------------------------
   Welcome — shown once, before the very first run.
   ------------------------------------------------------------------ */

export function welcomeSheet(onStart) {
  const node = el('div.welcome', null,
    el('div.welcome__scrim'),
    el('div.welcome__panel', null,
      el('div.welcome__mark', { html: `
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#22d3ee"/><stop offset="50%" stop-color="#a855f7"/>
            <stop offset="100%" stop-color="#fbbf24"/></linearGradient></defs>
          <path d="M60 6 L70 44 L108 54 L70 64 L60 102 L50 64 L12 54 L50 44 Z" fill="url(#wg)"/>
        </svg>` }),
      el('h1.welcome__title', { text: 'ASTRAFALL' }),
      el('p.welcome__lead', { text: 'Eén duim. Zestig seconden. Alles op het spel.' }),
      el('ul.welcome__list', null,
        line('👆', 'Sleep waar dan ook', 'Je Astra vecht automatisch. Jij ontwijkt.'),
        line('◈', 'Level in de run', 'Elke level-up is een keuze uit drie kaarten.'),
        line('✦', 'Summon nieuwe Astra', 'Elke run levert Stardust op. Altijd.'),
        line('↗', 'Deel je seed', 'Iedereen die jouw code speelt krijgt exact dezelfde run.'),
      ),
      el('button.btn.btn--gold.btn--xl.btn--full', {
        onclick: () => { node.dataset.out = '1'; setTimeout(() => { node.remove(); onStart?.(); }, 300); },
      }, el('span.btn__label', null, el('span.btn__main', { text: 'START' }))),
    ),
  );
  requestAnimationFrame(() => (node.dataset.in = '1'));
  return node;
}

const line = (icon, title, body) => el('li', null,
  el('span.welcome__i', { text: icon }),
  el('span', null, el('b', { text: title }), el('i', { text: body })),
);
