/**
 * Particles.js — one pooled system, many emitter presets.
 *
 * Particles are the difference between "a circle disappeared" and "I destroyed
 * something". Every one of them is additive-blended so overlapping hits bloom
 * into white — which is exactly what reads well on a phone screen and in a
 * re-encoded TikTok upload.
 */

import { Pool } from '../core/Pool.js';
import { hexA, hsl } from '../core/Renderer.js';
import { TAU, clamp01 } from '../core/Math2.js';
import { cosmeticRNG as R } from '../core/RNG.js';

/** Particle shapes. Each is a different visual grammar. */
export const SHAPE = {
  SPARK: 0,     // thin streak along its velocity — impacts
  DOT: 1,       // soft glowing circle — embers, dust
  RING: 2,      // expanding outline — shockwaves
  SHARD: 3,     // rotating triangle — debris
  PLUS: 4,      // 4-point star flare — crits, rare drops
  SMOKE: 5,     // large soft blob that fades — explosions
  BEAM: 6,      // vertical light shaft — gacha rays
  TEXT: 7,      // floating damage/score number
};

function blank() {
  return {
    _alive: false,
    x: 0, y: 0, vx: 0, vy: 0,
    ax: 0, ay: 0,
    drag: 0,
    life: 0, maxLife: 1,
    size: 4, size2: 0,
    rot: 0, vrot: 0,
    color: '#fff', color2: null,
    shape: SHAPE.DOT,
    alpha: 1,
    fade: 1,          // 1 = fade out over life, 0 = constant
    grow: 0,          // size delta per second
    glow: 0,          // extra additive halo radius multiplier
    hueShift: 0,      // >0 → cycles hue, for prism effects
    text: '',
    weight: 1,
    layer: 0,         // 0 = under entities, 1 = over
  };
}

function reset(p) {
  p.ax = 0; p.ay = 0; p.drag = 0;
  p.size2 = 0; p.rot = 0; p.vrot = 0;
  p.color2 = null; p.alpha = 1; p.fade = 1;
  p.grow = 0; p.glow = 0; p.hueShift = 0;
  p.text = ''; p.weight = 1; p.layer = 0;
}

export class Particles {
  constructor(capacity = 1400) {
    this.pool = new Pool(blank, reset, Math.min(capacity, 600));
    this.capacity = capacity;
    /** Scales every emitter's count. Auto-tuned by the perf watchdog. */
    this.density = 1;
  }

  get count() { return this.pool.count; }
  clear() { this.pool.clear(); }

  /** Low-level spawn. Returns the particle so emitters can tweak it. */
  emit(o) {
    if (this.pool.count >= this.capacity) {
      // Budget exhausted: sacrifice the oldest low-weight particle.
      const a = this.pool.active;
      let worst = -1, worstW = Infinity;
      for (let i = 0; i < a.length; i += 7) {   // sample, don't scan
        if (a[i].weight < worstW) { worstW = a[i].weight; worst = i; }
      }
      if (worst >= 0 && worstW < (o.weight ?? 1)) a[worst]._alive = false;
      else return null;
    }
    const p = this.pool.spawn();
    p.x = o.x ?? 0; p.y = o.y ?? 0;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0;
    p.ax = o.ax ?? 0; p.ay = o.ay ?? 0;
    p.drag = o.drag ?? 0;
    p.life = p.maxLife = o.life ?? 0.5;
    p.size = o.size ?? 4;
    p.size2 = o.size2 ?? 0;
    p.rot = o.rot ?? 0; p.vrot = o.vrot ?? 0;
    p.color = o.color ?? '#fff';
    p.color2 = o.color2 ?? null;
    p.shape = o.shape ?? SHAPE.DOT;
    p.alpha = o.alpha ?? 1;
    p.fade = o.fade ?? 1;
    p.grow = o.grow ?? 0;
    p.glow = o.glow ?? 0;
    p.hueShift = o.hueShift ?? 0;
    p.text = o.text ?? '';
    p.weight = o.weight ?? 1;
    p.layer = o.layer ?? 0;
    return p;
  }

