/**
 * Environment.js — the world you are falling through.
 *
 * A starfield alone reads as "black screen with dots". This adds the things
 * that make a vertical shooter feel like it's set *somewhere*: a planet turning
 * below the horizon, debris tumbling past, wreckage drifting through, dust
 * streaking by in the foreground.
 *
 * It also gives depth a *shape*. Every five waves the biome changes — new
 * palette, new silhouettes, new haze. That's what makes a wave-14 clip look
 * different from a wave-2 clip, which is the difference between "another run"
 * and "look how far I got".
 *
 * Everything here is decorative and drawn from the cosmetic RNG, so it never
 * affects a seeded run's outcome.
 */

import { TAU, clamp01, lerp } from '../core/Math2.js';
import { hexA, mixHex } from '../core/Renderer.js';
import { cosmeticRNG as R } from '../core/RNG.js';

/* ============================================================
   BIOMES — one per five waves, then they cycle with a shift
   ============================================================ */

export const BIOMES = [
  {
    id: 'cradle', name: 'De Wieg',
    haze: '#1e1b4b', accent: '#38bdf8', rim: '#93c5fd',
    planet: { hue: 210, ring: false },
    debris: 'rock',
  },
  {
    id: 'foundry', name: 'De Smidse',
    haze: '#450a0a', accent: '#fb923c', rim: '#fed7aa',
    planet: { hue: 20, ring: false },
    debris: 'wreck',
  },
  {
    id: 'garden', name: 'De Tuin',
    haze: '#052e16', accent: '#34d399', rim: '#a7f3d0',
    planet: { hue: 150, ring: true },
    debris: 'spore',
  },
  {
    id: 'veil', name: 'De Sluier',
    haze: '#3b0764', accent: '#c084fc', rim: '#e9d5ff',
    planet: { hue: 285, ring: true },
    debris: 'shard',
  },
  {
    id: 'ember', name: 'De Assen',
    haze: '#431407', accent: '#f43f5e', rim: '#fecdd3',
    planet: { hue: 350, ring: false },
    debris: 'rock',
  },
];

export const biomeForWave = (wave) => BIOMES[Math.floor(Math.max(0, wave - 1) / 5) % BIOMES.length];

/* ============================================================
   ENVIRONMENT
   ============================================================ */

export class Environment {
  constructor(view) {
    this.view = view;
    this.t = 0;
    this.speed = 1;

    this.biome = BIOMES[0];
    this.nextBiome = null;
    this.blend = 1;          // 1 = fully on `biome`

    /** Big background body, mostly off-screen. */
    this.planet = {
      x: view.w * 0.78, y: -view.h * 0.34,
      r: view.w * 0.72, spin: 0,
    };

    /** Mid-ground silhouettes: slow, large, dark. */
    this.debris = [];
    for (let i = 0; i < 7; i++) this.debris.push(this._makeDebris(true));

    /** Foreground streaks: fast, small, bright — sells speed. */
    this.dust = new Float32Array(60 * 4);
    for (let i = 0; i < 60; i++) {
      this.dust[i * 4 + 0] = R.range(0, view.w);
      this.dust[i * 4 + 1] = R.range(0, view.h);
      this.dust[i * 4 + 2] = R.range(90, 260);   // speed
      this.dust[i * 4 + 3] = R.range(0.4, 1.6);  // width
    }

    this._shapeCache = new Map();
  }

  _makeDebris(spread = false) {
    const view = this.view;
    const scale = R.range(0.35, 1.5);
    return {
      x: R.range(-40, view.w + 40),
      y: spread ? R.range(-view.h * 0.2, view.h) : R.range(-260, -60),
      r: 26 * scale,
      rot: R.float() * TAU,
      vrot: R.range(-0.28, 0.28),
      speed: 16 + scale * 34,
      seed: Math.floor(R.float() * 1e6),
      depth: clamp01((scale - 0.35) / 1.15),   // 0 = far, 1 = near
    };
  }

  /** Called when the wave changes; cross-fades to the new biome. */
  setWave(wave) {
    const want = biomeForWave(wave);
    if (want === this.biome && !this.nextBiome) return;
    if (want === this.biome) { this.nextBiome = null; this.blend = 1; return; }
    this.nextBiome = want;
    this.blend = 0;
  }

  update(dt) {
    this.t += dt;
    const view = this.view;

    if (this.nextBiome) {
      this.blend = Math.min(1, this.blend + dt * 0.35);
      if (this.blend >= 1) { this.biome = this.nextBiome; this.nextBiome = null; }
    }

    this.planet.spin += dt * 0.012;
    this.planet.y += dt * 3 * this.speed;
    if (this.planet.y > view.h * 0.4) this.planet.y = -view.h * 0.5;

    for (const d of this.debris) {
      d.y += d.speed * this.speed * dt;
      d.rot += d.vrot * dt;
      if (d.y - d.r > view.h + 60) Object.assign(d, this._makeDebris(false));
    }

    const du = this.dust;
    for (let i = 0; i < 60; i++) {
      du[i * 4 + 1] += du[i * 4 + 2] * this.speed * dt;
      if (du[i * 4 + 1] > view.h + 20) {
        du[i * 4 + 1] = -20;
        du[i * 4 + 0] = R.range(0, view.w);
      }
    }
  }

  /** Colour of the current biome, blended if a transition is running. */
  _col(key) {
    const a = this.biome[key];
    if (!this.nextBiome) return a;
    return mixHex(a, this.nextBiome[key], this.blend);
  }

  /* ---------------------------------------------------------- draw */

