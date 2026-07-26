/**
 * MenuScene.js — the living backdrop behind every menu.
 *
 * A static menu background makes a game feel like a website. This one keeps the
 * same starfield, nebulae and drifting motes as the run, so moving between menu
 * and gameplay feels like moving through one continuous place rather than
 * switching apps.
 */

import { Scene } from '../core/Game.js';
import { Starfield, ScreenFX } from '../fx/Screen.js';
import { Particles } from '../fx/Particles.js';
import { cosmeticRNG as R } from '../core/RNG.js';
import { hexA } from '../core/Renderer.js';
import { TAU } from '../core/Math2.js';
import { Music } from '../core/Audio.js';

export class MenuScene extends Scene {
  constructor(game) {
    super(game);
    this.clearColor = '#05060f';
    this.fx = new Particles(320);
    this.t = 0;
    /** Accent colour the backdrop tints toward — screens set this. */
    this.accent = '#22d3ee';
    this.accent2 = '#a855f7';
    this.intensity = 0;    // 0 = calm menu, 1 = gacha build-up
  }

  enter(params = {}) {
    const view = this.game.renderer.view;
    this.stars = new Starfield(view, { layers: 3, count: 130 });
    this.screen = new ScreenFX(this.game.renderer);
    this.t = 0;
    this.orbs = Array.from({ length: 7 }, (_, i) => ({
      x: R.range(0, view.w),
      y: R.range(0, view.h),
      r: R.range(60, 190),
      sp: R.range(6, 20),
      a: R.float() * TAU,
      hue: [190, 265, 300, 40][i % 4],
    }));
    if (params.music !== false) Music.start(params.track ?? 'menu');
  }

  exit() { this.screen?.reset(); }

  update(dt) {
    this.t += dt;
    this.stars.update(dt * (0.35 + this.intensity * 1.6));
    this.stars.warp = this.intensity * 0.35;
    this.fx.update(dt);

    // Ambient motes rising — cheap, and it makes the void feel inhabited.
    if (Math.random() < 0.35 + this.intensity) {
      const view = this.game.renderer.view;
      this.fx.emit({
        x: R.range(0, view.w), y: view.h + 10,
        vy: -R.range(18, 60), vx: R.range(-12, 12),
        life: R.range(3, 7), size: R.range(1.2, 3),
        color: R.chance(0.5) ? this.accent : this.accent2,
        shape: 1, glow: 2, alpha: 0.7, weight: 0.2,
      });
    }

    for (const o of this.orbs) {
      o.a += dt * 0.08;
      o.x += Math.cos(o.a) * o.sp * dt;
      o.y += Math.sin(o.a * 0.7) * o.sp * dt;
    }
  }

  realUpdate(dt) { this.screen.update(dt); }

  draw(r) {
    const ctx = r.ctx;
    const view = r.view;

    // Soft colour wash tinted to the current screen's accent.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const o of this.orbs) {
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, `hsl(${o.hue} 85% 58% / ${0.07 + this.intensity * 0.06})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
    }
    ctx.restore();

    this.stars.draw(r);

    // Horizon glow at the bottom — grounds the composition.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createLinearGradient(0, view.h, 0, view.h * 0.62);
    hg.addColorStop(0, hexA(this.accent, 0.16 + this.intensity * 0.1));
    hg.addColorStop(1, 'transparent');
    ctx.fillStyle = hg;
    ctx.fillRect(0, view.h * 0.62, view.w, view.h * 0.38);
    ctx.restore();

    this.fx.draw(r);
  }

  /** Screens call this so the backdrop matches the content. */
  setAccent(a, b = a) { this.accent = a; this.accent2 = b; }
  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  resize(r) { this.stars.resize(r.view); }
}
