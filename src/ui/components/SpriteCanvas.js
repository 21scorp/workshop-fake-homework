/**
 * SpriteCanvas.js — renders a registered sprite key into a DOM <canvas>.
 *
 * The collection grid, the summon reveal and the results card all show the same
 * artwork the run does, from the same registry. When the art becomes a real
 * sprite atlas, every one of those surfaces updates at once — that's the whole
 * point of routing through `Assets`.
 *
 * Instances register themselves with a single shared ticker so a screen with
 * 24 animated portraits still costs one rAF.
 */

import Assets from '../../core/AssetRegistry.js';
import { el } from '../dom.js';

/** How much bigger than its nominal box a sprite's glow can reach. */
const GLOW_ALLOWANCE = 1.85;

const live = new Set();
let raf = 0;
let last = 0;

function tick(now) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  for (const s of live) s.render(dt);
  if (!live.size) { cancelAnimationFrame(raf); raf = 0; }
}

export class SpriteCanvas {
  /**
   * @param {string} key sprite key
   * @param {object} opts { size, scale, tint, tint2, charge, speed, dpr, className }
   */
  constructor(key, opts = {}) {
    this.key = key;
    this.opts = opts;
    this.size = opts.size ?? 96;
    this.t = opts.t ?? Math.random() * 4;
    this.speed = opts.speed ?? 1;
    this.charge = opts.charge ?? 0;
    this.paused = false;

    const dpr = Math.min(window.devicePixelRatio || 1, opts.dpr ?? 2);
    this.canvas = el('canvas' + (opts.className ? '.' + opts.className : ''), {
      width: Math.round(this.size * dpr),
      height: Math.round(this.size * dpr),
      style: { width: this.size + 'px', height: this.size + 'px' },
      'aria-hidden': 'true',
    });
    this.ctx = this.canvas.getContext('2d');
    this.dpr = dpr;

    this._io = null;
    this._wasConnected = false;
    this.mount();
  }

  mount() {
    live.add(this);
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    // Pause offscreen instances — a long collection list shouldn't burn battery.
    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver((entries) => {
        for (const e of entries) this.paused = !e.isIntersecting;
      }, { rootMargin: '80px' });
      this._io.observe(this.canvas);
    }
    // Draw one frame immediately so the sprite is never a blank box, even
    // before the node has been appended to the document.
    this.render(0);
  }

  destroy() {
    live.delete(this);
    this._io?.disconnect();
  }

  setKey(key) { this.key = key; this.render(0); }
  setTint(a, b) { this.opts.tint = a; if (b) this.opts.tint2 = b; }

  render(dt) {
    if (this.paused) return;
    // Self-collect once the node leaves the document — but only after it has
    // actually been in it. A freshly-constructed canvas isn't connected yet.
    if (this.canvas.isConnected) this._wasConnected = true;
    else if (this._wasConnected) { this.destroy(); return; }

    this.t += dt * this.speed;
    const ctx = this.ctx;
    const s = this.size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const def = Assets.meta(this.key);
    const nominal = Math.max(def?.w ?? 64, def?.h ?? 64);
    // Sprites bloom well past their nominal box — the prism form's halo reaches
    // ~1.8× its declared size. Fitting to the nominal box alone clips that glow
    // against the canvas edge and leaves a visible rectangle, so reserve for it.
    const fit = (s * (this.opts.scale ?? 1)) / (nominal * GLOW_ALLOWANCE);

    Assets.draw(ctx, this.key, s / 2, s / 2, {
      t: this.t,
      scale: fit,
      tint: this.opts.tint ?? '#22d3ee',
      tint2: this.opts.tint2 ?? '#ffffff',
      charge: this.charge,
      data: this.opts.data,
    });
  }
}

/** Convenience: `spriteEl('astra/orb/idle', { size: 90, tint })` → canvas node. */
export function spriteEl(key, opts = {}) {
  return new SpriteCanvas(key, opts).canvas;
}
