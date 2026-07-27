/**
 * WaveDirector.js — spawn choreography.
 *
 * Waves are *composed*, not random: each wave is a sequence of formations with
 * deliberate gaps. The gaps matter as much as the enemies — a wave with no
 * breathing room reads as noise, and a wave with too much reads as empty.
 *
 * Everything here draws from the run's seeded RNG, so the same seed produces
 * the identical fight. That is what makes the Daily Seed and shared challenge
 * links work without a server.
 */

import { ENEMY, enemyPool, ELITE_MODS, ELITE_KEYS, bossForWave } from '../data/enemies.js';
import { clamp, lerp, TAU } from '../core/Math2.js';
import { SCORE_SCALE } from '../data/constants.js';

const WAVE_TIME = 22;         // seconds of spawning per wave
const BREATH = 2.2;           // calm gap between waves
const CLEANUP_PATIENCE = 7;   // grace period for stragglers before moving on
const MAX_LIVE = 48;          // hard ceiling on simultaneous enemies
const BOSS_EVERY = 5;

/** How much tougher everything gets, per wave. */
export function waveScaling(wave) {
  return {
    hp: 1 + Math.pow(wave - 1, 1.15) * 0.28,
    dmg: 1 + Math.floor((wave - 1) / 6) * 0.5,
    speed: 1 + Math.min(0.55, (wave - 1) * 0.035),
    score: 1 + (wave - 1) * 0.16,
    density: 1 + (wave - 1) * 0.14,
    eliteChance: clamp(0.02 + (wave - 2) * 0.022, 0, 0.30),
  };
}

/* ------------------------------------------------------------------
   FORMATIONS — each returns a list of {x, y, delay, type} spawn orders.
   x is normalised 0..1 across the play width.
   ------------------------------------------------------------------ */

const FORMATIONS = {
  /** A horizontal rank that drops together. */
  line(rng, n, type) {
    const out = [];
    const pad = 0.12;
    for (let i = 0; i < n; i++) {
      out.push({ x: lerp(pad, 1 - pad, n === 1 ? 0.5 : i / (n - 1)), y: -0.06, delay: i * 0.05, type });
    }
    return out;
  },

  /** A V, tip first. Reads as "incoming". */
  arrow(rng, n, type) {
    const out = [];
    const half = Math.floor(n / 2);
    out.push({ x: 0.5, y: -0.06, delay: 0, type });
    for (let i = 1; i <= half; i++) {
      const off = i * 0.09;
      out.push({ x: 0.5 - off, y: -0.06 - i * 0.03, delay: i * 0.06, type });
      out.push({ x: 0.5 + off, y: -0.06 - i * 0.03, delay: i * 0.06, type });
    }
    return out.slice(0, n);
  },

  /** A steady trickle down one lane. Pressure without panic. */
  stream(rng, n, type) {
    const lane = rng.range(0.2, 0.8);
    return Array.from({ length: n }, (_, i) => ({
      x: clamp(lane + rng.range(-0.06, 0.06), 0.08, 0.92),
      y: -0.06, delay: i * 0.34, type,
    }));
  },

  /** Two flanks, converging. Forces the player off the walls. */
  pincer(rng, n, type) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 0.9 : 0.1;
      out.push({ x: side, y: -0.05 - Math.floor(i / 2) * 0.05, delay: Math.floor(i / 2) * 0.14, type });
    }
    return out;
  },

  /** A ring that closes in. Only used from wave 6 — it's genuinely mean. */
  ring(rng, n, type) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      out.push({
        x: 0.5 + Math.cos(a) * 0.44,
        y: 0.34 + Math.sin(a) * 0.22,
        delay: 0.02 * i, type, spawnIn: true,
      });
    }
    return out;
  },

  /** Scattered chaff. The palate cleanser. */
  scatter(rng, n, type) {
    return Array.from({ length: n }, (_, i) => ({
      x: rng.range(0.1, 0.9), y: -0.05 - rng.float() * 0.2,
      delay: rng.float() * 1.4, type,
    }));
  },
};

const FORMATION_KEYS = Object.keys(FORMATIONS);

/* ------------------------------------------------------------------ */

export class WaveDirector {
  /** @param {import('./RunScene.js').RunScene} run */
  constructor(run, rng) {
    this.run = run;
    this.rng = rng;
    this.wave = 0;
    this.waveTime = 0;
    this.phase = 'breath';       // breath | spawning | boss | cleared
    this.queue = [];             // pending spawn orders
    this.spawnedThisWave = 0;
    this.killedThisWave = 0;
    this.bossRef = null;
    this.cleanupT = 0;
    this.totalSpawned = 0;
    this.pendingBanner = null;
    this.breathTime = 1.4;       // shorter before wave 1 so the run starts fast
  }