  /** Behind everything: haze wash + planet + mid-ground debris. */
  drawBack(r) {
    const ctx = r.ctx;
    const view = this.view;
    const haze = this._col('haze');
    const accent = this._col('accent');

    // Haze: a soft vertical wash that tints the whole scene toward the biome.
    ctx.save();
    const g = r.vGrad(0, 0, view.h, hexA(haze, 0.85), hexA(haze, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();

    this._drawPlanet(r, accent);

    // Mid-ground debris — silhouettes with a rim light from the planet side.
    for (const d of this.debris) {
      if (d.depth > 0.72) continue;   // near pieces draw in front
      this._drawDebris(r, d);
    }
  }

  /** In front of gameplay: near debris + dust streaks. Kept subtle. */
  drawFront(r) {
    const ctx = r.ctx;
    const view = this.view;

    for (const d of this.debris) {
      if (d.depth <= 0.72) continue;
      this._drawDebris(r, d, 0.55);
    }

    // Dust: thin vertical streaks. The single cheapest cue for "falling fast".
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(this._col('rim'), 0.24);
    const du = this.dust;
    for (let i = 0; i < 60; i++) {
      const x = du[i * 4 + 0], y = du[i * 4 + 1];
      const len = du[i * 4 + 2] * 0.07 * this.speed;
      ctx.lineWidth = du[i * 4 + 3];
      ctx.beginPath();
      ctx.moveTo(x, y - len);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPlanet(r, accent) {
    const ctx = r.ctx;
    const p = this.planet;
    const hue = this.biome.planet.hue;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Atmosphere halo.
    const atm = ctx.createRadialGradient(0, 0, p.r * 0.86, 0, 0, p.r * 1.18);
    atm.addColorStop(0, hexA(accent, 0.22));
    atm.addColorStop(1, hexA(accent, 0));
    ctx.fillStyle = atm;
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 1.18, 0, TAU);
    ctx.fill();

    // Body, lit from the lower-left so it reads as a sphere against the void.
    const body = ctx.createRadialGradient(-p.r * 0.4, p.r * 0.45, p.r * 0.05, 0, 0, p.r);
    body.addColorStop(0, `hsl(${hue} 55% 26%)`);
    body.addColorStop(0.55, `hsl(${hue} 50% 13%)`);
    body.addColorStop(1, `hsl(${hue} 45% 5%)`);
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, TAU);
    ctx.fillStyle = body;
    ctx.fill();

    // Banding.
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 5; i++) {
      const yy = -p.r + (i / 5) * p.r * 2 + Math.sin(this.t * 0.1 + i) * 6;
      ctx.fillStyle = i % 2 ? `hsl(${hue} 60% 40%)` : `hsl(${hue} 40% 8%)`;
      ctx.fillRect(-p.r, yy, p.r * 2, p.r * 0.22);
    }
    ctx.restore();

    // Terminator rim.
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 0.995, Math.PI * 0.15, Math.PI * 0.95);
    ctx.strokeStyle = hexA(this._col('rim'), 0.4);
    ctx.lineWidth = Math.max(1, p.r * 0.012);
    ctx.stroke();

    if (this.biome.planet.ring) {
      ctx.save();
      ctx.rotate(-0.42);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 1.55, p.r * 0.3, 0, 0, TAU);
      ctx.strokeStyle = hexA(this._col('rim'), 0.18);
      ctx.lineWidth = p.r * 0.09;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 1.34, p.r * 0.26, 0, 0, TAU);
      ctx.strokeStyle = hexA(this._col('accent'), 0.13);
      ctx.lineWidth = p.r * 0.05;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  _drawDebris(r, d, alphaMul = 1) {
    const ctx = r.ctx;
    const pts = this._shape(d.seed, this.biome.debris);
    const alpha = (0.3 + d.depth * 0.45) * alphaMul;

    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] * d.r, y = pts[i + 1] * d.r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Shaded fill, not a flat silhouette. A flat dark shape with a bright
    // outline reads as a wireframe; a gradient across the shape plus a *faint*
    // rim reads as a rock lit from one side, which is what we want.
    const haze = this._col('haze');
    const g = ctx.createLinearGradient(-d.r, -d.r, d.r, d.r);
    g.addColorStop(0, mixHex(haze, '#94a3b8', 0.26));
    g.addColorStop(0.55, mixHex('#05060f', haze, 0.75));
    g.addColorStop(1, '#04050d');
    ctx.fillStyle = g;
    ctx.fill();

    // Rim light along the lit edge only — just enough to lift it off the void.
    ctx.strokeStyle = hexA(this._col('rim'), 0.16 + d.depth * 0.14);
    ctx.lineWidth = 1 + d.depth;
    ctx.stroke();

    if (this.biome.debris === 'spore') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(0, 0, d.r * 0.3, 0, TAU);
      ctx.fillStyle = hexA(this._col('accent'), 0.3);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Deterministic silhouette per seed, cached as a flat point array. */
  _shape(seed, kind) {
    const key = seed + kind;
    let pts = this._shapeCache.get(key);
    if (pts) return pts;

    // Small LCG so a given seed always yields the same rock.
    let st = seed || 1;
    const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);

    const n = kind === 'shard' ? 5 : kind === 'wreck' ? 9 : 8;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      let rr = kind === 'shard'
        ? (i % 2 ? 0.45 : 1)
        : kind === 'wreck'
          ? (i % 3 === 0 ? 1.15 : 0.6)
          : lerp(0.66, 1, rnd());
      rr *= 0.9 + rnd() * 0.2;
      out.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    pts = Float32Array.from(out);
    if (this._shapeCache.size > 64) this._shapeCache.clear();
    this._shapeCache.set(key, pts);
    return pts;
  }

  resize(view) {
    this.view = view;
    this.planet.x = view.w * 0.78;
    this.planet.r = view.w * 0.72;
  }
}
