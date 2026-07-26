/**
 * PullReveal.js — the summon cinematic.
 *
 * This is the sequence people record and post. It is built around one idea:
 * **withhold, then confirm.** The colour of the incoming beam tells you the
 * rarity a beat before the Astra resolves, which is the entire reason a gacha
 * pull is watchable at all.
 *
 * Sequence:
 *   1. warp     — the void accelerates, everything else fades out
 *   2. charge   — light converges to a point, audio riser
 *   3. burst    — flash, the beam's colour is revealed
 *   4. resolve  — the Astra scales in, name and rarity land
 *   5. repeat for each pull, then a summary grid
 *
 * Tap advances. Hold skips to the summary. Both are always available — nobody
 * should be trapped in an animation they've seen 200 times.
 */

import { el, onHold, sleep } from './dom.js';
import { SpriteCanvas } from './components/SpriteCanvas.js';
import { RARITY_INFO } from '../data/constants.js';
import { astraSprite } from '../data/astra.js';
import { Sfx, Music } from '../core/Audio.js';
import { haptic } from '../core/Input.js';
import { TAU, clamp01, lerp } from '../core/Math2.js';
import { hexA, hsl } from '../core/Renderer.js';
import { cosmeticRNG as R } from '../core/RNG.js';

export class PullReveal {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.node = null;
    this.raf = 0;
    this.sprites = [];
  }

  /**
   * @param {Array} results  from Gacha.pull()
   * @param {object} opts    { onDone, bannerAccent }
   */
  async play(results, opts = {}) {
    this.destroy();
    this.results = results;
    this.index = 0;
    this.skipAll = false;
    this.opts = opts;

    const best = results.reduce((m, r) => Math.max(m, r.tier), 0);

    /* ---- DOM shell ---- */
    this.canvas = el('canvas.reveal__fx');
    this.ctx = this.canvas.getContext('2d');

    this.stage = el('div.reveal__stage');
    this.nameEl = el('div.reveal__name');
    this.titleEl = el('div.reveal__title');
    this.rarityEl = el('div.reveal__rarity');
    this.badgeEl = el('div.reveal__badge');
    this.counterEl = el('div.reveal__counter');
    this.hintEl = el('div.reveal__hint', { text: 'tik om door te gaan' });

    this.skipBar = el('i');
    this.skipEl = el('button.reveal__skip', null,
      el('span', { text: 'HOUD VAST OM OVER TE SLAAN' }),
      el('div.reveal__skipbar', null, this.skipBar),
    );

    this.node = el('div.reveal', { dataset: { best: RARITY_INFO[best].key.toLowerCase() } },
      this.canvas,
      el('div.reveal__vig'),
      el('div.reveal__body', null,
        this.counterEl,
        this.stage,
        el('div.reveal__text', null, this.rarityEl, this.nameEl, this.titleEl, this.badgeEl),
      ),
      this.hintEl,
      this.skipEl,
    );

    this.root.appendChild(this.node);
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    onHold(this.skipEl, 650, () => this.skip(), (f) => {
      this.skipBar.style.transform = `scaleX(${f})`;
    });
    this.node.addEventListener('click', (e) => {
      if (e.target.closest('.reveal__skip')) return;
      this.advance();
    });

    this.particles = [];
    this.beams = [];
    this.phase = 'warp';
    this.phaseT = 0;
    this.warp = 0;
    this.flash = 0;
    this.accent = opts.bannerAccent ?? '#22d3ee';

    Music.start('gacha', { fade: 0.4 });
    this.loop();

    await this.runSequence();
  }

  /* ============================================================
     SEQUENCE
     ============================================================ */

  async runSequence() {
    await this.wait(0.35);

    for (this.index = 0; this.index < this.results.length; this.index++) {
      if (this.skipAll) break;
      await this.revealOne(this.results[this.index], this.index);
    }

    if (!this.skipAll) await this.wait(0.5);
    this.showSummary();
  }

  async revealOne(res, i) {
    const info = RARITY_INFO[res.tier];
    const astra = res.astra;
    this.currentTier = res.tier;
    this.accent = info.color;

    this.counterEl.textContent = `${i + 1} / ${this.results.length}`;
    this.node.dataset.tier = info.key.toLowerCase();

    /* --- charge --- */
    this.phase = 'charge';
    this.phaseT = 0;
    this.chargeDur = res.tier >= 3 ? 1.5 : res.tier >= 2 ? 0.9 : 0.45;
    this.stage.replaceChildren();
    this.nameEl.textContent = '';
    this.titleEl.textContent = '';
    this.rarityEl.textContent = '';
    this.badgeEl.replaceChildren();
    this.hintEl.dataset.on = '0';

    Sfx.play('pullCharge', { dur: this.chargeDur });
    if (res.tier >= 3) haptic('double');

    // A high-rarity pull earns a longer, brighter, louder wind-up.
    await this.wait(this.chargeDur, () => this.skipAll || this.advanceReq);
    this.advanceReq = false;

    /* --- burst --- */
    this.phase = 'burst';
    this.phaseT = 0;
    this.flash = res.tier >= 3 ? 1 : 0.55;
    this.spawnBurst(info, res.tier);
    Sfx.play('reveal', { rarity: res.tier });
    haptic(res.tier >= 4 ? 'legendary' : res.tier >= 3 ? 'success' : res.tier >= 2 ? 'medium' : 'light');

    await this.wait(0.18);

    /* --- resolve --- */
    this.phase = 'hold';
    const sprite = new SpriteCanvas(astraSprite(astra, 'idle'), {
      size: Math.min(380, this.w * 0.86),
      tint: astra.colors.primary,
      tint2: astra.colors.secondary,
      scale: 1,
      speed: 1,
    });
    this.sprites.push(sprite);
    const card = el('div.reveal__astra', { dataset: { tier: info.key.toLowerCase() } },
      el('div.reveal__halo'),
      sprite.canvas,
    );
    this.stage.replaceChildren(card);
    requestAnimationFrame(() => card.dataset.in = '1');

    this.rarityEl.textContent = info.name.toUpperCase();
    this.rarityEl.dataset.tier = info.key.toLowerCase();
    this.nameEl.textContent = astra.name;
    this.titleEl.textContent = astra.title;

    const badges = [];
    if (res.isNew) badges.push(el('span.rbadge.rbadge--new', { text: 'NIEUW' }));
    if (res.featured) badges.push(el('span.rbadge.rbadge--feat', { text: 'RATE-UP' }));
    if (res.isDupe) badges.push(el('span.rbadge', { text: `+${info.echoes} ◉ Echoes` }));
    if (res.pity === 'hard') badges.push(el('span.rbadge.rbadge--pity', { text: 'GEGARANDEERD' }));
    if (res.pity === 'soft') badges.push(el('span.rbadge.rbadge--pity', { text: 'SOFT PITY' }));
    this.badgeEl.replaceChildren(...badges);

    this.hintEl.dataset.on = '1';

    const holdTime = res.tier >= 3 ? 2.2 : res.tier >= 2 ? 1.3 : 0.75;
    await this.wait(holdTime, () => this.skipAll || this.advanceReq);
    this.advanceReq = false;
  }

  showSummary() {
    this.phase = 'summary';
    this.node.dataset.phase = 'summary';
    this.hintEl.dataset.on = '0';
    this.skipEl.dataset.off = '1';

    const grid = el('div.rsum__grid');
    for (const r of this.results) {
      const info = RARITY_INFO[r.tier];
      const s = new SpriteCanvas(astraSprite(r.astra, 'idle'), {
        size: 66, tint: r.astra.colors.primary, tint2: r.astra.colors.secondary, scale: 1,
      });
      this.sprites.push(s);
      grid.appendChild(el('div.rsum__cell', {
        dataset: { tier: info.key.toLowerCase(), new: r.isNew ? '1' : '0' },
        style: { '--c': info.color, '--glow': info.glow },
      },
        s.canvas,
        el('div.rsum__n', { text: r.astra.name }),
        r.isNew ? el('div.rsum__new', { text: 'NIEUW' }) : null,
      ));
    }

    const s = this.opts.summary ?? {};
    const stats = el('div.rsum__stats', null,
      s.newAstra?.length ? el('span', null, el('b', { text: String(s.newAstra.length) }), ' nieuw') : null,
      s.echoes ? el('span', null, el('b', { text: String(s.echoes) }), ' ◉ Echoes') : null,
      s.stardust ? el('span', null, el('b', { text: String(s.stardust) }), ' ✦ Stardust') : null,
    );

    const panel = el('div.rsum', null,
      el('h2.rsum__t', { text: 'RESULTAAT' }),
      grid,
      stats,
      el('div.rsum__actions', null,
        el('button.btn.btn--ghost.btn--md', {
          onclick: () => { Sfx.play('back'); this.close(); },
        }, el('span.btn__label', null, el('span.btn__main', { text: 'Klaar' }))),
        el('button.btn.btn--primary.btn--md', {
          onclick: () => { Sfx.play('confirm'); this.close(); this.opts.onAgain?.(); },
        }, el('span.btn__label', null, el('span.btn__main', { text: 'Nog een keer' }))),
      ),
    );

    this.node.querySelector('.reveal__body').replaceChildren(panel);
    requestAnimationFrame(() => panel.dataset.in = '1');
    Sfx.play('confirm');
  }

  /* ============================================================
     INPUT
     ============================================================ */

  advance() {
    if (this.phase === 'summary') return;
    this.advanceReq = true;
    Sfx.play('tap', { gate: 0.05 });
  }

  skip() {
    this.skipAll = true;
    this.advanceReq = true;
    haptic('light');
  }

  close() {
    const n = this.node;
    if (!n) return;
    n.dataset.out = '1';
    setTimeout(() => { this.destroy(); this.opts.onDone?.(); }, 320);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this._onResize);
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    this.node?.remove();
    this.node = null;
  }

  /** Await `seconds` of animation, aborting early if `abort()` goes true. */
  wait(seconds, abort) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = () => {
        if (!this.node) return resolve();
        if (abort?.()) return resolve();
        if (performance.now() - start >= seconds * 1000) return resolve();
        requestAnimationFrame(step);
      };
      step();
    });
  }

  /* ============================================================
     CANVAS FX
     ============================================================ */

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.dpr = dpr;
  }

  spawnBurst(info, tier) {
    const cx = this.w / 2, cy = this.h * 0.42;
    const n = 40 + tier * 45;
    for (let i = 0; i < n; i++) {
      const a = R.float() * TAU;
      const sp = R.range(180, 900) * (1 + tier * 0.32);
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: R.range(0.6, 1.8), max: 1.8,
        size: R.range(2, 7),
        color: tier >= 4 ? null : info.color,
        drag: 1.4, g: 260,
      });
    }
    // Light rays for high rarity — the "it's a good one" tell.
    if (tier >= 2) {
      const rays = tier >= 4 ? 24 : tier >= 3 ? 14 : 8;
      for (let i = 0; i < rays; i++) {
        this.beams.push({
          a: (i / rays) * TAU + R.range(-0.1, 0.1),
          len: R.range(0.5, 1.5),
          w: R.range(2, 10),
          life: R.range(0.7, 1.6), max: 1.6,
          color: tier >= 4 ? null : info.glow,
        });
      }
    }
  }

  loop() {
    let last = performance.now();
    const step = (now) => {
      if (!this.node) return;
      this.raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.draw();
    };
    this.raf = requestAnimationFrame(step);
  }

  update(dt) {
    this.phaseT += dt;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.warp = lerp(this.warp, this.phase === 'charge' ? 1 : this.phase === 'burst' ? 1.4 : 0.25, dt * 4);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }

    // Charge phase spawns inward-falling motes.
    if (this.phase === 'charge' && Math.random() < 0.9) {
      const cx = this.w / 2, cy = this.h * 0.42;
      const a = R.float() * TAU;
      const d = R.range(this.w * 0.4, this.w * 0.9);
      this.particles.push({
        x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d,
        vx: -Math.cos(a) * d * 1.6, vy: -Math.sin(a) * d * 1.6,
        life: 0.62, max: 0.62, size: R.range(2, 5),
        color: this.accent, drag: 0.1, g: 0, inward: true,
      });
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    const cx = w / 2, cy = h * 0.42;
    const t = performance.now() / 1000;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Warp tunnel.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lines = 46;
    for (let i = 0; i < lines; i++) {
      const a = (i / lines) * TAU + t * 0.12;
      const r0 = 90 + ((t * (240 + i * 9) + i * 60) % (Math.max(w, h) * 0.9));
      const len = 26 + this.warp * 130;
      ctx.globalAlpha = 0.05 + this.warp * 0.22;
      ctx.strokeStyle = i % 5 === 0 ? this.accent : '#93c5fd';
      ctx.lineWidth = 1 + this.warp * 1.6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      ctx.stroke();
    }
    ctx.restore();

    // Charge core.
    if (this.phase === 'charge') {
      const k = clamp01(this.phaseT / this.chargeDur);
      const rad = 8 + k * k * 120;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 3);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, hexA(this.accent, 0.85));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 3, 0, TAU);
      ctx.fill();
      // Contracting ring — a visible countdown to the reveal.
      ctx.strokeStyle = hexA('#ffffff', 0.6);
      ctx.lineWidth = 2 + k * 5;
      ctx.beginPath();
      ctx.arc(cx, cy, lerp(w * 0.55, rad * 1.2, k), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Rays.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.beams) {
      const k = b.life / b.max;
      const len = Math.max(w, h) * b.len * (1.2 - k * 0.4);
      const col = b.color ?? hsl((t * 220 + b.a * 57) % 360, 100, 68);
      const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(b.a) * len, cy + Math.sin(b.a) * len);
      g.addColorStop(0, hexA(col, 0.85 * k));
      g.addColorStop(1, 'transparent');
      ctx.strokeStyle = g;
      ctx.lineWidth = b.w * k;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(b.a) * len, cy + Math.sin(b.a) * len);
      ctx.stroke();
    }

    // Particles.
    for (const p of this.particles) {
      const k = clamp01(p.life / p.max);
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color ?? hsl((t * 200 + p.x) % 360, 100, 66);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.8), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Flash.
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}