  get isBossWave() { return this.wave > 0 && this.wave % BOSS_EVERY === 0; }
  /**
   * Wave scaling, with the active anomalies folded in.
   *
   * Anomalies are multipliers on numbers the director already computes, so
   * they can't introduce a spawn path of their own — and therefore can't
   * break one either.
   */
  get scaling() {
    const base = waveScaling(Math.max(1, this.wave));
    const a = this.run.anomalyMods;
    if (!a) return base;
    return {
      ...base,
      hp: base.hp * a.enemyHp,
      dmg: base.dmg * a.enemyDmg,
      speed: base.speed * a.enemySpeed,
      score: base.score * a.score,
      density: base.density * a.density,
    };
  }

  /** Build the spawn plan for the upcoming wave. */
  planWave(wave) {
    const rng = this.rng;
    const sc = waveScaling(wave);
    const pool = enemyPool(wave);
    const orders = [];

    // Budget grows with the wave but is capped so late waves don't turn to soup.
    const budget = Math.round(clamp(10 + wave * 4.2, 12, 52) * sc.density * 0.85);
    let spent = 0;
    let t = 0;

    // Choose 3–5 beats. Each beat is one formation with a gap after it.
    const beats = clamp(3 + Math.floor(wave / 4), 3, 6);
    for (let b = 0; b < beats && spent < budget; b++) {
      const type = rng.weighted(pool, (e) => e.weight);
      const group = type.groupSize ?? 1;
      const count = clamp(
        Math.round((budget / beats) * rng.range(0.7, 1.3) / (type.hp > 60 ? 2.2 : 1)) * group,
        1, 16,
      );

      let formName;
      if (type.groupSize) formName = rng.pick(['scatter', 'stream', 'arrow']);
      else if (wave >= 6 && rng.chance(0.16)) formName = 'ring';
      else formName = rng.pick(FORMATION_KEYS.filter((k) => k !== 'ring'));

      const form = FORMATIONS[formName](rng, count, type.id);
      for (const o of form) {
        o.delay += t;
        orders.push(o);
      }
      spent += count * (type.hp > 60 ? 2 : 1);
      t += rng.range(1.6, 3.2) + count * 0.06;
    }

    // Sprinkle a guaranteed elite from wave 3 onward — a clear "watch out".
    if (wave >= 3) {
      const eliteType = rng.weighted(pool.filter((e) => !e.groupSize), (e) => e.weight);
      if (eliteType) {
        orders.push({
          x: rng.range(0.25, 0.75), y: -0.08,
          delay: t * rng.range(0.35, 0.7),
          type: eliteType.id, elite: rng.pick(ELITE_KEYS),
        });
      }
    }

    orders.sort((a, b) => a.delay - b.delay);
    return orders;
  }

  /**
   * Thin or thicken a planned wave for an active anomaly.
   *
   * Applied *after* planWave rather than inside it, so the composition of a
   * wave stays a pure function of the seed. Duplicates draw from the same
   * seeded stream, so a shared seed still reproduces the fight exactly.
   */
  applyDensity(orders) {
    const d = this.run.anomalyMods?.density ?? 1;
    if (d === 1 || !orders.length) return orders;
    if (d < 1) {
      const keep = Math.max(1, Math.round(orders.length * d));
      return orders.filter((_, i) => i % Math.ceil(orders.length / keep) !== 1).slice(0, keep + 2);
    }
    const extra = Math.round(orders.length * (d - 1));
    const out = orders.slice();
    for (let i = 0; i < extra; i++) {
      const src = orders[this.rng.int(0, orders.length - 1)];
      out.push({
        ...src,
        x: clamp(src.x + this.rng.range(-0.12, 0.12), 0.06, 0.94),
        delay: Math.max(0, src.delay + this.rng.range(-0.4, 0.9)),
      });
    }
    out.sort((a, b) => a.delay - b.delay);
    return out;
  }

  startWave(wave) {
    this.wave = wave;
    this.waveTime = 0;
    this.cleanupT = 0;
    this.spawnedThisWave = 0;
    this.killedThisWave = 0;

    if (this.isBossWave) {
      this.phase = 'boss';
      this.queue = [];
      this.run.onBossWave(bossForWave(wave));
    } else {
      this.phase = 'spawning';
      this.queue = this.applyDensity(this.planWave(wave));
    }
    this.run.onWaveStart(wave, this.isBossWave);
  }

