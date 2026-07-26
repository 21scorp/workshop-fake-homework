/**
 * Ults.js — ultimate abilities.
 *
 * Rather than 21 bespoke implementations, ults are compositions of a handful of
 * *primitives*. That keeps them consistent to balance and to read, and it means
 * a new Astra usually needs zero new code — just a new recipe.
 *
 * Every ult must satisfy the clip test: within 0.4s of the tap, the screen must
 * look dramatically different. That's why almost all of them start with a flash,
 * a shake and a hitstop.
 */

import { TAU, clamp } from '../core/Math2.js';
import { Sfx } from '../core/Audio.js';
import { hexA } from '../core/Renderer.js';

/* ============================================================
   PRIMITIVES
   ============================================================ */

const P = {
  /** Expanding damage ring from a point. */
  nova(run, { x, y, radius = 420, dmg = 4, knockback = 260, stun = 0.5, color = '#fbbf24' }) {
    run.spawnShockwave(x, y, radius, run.stats.damage * dmg, { knockback, stun, color, big: true });
    run.fx.explosion(x, y, color, 2.2);
    run.screen.shake(0.7);
    run.screen.doFlash(0.5, color);
  },

  /** Freeze every enemy in place. */
  stunAll(run, { duration = 2 }) {
    run.enemies.each((e) => { e.stunT = Math.max(e.stunT, duration); });
  },

  slowAll(run, { amount = 0.6, duration = 4 }) {
    run.enemies.each((e) => { e.slowT = Math.max(e.slowT, duration); e.slowAmt = Math.max(e.slowAmt, amount); });
  },

  /** Delete every enemy projectile — and pay the player in particles. */
  clearBullets(run, { toPrisms = false } = {}) {
    run.ebullets.each((b) => {
      run.fx.hit(b.x, b.y, '#a5f3fc', 0, 0.7);
      if (toPrisms) run.spawnPickup('prism', b.x, b.y, { value: 1 });
      b._alive = false;
    });
  },

  damageAll(run, { mul = 3, tag = 'ult' }) {
    run.enemies.each((e) => run.damageEnemy(e, run.stats.damage * mul, { source: tag, crit: true }));
  },

  /** Persistent damage zone. `shape` is 'rect' or 'circle'. */
  zone(run, { x, y, w, h, r, duration = 3, dps = 3, color = '#fb923c', shape = 'rect', pull = 0, slow = 0 }) {
    const z = run.hazards.spawn();
    z.kind = 'zone';
    z.shape = shape;
    z.x = x; z.y = y; z.w = w; z.h = h; z.r = r ?? Math.max(w, h) / 2;
    z.life = duration; z.maxLife = duration;
    z.dps = run.stats.damage * dps;
    z.color = color;
    z.friendly = true;
    z.tick = 0;
    z.pull = pull;
    z.slow = slow;
    return z;
  },

  /** Gravity well that drags enemies in and grinds them. */
  blackhole(run, { x, y, radius = 240, duration = 3.5, dps = 2.4, detonate = 0, color = '#a855f7' }) {
    const z = P.zone(run, { x, y, r: radius, duration, dps, color, shape: 'circle', pull: 460 });
    z.detonate = detonate;
    z.swirl = true;
    return z;
  },

  /** N impacts at (mostly) enemy positions. */
  strikes(run, { count = 3, dmg = 5, radius = 130, delay = 0.22, color = '#fbbf24' }) {
    for (let i = 0; i < count; i++) {
      run.schedule(i * delay, () => {
        const target = run.randomEnemy() ?? { x: run.rng.range(80, run.view.w - 80), y: run.rng.range(160, run.view.h * 0.55) };
        P.nova(run, { x: target.x, y: target.y, radius, dmg, knockback: 180, stun: 0.3, color });
        Sfx.play('explode', { size: 1.1, gate: 0 });
      });
    }
  },

  /** Temporary orbiting damage bodies. */
  orbitals(run, { count = 6, duration = 8, radius = 130, dmg = 1.2, color = '#22d3ee' }) {
    for (let i = 0; i < count; i++) {
      const b = run.bullets.spawn();
      b.x = run.player.x; b.y = run.player.y;
      b.vx = 0; b.vy = 0;
      b.orbit = true;
      b.orbitAngle = (i / count) * TAU;
      b.orbitRadius = radius;
      b.orbitSpeed = 3.4;
      b.life = duration;
      b.dmg = run.stats.damage * dmg;
      b.r = 16;
      b.sprite = 'bullet/orb';
      b.color = color;
      b.color2 = '#ffffff';
      b.pierce = 99;
      b.owner = 'player';
      b.t = 0; b.hits = 0;
      b.cooldownMap = new Map();
      b.temporary = true;
    }
  },

  /** Stop the world. */
  timeStop(run, { duration = 4 }) {
    run.timeFreeze = Math.max(run.timeFreeze, duration);
    run.screen.doFlash(0.55, '#e0f2fe');
    run.screen.setZoom(1.04);
  },

  invuln(run, { duration = 3, speed = 1.6 }) {
    run.player.invuln = Math.max(run.player.invuln, duration);
    run.player.ramT = duration;
    run.player.ramSpeed = speed;
  },

  heal(run, { amount = 1 }) {
    run.healPlayer(amount);
  },

  /** A sweeping beam that drags across the field. */
  sweep(run, { duration = 5, width = 90, dps = 4, color = '#fbbf24' }) {
    const z = run.hazards.spawn();
    z.kind = 'sweep';
    z.x = run.view.w * 0.15;
    z.y = 0;
    z.w = width;
    z.h = run.view.h;
    z.r = width / 2;
    z.shape = 'rect';
    z.life = duration; z.maxLife = duration;
    z.dps = run.stats.damage * dps;
    z.color = color;
    z.friendly = true;
    z.tick = 0;
    z.sweepFrom = run.view.w * 0.12;
    z.sweepTo = run.view.w * 0.88;
    return z;
  },

  /** Mark every enemy: they take multiplied damage for a while. */
  mark(run, { duration = 5, mul = 3 }) {
    run.markMul = mul;
    run.markT = duration;
    run.enemies.each((e) => { e.marked = duration; });
  },
};