  update(dt) {
    const a = this.pool.active;
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      if (!p._alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p._alive = false; continue; }
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.grow) p.size = Math.max(0, p.size + p.grow * dt);
    }
    this.pool.sweep();
  }

  /** @param {import('../core/Renderer.js').Renderer} r */
  draw(r, layer = -1) {
    const ctx = r.ctx;
    const a = this.pool.active;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      if (!p._alive) continue;
      if (layer >= 0 && p.layer !== layer) continue;

      const t = clamp01(p.life / p.maxLife);
      const alpha = p.alpha * (p.fade ? t : 1);
      if (alpha <= 0.004) continue;

      let color = p.color;
      if (p.hueShift) color = hsl((p.rot * 57 + (1 - t) * p.hueShift * 360) % 360, 95, 62);
      else if (p.color2) color = t > 0.5 ? p.color : p.color2;

      ctx.globalAlpha = alpha;

      switch (p.shape) {
        case SHAPE.SPARK: {
          const len = Math.min(46, Math.hypot(p.vx, p.vy) * 0.035 + p.size);
          const ang = Math.atan2(p.vy, p.vx);
          const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
          ctx.beginPath();
          ctx.moveTo(p.x - dx, p.y - dy);
          ctx.lineTo(p.x, p.y);
          ctx.lineWidth = p.size * (0.35 + t * 0.75);
          ctx.lineCap = 'round';
          ctx.strokeStyle = color;
          ctx.stroke();
          break;
        }
        case SHAPE.RING: {
          const rad = p.size + (1 - t) * (p.size2 || p.size * 3);
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, rad), 0, TAU);
          ctx.lineWidth = Math.max(0.6, 4 * t);
          ctx.strokeStyle = color;
          ctx.stroke();
          break;
        }
        case SHAPE.SHARD: {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.72, p.size * 0.62);
          ctx.lineTo(-p.size * 0.72, p.size * 0.62);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          ctx.restore();
          break;
        }
        case SHAPE.PLUS: {
          const s = p.size * (0.6 + t * 0.9);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(0, -s); ctx.lineTo(s * 0.24, -s * 0.24);
          ctx.lineTo(s, 0);  ctx.lineTo(s * 0.24, s * 0.24);
          ctx.lineTo(0, s);  ctx.lineTo(-s * 0.24, s * 0.24);
          ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.24, -s * 0.24);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case SHAPE.SMOKE: {
          const rad = p.size * (1.6 - t * 0.6);
          r.glow(p.x, p.y, rad, color, alpha * 0.55);
          ctx.globalAlpha = alpha;
          break;
        }
        case SHAPE.BEAM: {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const g = ctx.createLinearGradient(0, -p.size2, 0, p.size2);
          g.addColorStop(0, hexA(color, 0));
          g.addColorStop(0.5, color);
          g.addColorStop(1, hexA(color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(-p.size / 2, -p.size2, p.size, p.size2 * 2);
          ctx.restore();
          break;
        }
        case SHAPE.TEXT: {
          ctx.globalCompositeOperation = 'source-over';
          const rise = (1 - t) * 44;
          ctx.font = `900 ${p.size}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 5;
          ctx.strokeStyle = 'rgba(0,0,0,.55)';
          ctx.lineJoin = 'round';
          ctx.strokeText(p.text, p.x, p.y - rise);
          ctx.fillStyle = color;
          ctx.fillText(p.text, p.x, p.y - rise);
          ctx.globalCompositeOperation = 'lighter';
          break;
        }
        default: { // DOT
          if (p.glow > 0) r.glow(p.x, p.y, p.size * p.glow, color, alpha * 0.7);
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.3, p.size * (0.4 + t * 0.7)), 0, TAU);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  /* ==============================================================
     EMITTER PRESETS — the game's visual vocabulary
     ============================================================== */

  /** Small impact spray along an incoming direction. */
  hit(x, y, color = '#fff', dirAngle = 0, power = 1) {
    const n = Math.round(6 * power * this.density);
    for (let i = 0; i < n; i++) {
      const a = dirAngle + R.range(-0.9, 0.9);
      const sp = R.range(120, 380) * power;
      this.emit({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: R.range(0.14, 0.32), size: R.range(1.6, 3.4),
        color, shape: SHAPE.SPARK, drag: 5, weight: 0.6,
      });
    }
  }

  /** Enemy death: shards + ring + core flash. */
  burst(x, y, color = '#22d3ee', power = 1, color2 = null) {
    const n = Math.round(10 * power * this.density);
    for (let i = 0; i < n; i++) {
      const a = R.float() * TAU;
      const sp = R.range(90, 460) * power;
      this.emit({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: R.range(0.25, 0.6), size: R.range(2, 5) * power,
        color, color2, shape: R.chance(0.5) ? SHAPE.SPARK : SHAPE.SHARD,
        rot: R.float() * TAU, vrot: R.range(-9, 9),
        drag: 2.6, ay: 90, weight: 0.8,
      });
    }
    this.emit({
      x, y, life: 0.34, size: 6 * power, size2: 44 * power,
      color, shape: SHAPE.RING, weight: 1.4,
    });
    this.emit({
      x, y, life: 0.22, size: 16 * power, color, shape: SHAPE.SMOKE,
      glow: 1, weight: 1.2,
    });
  }

  /** Big kill / boss phase: layered rings, smoke, shards. */
  explosion(x, y, color = '#fbbf24', power = 1.6) {
    for (let k = 0; k < 3; k++) {
      this.emit({
        x, y, life: 0.42 + k * 0.16, size: 10 * power, size2: (60 + k * 44) * power,
        color: k === 0 ? '#ffffff' : color, shape: SHAPE.RING, weight: 2,
      });
    }
    const n = Math.round(26 * power * this.density);
    for (let i = 0; i < n; i++) {
      const a = R.float() * TAU;
      const sp = R.range(120, 720) * power;
      this.emit({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: R.range(0.4, 1.1), size: R.range(2.5, 7),
        color: R.chance(0.35) ? '#ffffff' : color,
        shape: R.chance(0.6) ? SHAPE.SHARD : SHAPE.SPARK,
        rot: R.float() * TAU, vrot: R.range(-12, 12),
        drag: 1.8, ay: 160, weight: 1.1,
      });
    }
    const s = Math.round(8 * this.density);
    for (let i = 0; i < s; i++) {
      this.emit({
        x: x + R.range(-24, 24), y: y + R.range(-24, 24),
        vx: R.range(-60, 60), vy: R.range(-90, -20),
        life: R.range(0.6, 1.3), size: R.range(20, 44) * power,
        color, shape: SHAPE.SMOKE, drag: 1.4, alpha: 0.5, weight: 0.9,
      });
    }
  }

  /** Muzzle flash at a firing point. */
  muzzle(x, y, angle, color = '#a5f3fc') {
    this.emit({
      x, y, life: 0.1, size: 14, color, shape: SHAPE.SMOKE, glow: 1, weight: 0.5,
    });
    for (let i = 0; i < Math.round(3 * this.density); i++) {
      const a = angle + R.range(-0.35, 0.35);
      const sp = R.range(200, 460);
      this.emit({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: R.range(0.07, 0.16), size: R.range(1.4, 2.6),
        color, shape: SHAPE.SPARK, drag: 7, weight: 0.35,
      });
    }
  }

  /** Trail dust behind a moving entity. */
  trail(x, y, color, size = 3, life = 0.3) {
    this.emit({
      x: x + R.range(-2, 2), y: y + R.range(-2, 2),
      vx: R.range(-16, 16), vy: R.range(-8, 26),
      life, size, color, shape: SHAPE.DOT, drag: 3, weight: 0.25, layer: 0,
    });
  }

  /** Pickup absorbed into the player. */
  absorb(x, y, color = '#67e8f9') {
    for (let i = 0; i < Math.round(5 * this.density); i++) {
      const a = R.float() * TAU;
      this.emit({
        x, y, vx: Math.cos(a) * R.range(40, 160), vy: Math.sin(a) * R.range(40, 160),
        life: R.range(0.2, 0.4), size: R.range(1.5, 3),
        color, shape: SHAPE.DOT, drag: 6, glow: 2, weight: 0.4,
      });
    }
  }

  /** Level-up / power spike: upward column of light. */
  ascend(x, y, color = '#fbbf24', height = 260) {
    for (let i = 0; i < Math.round(24 * this.density); i++) {
      this.emit({
        x: x + R.range(-40, 40), y: y + R.range(-10, 40),
        vx: R.range(-30, 30), vy: -R.range(180, 520),
        life: R.range(0.5, 1.0), size: R.range(2, 5),
        color, shape: SHAPE.SPARK, drag: 0.6, weight: 1, layer: 1,
      });
    }
    this.emit({
      x, y, life: 0.6, size: 120, size2: height, color,
      shape: SHAPE.BEAM, alpha: 0.5, weight: 1.6, layer: 0,
    });
    for (let k = 0; k < 2; k++) {
      this.emit({
        x, y, life: 0.5 + k * 0.2, size: 20, size2: 130 + k * 70,
        color, shape: SHAPE.RING, weight: 1.4, layer: 1,
      });
    }
  }

  /** Rarity-coloured confetti for gacha reveals. */
  celebrate(x, y, color = '#fbbf24', power = 1, prism = false) {
    const n = Math.round(40 * power * this.density);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + R.range(-1.5, 1.5);
      const sp = R.range(200, 900) * power;
      this.emit({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: R.range(0.9, 2.0), size: R.range(3, 8),
        color, shape: R.chance(0.4) ? SHAPE.PLUS : SHAPE.SHARD,
        rot: R.float() * TAU, vrot: R.range(-14, 14),
        drag: 0.9, ay: 460, weight: 1.5, layer: 1,
        hueShift: prism ? 1 : 0,
      });
    }
  }

  /** Floating number. Score, damage, currency. */
  number(x, y, text, color = '#fff', size = 26) {
    this.emit({
      x, y, text, color, size,
      life: 0.85, shape: SHAPE.TEXT, vy: -30, drag: 2,
      weight: 1.3, layer: 1,
    });
  }
}
