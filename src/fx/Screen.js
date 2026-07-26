/**
 * Screen.js — full-screen feedback: shake, flash, chroma, vignette, zoom.
 *
 * Camera shake is trauma-based (Squirrel Eiserloh's model): events add *trauma*,
 * trauma decays, and the actual offset is trauma² sampled from smooth noise.
 * That gives you a shake that's violent at the peak and settles gracefully,
 * instead of the jittery random-offset shake that reads as cheap.
 */

import { bus, EV } from '../core/Events.js';
import { clamp, clamp01 } from '../core/Math2.js';
import { save } from '../core/Save.js';

export class ScreenFX {
  /** @param {import('../core/Renderer.js').Renderer} r */
  constructor(r, dom = {}) {
    this.r = r;
    this.flashEl = dom.flash ?? document.getElementById('fxFlash');
    this.vignetteEl = dom.vignette ?? document.getElementById('fxVignette');

    this.trauma = 0;
    this.traumaDecay = 1.6;
    this.maxOffset = 26;
    this.maxRot = 0.035;

    this.zoom = 1;
    this.zoomTarget = 1;

    this.flash = 0;
    this.flashColor = '#ffffff';
    this._flashApplied = -1;

    this.danger = 0;
    this._dangerApplied = -1;

    this.t = 0;

    // Directional kick — separate from trauma, used for recoil.
    this.kickX = 0;
    this.kickY = 0;

    bus.on(EV.SHAKE, (p) => {
      if (typeof p === 'number') this.shake(p);
      else this.shake(p?.amount ?? 0.3, p?.dirX, p?.dirY);
    });
    bus.on(EV.FLASH, (p) => {
      if (typeof p === 'number') this.doFlash(p);
      else this.doFlash(p?.amount ?? 0.4, p?.color);
    });
  }

  /** Add trauma. 0.2 = tap, 0.5 = solid hit, 1.0 = boss dies. */
  shake(amount = 0.3, dirX = 0, dirY = 0) {
    if (save.profile.settings.reducedFlash) amount *= 0.4;
    this.trauma = clamp01(this.trauma + amount);
    if (dirX || dirY) {
      const n = Math.hypot(dirX, dirY) || 1;
      this.kickX += (dirX / n) * amount * 22;
      this.kickY += (dirY / n) * amount * 22;
    }
  }

  doFlash(amount = 0.4, color = '#ffffff') {
    if (save.profile.settings.reducedFlash) amount *= 0.35;
    this.flash = Math.max(this.flash, clamp01(amount));
    this.flashColor = color;
  }

  /** Punch-in / punch-out. */
  punch(zoom = 1.06, snapBack = true) {
    this.zoom = zoom;
    if (snapBack) this.zoomTarget = 1;
  }

  setZoom(z) { this.zoomTarget = z; }

  /** 0..1 — red edge glow when the player is low. */
  setDanger(v) { this.danger = clamp01(v); }

  /** Real-time update: screen FX must keep moving during hitstop. */
  update(dt) {
    this.t += dt;

    // --- trauma decay + offset
    this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const t = this.t * 34;
      this.r.camX = noise1(t) * this.maxOffset * s;
      this.r.camY = noise1(t + 91.7) * this.maxOffset * s;
      this.r.camRot = noise1(t + 313.3) * this.maxRot * s;
    } else {
      this.r.camX = 0; this.r.camY = 0; this.r.camRot = 0;
    }

    // --- directional kick decays fast and adds on top
    if (Math.abs(this.kickX) > 0.05 || Math.abs(this.kickY) > 0.05) {
      const k = Math.exp(-12 * dt);
      this.kickX *= k; this.kickY *= k;
      this.r.camX += this.kickX;
      this.r.camY += this.kickY;
    } else { this.kickX = 0; this.kickY = 0; }

    // --- zoom spring
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-9 * dt));
    this.r.camZoom = this.zoom;

    // --- flash: DOM element, so it composites over the canvas for free
    if (this.flash > 0.001) {
      this.flash = Math.max(0, this.flash - dt * 4.4);
      this._applyFlash(this.flash);
    } else if (this._flashApplied !== 0) {
      this._applyFlash(0);
    }

    // --- danger vignette
    if (Math.abs(this.danger - this._dangerApplied) > 0.02) {
      this._dangerApplied = this.danger;
      if (this.vignetteEl) {
        this.vignetteEl.dataset.danger = this.danger > 0.5 ? '1' : '0';
        this.vignetteEl.style.opacity = String(0.85 + this.danger * 0.15);
      }
    }
  }

  _applyFlash(v) {
    this._flashApplied = v;
    if (!this.flashEl) return;
    this.flashEl.style.opacity = String(v);
    if (v > 0) this.flashEl.style.background = this.flashColor;
  }

  reset() {
    this.trauma = 0;
    this.flash = 0;
    this.danger = 0;
    this.kickX = this.kickY = 0;
    this.zoom = this.zoomTarget = 1;
    this.r.camX = this.r.camY = this.r.camRot = 0;
    this.r.camZoom = 1;
    this._applyFlash(0);
    if (this.vignetteEl) { this.vignetteEl.dataset.danger = '0'; this.vignetteEl.style.opacity = '0.85'; }
  }
}

