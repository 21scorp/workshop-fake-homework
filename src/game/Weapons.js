/**
 * Weapons.js — firing patterns.
 *
 * Each Astra's `weapon.type` maps to one function here. They all receive the
 * run context and the *resolved* stats (base × star × card mods), and their only
 * job is to put bullets into the world. Everything downstream — homing, pierce,
 * chaining, bouncing — is bullet behaviour, not weapon behaviour, so a card that
 * adds homing works with every weapon automatically.
 */

import { TAU, angleTo, clamp } from '../core/Math2.js';
import { Sfx } from '../core/Audio.js';

const UP = -Math.PI / 2;

/**
 * @typedef {Object} FireCtx
 * @property {object} run     the RunScene
 * @property {object} player
 * @property {object} stats   resolved stats
 * @property {object} weapon  the Astra's weapon config
 * @property {number} dt
 */

/** Spawn one bullet with the shared defaults applied. */
function shoot(ctx, { x, y, angle, speed, dmgMul = 1, sizeMul = 1, extra = {} }) {
  const { run, stats, weapon } = ctx;
  // GOKKER trades reliability for damage: a misfire never leaves the barrel.
  if (stats.misfire > 0 && Math.random() < stats.misfire) return null;
  const b = run.bullets.spawn();
  b.x = x; b.y = y;
  const sp = speed ?? (weapon.bulletSpeed ?? 900) * stats.bulletSpeedMul;
  b.vx = Math.cos(angle) * sp;
  b.vy = Math.sin(angle) * sp;
  b.speed = sp;
  b.angle = angle;
  b.dmg = stats.damage * dmgMul * (run.passiveDamageMul ?? 1) * (run.overheatMul ?? 1);
  b.r = (weapon.radius ?? 8) * stats.bulletSize * sizeMul;
  b.sprite = weapon.bullet ?? 'bullet/basic';
  b.color = stats.color;
  b.color2 = stats.color2;
  b.life = extra.life ?? 2.4;
  b.pierce = stats.pierce + (weapon.pierce ?? 0);
  b.chains = stats.chains;
  b.homing = stats.homing + (weapon.turnRate ?? 0);
  b.bounce = stats.bounce;
  b.slow = weapon.slow ?? 0;
  b.burn = weapon.burn ?? 0;
  b.knockback = weapon.knockback ?? 0;
  b.splash = weapon.splash ?? 0;
  b.crit = Math.random() < stats.crit + (extra.critBonus ?? 0) + (run.passiveCritBonus ?? 0);
  if (b.crit) b.dmg *= stats.critDmg;
  b.split = weapon.split ?? 0;
  b.t = 0;
  b.hits = 0;
  b.owner = 'player';
  b.wave = 0;
  b.amplitude = weapon.amplitude ?? 0;
  b.returnTime = weapon.returnTime ?? 0;
  b.pullRadius = weapon.pullRadius ?? 0;
  b.pullForce = weapon.pullForce ?? 0;
  Object.assign(b, extra);
  return b;
}

/** Evenly spread `n` angles across `spread` radians centred on `base`. */
function fan(base, n, spread) {
  const out = [];
  if (n <= 1) return [base];
  if (spread >= TAU - 0.01) {
    for (let i = 0; i < n; i++) out.push(base + (i / n) * TAU);
    return out;
  }
  for (let i = 0; i < n; i++) out.push(base - spread / 2 + (i / (n - 1)) * spread);
  return out;
}

/** Nearest enemy to a point, or null. */
export function nearestEnemy(run, x, y, maxDist = 1e9) {
  let best = null, bestD = maxDist * maxDist;
  run.enemies.each((e) => {
    const dx = e.x - x, dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = e; }
  });
  return best;
}

/* ============================================================
   PATTERNS
   ============================================================ */