  update(dt) {
    this.waveTime += dt;

    switch (this.phase) {
      case 'breath': {
        this.breathTime -= dt;
        if (this.breathTime <= 0) this.startWave(this.wave + 1);
        break;
      }

      case 'spawning': {
        // Spawn what is due — but never past the live ceiling. A field that
        // outruns the player's clear rate is a death spiral: framerate drops,
        // the screen becomes unreadable, and the run ends to noise rather than
        // to a mistake. Held orders are pushed back rather than dropped.
        while (this.queue.length && this.queue[0].delay <= this.waveTime) {
          if (this.run.enemies.count >= MAX_LIVE) {
            this.queue[0].delay = this.waveTime + 0.5;
            break;
          }
          this.spawn(this.queue.shift());
        }

        // Wave ends when the plan is exhausted and the field is nearly clear.
        //
        // The "nearly" matters: waiting for a literal zero means one weaver
        // orbiting out of the player's firing line can stall a run for half a
        // minute — which is exactly what the balance bot ran into. So once the
        // queue is empty we start a patience timer, and when it expires the
        // next wave starts regardless. Overlapping waves raise the pressure,
        // which is a far better failure mode than dead air.
        if (!this.queue.length) {
          this.cleanupT += dt;
          if (this.run.enemies.count <= 2 || this.cleanupT > CLEANUP_PATIENCE) {
            this.endWave();
          }
        }
        break;
      }

      case 'boss': {
        if (this.bossRef && !this.bossRef._alive) {
          this.bossRef = null;
          this.endWave();
        }
        break;
      }
    }
  }

  endWave() {
    this.phase = 'breath';
    this.breathTime = BREATH;
    this.run.onWaveClear(this.wave);
  }

  /** Turn a spawn order into a live enemy. */
  spawn(order) {
    const def = ENEMY[order.type];
    if (!def) return;
    const view = this.run.view;
    const sc = this.scaling;
    const rng = this.rng;

    const e = this.run.enemies.spawn();
    const elite = order.elite ?? (rng.chance(sc.eliteChance) ? rng.pick(ELITE_KEYS) : null);
    const mod = elite ? ELITE_MODS[elite] : null;

    e.id = this.run.enemyId++;
    e.type = def.id;
    e.def = def;
    e.sprite = def.sprite;
    e.x = clamp(order.x * view.w, 24, view.w - 24);
    e.y = order.y * view.h;
    e.spawnIn = !!order.spawnIn;
    e.spawnT = order.spawnIn ? 0.6 : 0;
    e.r = def.radius * (mod ? 1.22 : 1);
    e.maxHp = Math.round(def.hp * sc.hp * (mod?.hp ?? 1));
    e.hp = e.maxHp;
    e.dmg = def.dmg * sc.dmg * (mod?.dmg ?? 1);
    e.speed = def.speed * sc.speed * (mod?.speed ?? 1);
    e.score = Math.round(def.score * sc.score * SCORE_SCALE * (mod ? 2.4 : 1));
    e.xp = Math.round(def.xp * (mod ? 2.6 : 1));
    e.armor = (def.armor ?? 0) + (mod?.armor ?? 0);
    e.color = mod?.color ?? def.color;
    e.color2 = def.color2;
    e.ai = def.ai;
    e.elite = elite;
    e.eliteMod = mod;
    e.t = rng.float() * 10;
    e.flash = 0;
    e.slowT = 0; e.slowAmt = 0;
    e.burnT = 0; e.burnDmg = 0;
    e.stunT = 0;
    e.gunT = def.gun ? rng.range(0.6, def.gun.cooldown) : 0;
    e.charge = 0;
    e.aim = Math.PI / 2;
    e.vx = rng.range(-18, 18);
    e.vy = 0;
    e.phase = rng.float() * TAU;
    e.chargeState = 'idle';
    e.chargeT = 0;
    e.trailT = 0;
    e.orbitA = rng.float() * TAU;
    e.hitFlashT = 0;
    e.knockX = 0; e.knockY = 0;

    this.spawnedThisWave++;
    this.totalSpawned++;
    // Met counts, not just killed — the bestiary should list the thing that
    // ran you over as well as the things you got.
    this.run.noteType?.(e, 0);
    return e;
  }

  /** Direct spawn used by splitters, boss minions and hazards. */
  spawnAt(typeId, x, y, opts = {}) {
    const order = { x: x / this.run.view.w, y: y / this.run.view.h, type: typeId, ...opts };
    const e = this.spawn(order);
    if (e && opts.hpMul) { e.maxHp = Math.max(1, Math.round(e.maxHp * opts.hpMul)); e.hp = e.maxHp; }
    if (e && opts.scale) e.r *= opts.scale;
    return e;
  }

  /** Progress through the current wave, 0..1 — drives the HUD ring. */
  get progress() {
    if (this.phase === 'boss') {
      return this.bossRef ? 1 - this.bossRef.hp / this.bossRef.maxHp : 1;
    }
    if (this.phase === 'breath') return 1;
    const planned = this.spawnedThisWave + this.queue.length;
    if (!planned) return 0;
    return clamp(this.killedThisWave / planned, 0, 1);
  }
}

export { WAVE_TIME, BOSS_EVERY };
