/**
 * HUD.js — the in-run heads-up display.
 *
 * Layout rule for a one-thumb portrait game: the top 12% and bottom 14% are the
 * only safe places for UI. The middle is the play field and must stay clean —
 * every pixel of chrome there is a pixel the player can't read a bullet through.
 *
 * The HUD never reads game state directly. It listens to `run:tick` and renders
 * whatever it's handed, so it can't desync and can't crash a run.
 */

import { el, clear, pulse } from './dom.js';
import { bus, EV } from '../core/Events.js';
import { abbrev, timeStr, clamp01 } from '../core/Math2.js';
import { haptic } from '../core/Input.js';

export class HUD {
  /** @param {HTMLElement} root @param {import('../core/Game.js').Game} game */
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.visible = false;
    this._lastScore = 0;
    this._lastCombo = 0;
    this._lastWave = 0;
    this.build();

    bus.on(EV.RUN_TICK, (s) => (s ? this.update(s) : this.hide()));
    bus.on(EV.RUN_START, () => this.show());
    bus.on(EV.PLAYER_DEAD, () => this.hide());
    bus.on(EV.BOSS_SPAWN, (b) => this.bossIntro(b));
  }

  build() {
    const r = clear(this.root);

    /* ---------- top rail ---------- */
    this.scoreEl = el('div.hud-score', { text: '0' });
    this.waveEl = el('div.hud-wave__num', { text: '1' });
    this.timeEl = el('div.hud-time', { text: '0:00' });

    this.waveRing = el('svg.hud-wave__ring', { viewBox: '0 0 40 40' }, ...svgRing());
    this.waveProgress = this.waveRing.querySelector('.ring-fg');

    this.top = el('div.hud-top', null,
      el('div.hud-wave', null, this.waveRing, this.waveEl),
      el('div.hud-center', null,
        this.scoreEl,
        this.timeEl,
      ),
      el('button.hud-pause', {
        'aria-label': 'Pauze',
        onclick: () => this.onPause?.(),
      }, el('span', { html: '&#9646;&#9646;' })),
    );

    /* ---------- combo ---------- */
    this.comboEl = el('div.hud-combo', null,
      this.comboNum = el('span.hud-combo__n', { text: '0' }),
      el('span.hud-combo__x', { text: '×' }),
    );

    /* ---------- boss bar ---------- */
    this.bossName = el('div.hud-boss__name');
    this.bossFill = el('i');
    this.bossBar = el('div.hud-boss', null,
      this.bossName,
      el('div.hud-boss__bar', null, this.bossFill),
    );
    this.bossBar.hidden = true;

    /* ---------- bottom rail ---------- */
    this.hearts = el('div.hud-hearts');
    this.xpFill = el('i');
    this.levelEl = el('div.hud-level', { text: 'Lv 1' });

    this.ultRing = el('svg.hud-ult__ring', { viewBox: '0 0 64 64' }, ...svgRing(64, 29, 5));
    this.ultProgress = this.ultRing.querySelector('.ring-fg');
    this.ultBtn = el('button.hud-ult', {
      'data-tap': '1', 'aria-label': 'Ultimate',
      onclick: () => { if (this.onUlt?.()) { haptic('heavy'); pulse(this.ultBtn, 'is-fire', 700); } },
    }, this.ultRing, el('span.hud-ult__icon', { text: '✦' }));

    this.bottom = el('div.hud-bottom', null,
      el('div.hud-vitals', null,
        this.hearts,
        el('div.hud-xp', null, el('div.hud-xp__bar', null, this.xpFill), this.levelEl),
      ),
      this.ultBtn,
    );

    r.append(this.top, this.comboEl, this.bossBar, this.bottom);
    this.root.hidden = true;
  }

  show() {
    this.root.hidden = false;
    this.visible = true;
    this.root.classList.add('is-in');
    setTimeout(() => this.root.classList.remove('is-in'), 700);
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.root.hidden = true;
    this.bossBar.hidden = true;
  }

  update(s) {
    if (!this.visible) this.show();

    // Score — the number people watch. Pops on every gain.
    const score = s.score | 0;
    if (score !== this._lastScore) {
      this.scoreEl.textContent = score.toLocaleString('nl-NL');
      if (score - this._lastScore > 200) pulse(this.scoreEl, 'is-pop', 380);
      this._lastScore = score;
    }

    this.timeEl.textContent = timeStr(s.time, false);

    if (s.wave !== this._lastWave) {
      this.waveEl.textContent = String(s.wave);
      pulse(this.waveEl, 'is-pop', 500);
      this._lastWave = s.wave;
    }

    // Hearts: rebuild only when the count changes.
    const hpKey = `${s.hp}/${s.maxHp}/${s.shield}`;
    if (hpKey !== this._hpKey) {
      this._hpKey = hpKey;
      clear(this.hearts);
      for (let i = 0; i < s.maxHp; i++) {
        this.hearts.appendChild(el('span.heart', {
          dataset: { on: i < s.hp ? '1' : '0' },
          style: { '--i': String(i) },
        }));
      }
      for (let i = 0; i < s.shield; i++) {
        this.hearts.appendChild(el('span.heart.heart--shield', { dataset: { on: '1' } }));
      }
      if (s.hp <= 1) this.hearts.classList.add('is-critical');
      else this.hearts.classList.remove('is-critical');
    }

    this.xpFill.style.transform = `scaleX(${clamp01(s.xp / s.xpNeed)})`;
    this.levelEl.textContent = `Lv ${s.level}`;

    // Combo.
    if (s.combo !== this._lastCombo) {
      this._lastCombo = s.combo;
      this.comboEl.dataset.on = s.combo >= 5 ? '1' : '0';
      this.comboNum.textContent = String(s.combo);
      this.comboEl.style.setProperty('--heat', String(clamp01(s.combo / 60)));
      if (s.combo > 0 && s.combo % 10 === 0) pulse(this.comboEl, 'is-pop', 420);
    }

    // Ult ring.
    const u = clamp01(s.ult);
    setRing(this.ultProgress, u, 29);
    this.ultBtn.dataset.ready = u >= 1 ? '1' : '0';

    // Wave ring.
    setRing(this.waveProgress, clamp01(s.waveProgress ?? 0), 17);

    // Boss.
    if (s.boss) {
      if (this.bossBar.hidden) {
        this.bossBar.hidden = false;
        this.bossName.textContent = s.boss.name;
      }
      this.bossFill.style.transform = `scaleX(${clamp01(s.boss.hp)})`;
      this.bossFill.dataset.low = s.boss.hp < 0.3 ? '1' : '0';
    } else if (!this.bossBar.hidden) {
      this.bossBar.hidden = true;
    }
  }

  bossIntro(b) {
    const card = el('div.boss-intro', null,
      el('div.boss-intro__warn', { text: '⚠ WAARSCHUWING ⚠' }),
      el('div.boss-intro__name', { text: b.name }),
      el('div.boss-intro__sub', { text: b.subtitle ?? '' }),
    );
    this.root.appendChild(card);
    setTimeout(() => { card.dataset.out = '1'; }, 2000);
    setTimeout(() => card.remove(), 2700);
  }
}

/* ------------------------------------------------------------------
   SVG progress rings — one path, stroke-dashoffset animated.
   ------------------------------------------------------------------ */

function svgRing(size = 40, r = 17, w = 3) {
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const mk = (cls, extra) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    n.setAttribute('cx', c); n.setAttribute('cy', c); n.setAttribute('r', r);
    n.setAttribute('fill', 'none');
    n.setAttribute('stroke-width', w);
    n.setAttribute('class', cls);
    n.setAttribute('stroke-linecap', 'round');
    if (extra) {
      n.setAttribute('stroke-dasharray', circ);
      n.setAttribute('stroke-dashoffset', circ);
      n.setAttribute('transform', `rotate(-90 ${c} ${c})`);
    }
    return n;
  };
  return [mk('ring-bg'), mk('ring-fg', true)];
}

function setRing(node, frac, r) {
  if (!node) return;
  const circ = 2 * Math.PI * r;
  node.setAttribute('stroke-dashoffset', String(circ * (1 - frac)));
}