const PATTERNS = {

  /** Straight up, plus extra projectiles fanned out. */
  straight(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles);
    const spread = (weapon.spread ?? 0) + (n > 1 ? 0.1 + n * 0.045 : 0);
    for (const a of fan(UP, n, spread)) {
      shoot(ctx, { x: player.x, y: player.y - 18, angle: a });
    }
    ctx.run.fx.muzzle(player.x, player.y - 22, UP, stats.color2);
    Sfx.play('shoot', { pitch: 1 + (n - 1) * 0.04, gate: 0.03 });
  },

  /** Wide arc — the classic shotgun feel. */
  spread(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(2, stats.projectiles);
    for (const a of fan(UP, n, (weapon.spread ?? 0.2) + n * 0.06)) {
      shoot(ctx, { x: player.x, y: player.y - 16, angle: a, dmgMul: 0.92 });
    }
    ctx.run.fx.muzzle(player.x, player.y - 22, UP, stats.color2);
    Sfx.play('shoot', { pitch: 0.9, gate: 0.03 });
  },

  /** Sine-wave travel. Covers lanes a straight shot misses. */
  wave(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles);
    for (let i = 0; i < n; i++) {
      shoot(ctx, {
        x: player.x, y: player.y - 16, angle: UP,
        extra: { amplitude: weapon.amplitude ?? 60, wavePhase: (i / n) * TAU, waveDir: i % 2 ? 1 : -1 },
      });
    }
    Sfx.play('shoot', { pitch: 1.1, gate: 0.04 });
  },

  /** Seeks the nearest enemy from the moment it leaves the barrel. */
  homing(ctx) {
    const { run, player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles);
    for (const a of fan(UP, n, weapon.spread ?? 0.5)) {
      const b = shoot(ctx, { x: player.x, y: player.y - 14, angle: a });
      if (!b) continue;
      b.homing = Math.max(b.homing, weapon.turnRate ?? 3);
      b.target = nearestEnemy(run, player.x, player.y, 900);
    }
    Sfx.play('shoot', { pitch: 1.25, gate: 0.04 });
  },

  /** Lobbed arc that splashes on impact. */
  lob(ctx) {
    const { run, player, stats, weapon } = ctx;
    const target = nearestEnemy(run, player.x, player.y, 1200);
    const a = target ? angleTo(player.x, player.y, target.x, target.y) : UP;
    const n = Math.max(1, stats.projectiles);
    for (const ang of fan(a, n, n > 1 ? 0.35 : 0)) {
      shoot(ctx, {
        x: player.x, y: player.y - 14, angle: ang,
        extra: { splash: weapon.splash ?? 70, gravity: 120, sizeMul: 1.3 },
        sizeMul: 1.4,
      });
    }
    Sfx.play('shoot', { pitch: 0.7, gate: 0.06 });
  },

  /** Fast, always pierces. Rewards lining enemies up. */
  pierce(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles);
    for (const a of fan(UP, n, weapon.spread ?? 0.12)) {
      const b = shoot(ctx, { x: player.x, y: player.y - 18, angle: a, dmgMul: 1.15 });
      if (!b) continue;
      b.pierce = 99;
      b.accel = 900;    // "draft" — speeds up as it travels
    }
    Sfx.play('laser', { pitch: 1.1, gate: 0.04 });
  },

  /** Short-range cone. High rate, low per-hit damage. */
  cone(ctx) {
    const { player, stats, weapon } = ctx;
    const n = 2 + Math.floor(stats.projectiles / 2);
    for (const a of fan(UP, n, weapon.spread ?? 0.34)) {
      shoot(ctx, {
        x: player.x, y: player.y - 12, angle: a + (Math.random() - 0.5) * 0.18,
        speed: (weapon.bulletSpeed ?? 620) * stats.bulletSpeedMul,
        dmgMul: 0.6,
        extra: { life: (weapon.range ?? 320) / ((weapon.bulletSpeed ?? 620) * stats.bulletSpeedMul), drag: 1.4 },
      });
    }
    Sfx.play('shoot', { pitch: 1.5, gate: 0.05 });
  },

  /** Continuous beam. Doesn't spawn bullets — it's a swept hit region. */
  beam(ctx) {
    const { run, player, stats, weapon } = ctx;
    run.beam.active = true;
    run.beam.x = player.x;
    run.beam.y = player.y - 20;
    run.beam.width = (weapon.width ?? 26) * stats.bulletSize * (1 + run.beam.heat * 0.9);
    run.beam.dmg = stats.damage * 0.34 * (1 + run.beam.heat * 0.8);
    run.beam.color = stats.color;
    run.beam.color2 = stats.color2;
    run.beam.heat = clamp(run.beam.heat + ctx.dt * 0.5, 0, 1);
    Sfx.play('laser', { pitch: 0.8 + run.beam.heat * 0.6, gate: 0.12 });
  },

  /** Bullets orbit the player instead of flying away. */
  orbit(ctx) {
    const { run, player, stats, weapon } = ctx;
    const want = Math.max(1, (weapon.count ?? 4) + Math.floor(stats.projectiles / 2));
    // Top up to `want` orbiters rather than firing on a cadence.
    let have = 0;
    run.bullets.each((b) => { if (b.orbit) have++; });
    for (let i = have; i < want; i++) {
      const b = shoot(ctx, {
        x: player.x, y: player.y, angle: 0, speed: 0,
        sizeMul: 1.3,
        extra: {
          orbit: true, orbitAngle: (i / want) * TAU, life: 99,
          orbitRadius: weapon.orbitRadius ?? 90,
          orbitSpeed: weapon.orbitSpeed ?? 2.6,
          pierce: 99, cooldownMap: new Map(),
        },
      });
      if (b) b.dmg = stats.damage * 0.5;
    }
  },

  /** Heavy downward slam with a shockwave. */
  slam(ctx) {
    const { run, player, stats, weapon } = ctx;
    const target = nearestEnemy(run, player.x, player.y, 700);
    const x = target ? target.x : player.x;
    const y = target ? target.y : player.y - 220;
    run.spawnShockwave(x, y, weapon.splash ?? 130, stats.damage, {
      knockback: weapon.knockback ?? 200, stun: weapon.stun ?? 0.5, color: stats.color,
    });
    run.fx.explosion(x, y, stats.color, 1.1);
    run.screen.shake(0.28);
    Sfx.play('explode', { size: 0.8 });
  },

  /** Fires in every direction at once. */
  nova(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(4, (weapon.count ?? 6) + stats.projectiles);
    for (let i = 0; i < n; i++) {
      shoot(ctx, { x: player.x, y: player.y, angle: (i / n) * TAU + ctx.run.time * 0.7, dmgMul: 0.8 });
    }
    Sfx.play('shoot', { pitch: 1.3, gate: 0.05 });
  },

  /** Pulls enemies toward the impact point. */
  singularity(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles);
    for (const a of fan(UP, n, weapon.spread ?? 0.3)) {
      shoot(ctx, {
        x: player.x, y: player.y - 14, angle: a, sizeMul: 1.5,
        extra: {
          pullRadius: weapon.pullRadius ?? 140,
          pullForce: weapon.pullForce ?? 260,
          life: 2.6,
        },
      });
    }
    Sfx.play('shoot', { pitch: 0.6, gate: 0.06 });
  },

  /** Splits into smaller shards on the first hit. */
  prismshot(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles);
    for (const a of fan(UP, n, weapon.spread ?? 0.4)) {
      shoot(ctx, { x: player.x, y: player.y - 16, angle: a, extra: { split: weapon.split ?? 2 } });
    }
    Sfx.play('laser', { pitch: 1.35, gate: 0.04 });
  },

  /** Flies out, stops, comes back. Hits twice. */
  boomerang(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles);
    for (const a of fan(UP, n, weapon.spread ?? 0.25)) {
      shoot(ctx, {
        x: player.x, y: player.y - 14, angle: a,
        extra: { boomerang: true, returnTime: weapon.returnTime ?? 0.6, pierce: 99, life: 3 },
      });
    }
    Sfx.play('shoot', { pitch: 1.15, gate: 0.04 });
  },

  /** Hits, then arcs to nearby enemies. */
  chain(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles);
    for (const a of fan(UP, n, weapon.spread ?? 0.15)) {
      const b = shoot(ctx, { x: player.x, y: player.y - 16, angle: a });
      if (!b) continue;
      b.chains = Math.max(b.chains, weapon.chains ?? 2);
      b.chainRange = weapon.chainRange ?? 160;
    }
    Sfx.play('laser', { pitch: 1.2, gate: 0.04 });
  },

  /**
   * Three shots in quick succession, then a long gap.
   *
   * The same DPS as `straight`, but the *rhythm* is what you feel: a burst
   * punishes you for drifting mid-volley and rewards you for lining up before
   * one starts. Rate-of-fire cards shorten the gap, never the burst.
   */
  burst(ctx) {
    const { run, player, stats, weapon } = ctx;
    const shots = weapon.burst ?? 3;
    const gap = weapon.burstGap ?? 0.07;
    const n = Math.max(1, stats.projectiles);
    for (let i = 0; i < shots; i++) {
      const fire = () => {
        for (const a of fan(UP, n, (weapon.spread ?? 0.06) + n * 0.03)) {
          shoot(ctx, { x: player.x, y: player.y - 18, angle: a, dmgMul: 0.8 });
        }
        run.fx.muzzle(player.x, player.y - 22, UP, stats.color2);
        Sfx.play('shoot', { pitch: 1.25 + i * 0.06, gate: 0.02 });
      };
      // Reuse the echo queue rather than a timer: it is already paused,
      // slowed and cleaned up with the run.
      if (i === 0) fire();
      else run.pendingEcho.push({ t: gap * i, ctx, fire });
    }
  },

  /**
   * A continuously rotating stream. Covers everything, eventually.
   *
   * Angle comes off run time rather than a per-shot counter so the spiral
   * keeps its shape through hitstop, slow-motion and pauses.
   */
  spiral(ctx) {
    const { run, player, stats, weapon } = ctx;
    const arms = Math.max(1, (weapon.arms ?? 2) + Math.floor(stats.projectiles / 2));
    const base = run.time * (weapon.spin ?? 3.1);
    for (let i = 0; i < arms; i++) {
      shoot(ctx, {
        x: player.x, y: player.y, angle: base + (i / arms) * TAU,
        dmgMul: 0.78,
        extra: { life: 3.2 },
      });
    }
    Sfx.play('shoot', { pitch: 1.4, gate: 0.04 });
  },

  /**
   * Slow, heavy shots that bounce off the walls.
   *
   * Every ricochet is a second chance at a row you missed, which makes the
   * narrow lanes of a late wave an advantage instead of a trap.
   */
  ricochet(ctx) {
    const { player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles);
    for (const a of fan(UP, n, weapon.spread ?? 0.5)) {
      const b = shoot(ctx, {
        x: player.x, y: player.y - 14, angle: a,
        speed: (weapon.bulletSpeed ?? 560) * stats.bulletSpeedMul,
        dmgMul: 1.25, sizeMul: 1.2,
        extra: { life: 5 },
      });
      if (!b) continue;
      b.bounce = Math.max(b.bounce, weapon.bounce ?? 3);
    }
    Sfx.play('shoot', { pitch: 0.75, gate: 0.05 });
  },

  /**
   * Falls from above, in the column the nearest enemy is standing in.
   *
   * The only pattern that does not originate at the vessel, so it hits the
   * back rank that everything else has to shoot through.
   */
  rain(ctx) {
    const { run, player, stats, weapon } = ctx;
    const n = Math.max(1, stats.projectiles + 1);
    const target = nearestEnemy(run, player.x, player.y * 0.5, 1400);
    const cx = target ? target.x : player.x;
    for (let i = 0; i < n; i++) {
      const jitter = (i - (n - 1) / 2) * (weapon.spacing ?? 54) + (Math.random() - 0.5) * 26;
      shoot(ctx, {
        x: clamp(cx + jitter, 20, run.view.w - 20), y: -20,
        angle: Math.PI / 2,
        speed: (weapon.bulletSpeed ?? 640) * stats.bulletSpeedMul,
        dmgMul: 0.85, sizeMul: 1.15,
        extra: { life: 4, splash: weapon.splash ?? 40 },
      });
    }
    Sfx.play('shoot', { pitch: 0.95, gate: 0.05 });
  },
};