/* Smooth-ish 1D value noise in [-1, 1]. Cheap, deterministic, no allocation. */
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerpN(hash1(i), hash1(i + 1), u) * 2 - 1;
}
function hash1(n) {
  n = (n << 13) ^ n;
  return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
}
const lerpN = (a, b, t) => a + (b - a) * t;

/**
 * Starfield backdrop — three parallax layers plus a slow nebula wash.
 * It is the single cheapest thing that makes the game feel like it has depth.
 */
export class Starfield {
  constructor(view, { layers = 3, count = 150 } = {}) {
    this.view = view;
    this.layers = [];
    this.scrollSpeed = 1;
    this.warp = 0;         // 0..1 — stretches stars into streaks
    this.hue = 210;
    for (let l = 0; l < layers; l++) {
      const n = Math.round(count / (l + 1.4));
      const stars = new Float32Array(n * 4); // x, y, size, twinkle phase
      for (let i = 0; i < n; i++) {
        stars[i * 4 + 0] = Math.random() * view.w;
        stars[i * 4 + 1] = Math.random() * view.h;
        stars[i * 4 + 2] = (0.6 + Math.random() * 1.5) * (1 + l * 0.55);
        stars[i * 4 + 3] = Math.random() * 6.28;
      }
      this.layers.push({ stars, n, speed: 14 + l * 34, alpha: 0.32 + l * 0.24 });
    }
    this.t = 0;
    this._nebulae = Array.from({ length: 3 }, (_, i) => ({
      x: Math.random() * view.w,
      y: Math.random() * view.h,
      r: 200 + Math.random() * 260,
      hue: [210, 275, 195][i],
      drift: 6 + Math.random() * 10,
      phase: Math.random() * 6.28,
    }));
  }

  resize(view) {
    this.view = view;
    for (const L of this.layers) {
      for (let i = 0; i < L.n; i++) {
        if (L.stars[i * 4 + 0] > view.w) L.stars[i * 4 + 0] = Math.random() * view.w;
        if (L.stars[i * 4 + 1] > view.h) L.stars[i * 4 + 1] = Math.random() * view.h;
      }
    }
  }

  update(dt) {
    this.t += dt;
    const h = this.view.h;
    const boost = 1 + this.warp * 7;
    for (const L of this.layers) {
      const v = L.speed * this.scrollSpeed * boost * dt;
      for (let i = 0; i < L.n; i++) {
        const yi = i * 4 + 1;
        L.stars[yi] += v;
        if (L.stars[yi] > h + 8) {
          L.stars[yi] -= h + 16;
          L.stars[i * 4 + 0] = Math.random() * this.view.w;
        }
      }
    }
  }

  /**
   * The nebulae are three screen-sized radial gradients. Re-rasterising them
   * every frame was, by a wide margin, the most expensive thing in the render
   * loop — several million shaded pixels per frame for a backdrop that barely
   * changes. So they get baked once into a quarter-resolution offscreen canvas
   * and blitted; the drift is a sub-pixel translate on the blit, which costs
   * nothing and is indistinguishable at this blur level.
   */
  _bakeNebulae() {
    const { w, h } = this.view;
    const scale = 0.25;
    const cw = Math.max(2, Math.ceil(w * scale));
    const ch = Math.max(2, Math.ceil(h * scale));

    if (!this._neb) this._neb = document.createElement('canvas');
    this._neb.width = cw;
    this._neb.height = ch;
    const c = this._neb.getContext('2d');
    c.clearRect(0, 0, cw, ch);
    c.globalCompositeOperation = 'lighter';
    for (const nb of this._nebulae) {
      const x = nb.x * scale, y = nb.y * scale, rr = nb.r * scale;
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, `hsl(${nb.hue} 80% 55% / 0.10)`);
      g.addColorStop(0.55, `hsl(${nb.hue} 80% 45% / 0.045)`);
      g.addColorStop(1, 'transparent');
      c.fillStyle = g;
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    this._nebKey = `${w}x${h}`;
  }

  /** @param {import('../core/Renderer.js').Renderer} r */
  draw(r) {
    const ctx = r.ctx;
    const { w, h } = this.view;

    if (this._nebKey !== `${w}x${h}`) this._bakeNebulae();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const dx = Math.cos(this.t * 0.05) * 14;
    const dy = Math.sin(this.t * 0.07) * 14;
    ctx.drawImage(this._neb, dx - 20, dy - 20, w + 40, h + 40);

    // Stars.
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li];
      const streak = this.warp * (12 + li * 26);
      for (let i = 0; i < L.n; i++) {
        const x = L.stars[i * 4 + 0];
        const y = L.stars[i * 4 + 1];
        const s = L.stars[i * 4 + 2];
        const ph = L.stars[i * 4 + 3];
        const tw = 0.65 + 0.35 * Math.sin(this.t * 2.4 + ph);
        ctx.globalAlpha = L.alpha * tw;
        ctx.fillStyle = li === 2 ? '#dbeafe' : '#93c5fd';
        if (streak > 1) {
          ctx.fillRect(x - s / 2, y - streak, s, streak * 2);
        } else {
          ctx.fillRect(x, y, s, s);
        }
      }
    }
    ctx.restore();
  }
}