/* ============================================================
   RECIPES — one per Astra ult key
   ============================================================ */

const RECIPES = {
  flare: (run) => {
    P.stunAll(run, { duration: 2.2 });
    P.nova(run, { x: run.player.x, y: run.player.y, radius: 460, dmg: 2.5, color: '#fde047' });
    Sfx.play('ultimate');
  },

  firewall: (run) => {
    P.zone(run, {
      x: 0, y: run.player.y - 300, w: run.view.w, h: 90,
      duration: 3.5, dps: 4, color: '#fb923c',
    });
    run.screen.shake(0.5);
    Sfx.play('ultimate');
  },

  quake: (run) => {
    P.nova(run, { x: run.player.x, y: run.player.y, radius: 520, dmg: 3, knockback: 520, stun: 1.4, color: '#fbbf24' });
    run.screen.shake(0.9, 0, 1);
    Sfx.play('ultimate');
  },

  gust: (run) => {
    P.clearBullets(run, { toPrisms: true });
    P.nova(run, { x: run.player.x, y: run.player.y, radius: 480, dmg: 1.5, knockback: 620, stun: 0.6, color: '#5eead4' });
    Sfx.play('whoosh', { dur: 0.6 });
  },

  deluge: (run) => {
    P.slowAll(run, { amount: 0.7, duration: 6 });
    P.strikes(run, { count: 6, dmg: 2.2, radius: 110, delay: 0.14, color: '#38bdf8' });
    Sfx.play('ultimate');
  },

  inferno: (run) => {
    P.orbitals(run, { count: 8, duration: 6, radius: 120, dmg: 1.6, color: '#fb923c' });
    P.nova(run, { x: run.player.x, y: run.player.y, radius: 300, dmg: 1.8, color: '#f97316' });
    Sfx.play('ultimate');
  },

  maelstrom: (run) => {
    P.blackhole(run, {
      x: run.view.w / 2, y: run.view.h * 0.4, radius: 300, duration: 4, dps: 2.2, color: '#0ea5e9',
    });
    Sfx.play('ultimate');
  },

  cyclone: (run) => {
    P.invuln(run, { duration: 3.2, speed: 1.8 });
    P.orbitals(run, { count: 5, duration: 3.2, radius: 80, dmg: 2.4, color: '#2dd4bf' });
    run.screen.doFlash(0.4, '#ccfbf1');
    Sfx.play('whoosh', { dur: 0.5 });
  },

  meteor: (run) => {
    P.strikes(run, { count: 3, dmg: 7, radius: 190, delay: 0.32, color: '#d97706' });
    Sfx.play('ultimate');
  },

  devour: (run) => {
    P.blackhole(run, {
      x: run.player.x, y: run.player.y - 240, radius: 280, duration: 3.2,
      dps: 3, detonate: 6, color: '#7c3aed',
    });
    Sfx.play('ultimate');
  },

  prismbeam: (run) => {
    P.sweep(run, { duration: 4, width: 70, dps: 5, color: '#fde047' });
    P.mark(run, { duration: 4, mul: 1.6 });
    Sfx.play('ultimate');
  },

  supernova: (run) => {
    P.nova(run, { x: run.player.x, y: run.player.y, radius: 300, dmg: 3, color: '#f97316' });
    run.schedule(0.25, () => P.nova(run, { x: run.player.x, y: run.player.y, radius: 480, dmg: 4, color: '#fb923c' }));
    run.schedule(0.55, () => P.nova(run, { x: run.player.x, y: run.player.y, radius: 700, dmg: 6, color: '#fef08a' }));
    Sfx.play('ultimate');
  },

  tsunami: (run) => {
    const z = P.zone(run, {
      x: 0, y: run.view.h, w: run.view.w, h: 160,
      duration: 2.4, dps: 5, color: '#0284c7', slow: 0.6,
    });
    z.riseSpeed = run.view.h / 2.0;
    P.slowAll(run, { amount: 0.5, duration: 5 });
    Sfx.play('ultimate');
  },

  thunderline: (run) => {
    P.strikes(run, { count: 5, dmg: 4.5, radius: 120, delay: 0.16, color: '#e0f2fe' });
    P.stunAll(run, { duration: 1.0 });
    Sfx.play('ultimate');
  },

  fissure: (run) => {
    P.zone(run, {
      x: run.player.x - 70, y: 0, w: 140, h: run.view.h,
      duration: 4, dps: 6, color: '#b45309',
    });
    run.screen.shake(0.8, 1, 0);
    Sfx.play('ultimate');
  },

  eclipse: (run) => {
    P.mark(run, { duration: 5, mul: 3 });
    P.slowAll(run, { amount: 0.4, duration: 5 });
    run.screen.doFlash(0.6, '#a855f7');
    Sfx.play('ultimate');
  },

  zenith: (run) => {
    P.sweep(run, { duration: 5, width: 130, dps: 6, color: '#fbbf24' });
    Sfx.play('ultimate');
  },

  collapse: (run) => {
    P.blackhole(run, {
      x: run.player.x, y: run.player.y - 280, radius: 340, duration: 4,
      dps: 3.4, detonate: 9, color: '#6d28d9',
    });
    Sfx.play('ultimate');
  },

  gardenof: (run) => {
    P.orbitals(run, { count: 6, duration: 8, radius: 140, dmg: 1.5, color: '#22d3ee' });
    P.heal(run, { amount: 1 });
    Sfx.play('ultimate');
  },

  stasis: (run) => {
    P.timeStop(run, { duration: 4 });
    Sfx.play('ultimate');
  },

  serpentcoil: (run) => {
    P.orbitals(run, { count: 10, duration: 7, radius: 190, dmg: 1.8, color: '#a855f7' });
    P.nova(run, { x: run.player.x, y: run.player.y, radius: 380, dmg: 2, color: '#c084fc' });
    Sfx.play('ultimate');
  },
};

/**
 * Fire an Astra's ultimate. Star 5 boosts every recipe by re-running its
 * primary primitive at reduced strength — the "upgraded ultimate" promise.
 */
export function fireUlt(run, astra, stars = 1) {
  const key = astra.ult?.key;
  const recipe = RECIPES[key] ?? RECIPES.flare;

  run.screen.shake(0.5);
  run.game.hitstop(0.09);
  run.screen.doFlash(0.35, astra.colors.primary);
  run.fx.celebrate(run.player.x, run.player.y, astra.colors.primary, 0.8, astra.rarity >= 4);

  try { recipe(run); } catch (err) { console.error('[ult] recipe failed', key, err); }

  if (stars >= 5) {
    run.schedule(0.5, () => { try { recipe(run); } catch { /* cosmetic echo */ } });
  }

  run.ultsFired++;
  return astra.ult?.name ?? 'ULTIMATE';
}

export { P as UltPrimitives, RECIPES };