/** Weapons that fire continuously rather than on a cooldown. */
const CONTINUOUS = new Set(['beam', 'orbit']);

/**
 * Called every frame by the run. Handles cadence and delegates to a pattern.
 */
export function updateWeapon(run, dt) {
  const { player, stats } = run;
  const weapon = run.astra.weapon;
  const type = weapon.type;
  const pattern = PATTERNS[type] ?? PATTERNS.straight;
  const ctx = { run, player, stats, weapon, dt };

  if (CONTINUOUS.has(type)) {
    pattern(ctx);
    return;
  }

  run.fireTimer -= dt;
  if (run.fireTimer > 0) return;
  const rate = Math.max(0.08, stats.fireRate * (run.passiveRateMul ?? 1));
  run.fireTimer += 1 / rate;
  if (run.fireTimer < -0.5) run.fireTimer = 0;    // recover from long stalls

  pattern(ctx);

  // The ECHO card replays the same volley shortly after.
  if (stats.echo > 0) {
    run.pendingEcho.push({ t: 0.2, ctx: { ...ctx } });
  }
}

export function fireEchoes(run, dt) {
  const list = run.pendingEcho;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t -= dt;
    if (list[i].t <= 0) {
      const { ctx, fire } = list[i];
      // A queued `fire` means "just this shot", not "run the pattern again" —
      // without it a burst would re-enter itself and queue forever.
      const run2 = fire ?? (() => {
        const pattern = PATTERNS[ctx.weapon.type] ?? PATTERNS.straight;
        pattern(ctx);
      });
      try { run2(); } catch { /* the volley is cosmetic; never break the run */ }
      list.splice(i, 1);
    }
  }
}

export { PATTERNS, shoot, fan };
