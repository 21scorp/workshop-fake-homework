/**
 * RunScene.js — the run itself.
 *
 * Everything that happens between "GO" and the results card. Owns the player,
 * every pool, the wave director, collision, scoring and the run's state machine.
 *
 * State machine:  intro → play ⇄ levelup → dead → (results, handled by UI)
 *
 * Determinism note: all gameplay randomness draws from `this.rng`, seeded by the
 * run seed. Purely cosmetic randomness uses the cosmetic stream. That split is
 * what lets two players on opposite sides of the world fight the identical wave
 * while their particles differ.
 */

import { Scene } from '../core/Game.js';
import { Pool, Ring } from '../core/Pool.js';
import { Particles } from '../fx/Particles.js';
import { ScreenFX, Starfield } from '../fx/Screen.js';
import { Environment, biomeForWave } from '../fx/Environment.js';
import { Tweens } from '../core/Tween.js';
import { RNG } from '../core/RNG.js';
import Assets from '../core/AssetRegistry.js';
import { bus, EV } from '../core/Events.js';
import { Sfx, Music } from '../core/Audio.js';
import { haptic } from '../core/Input.js';
import { save } from '../core/Save.js';
import {
  clamp, clamp01, TAU, dist2, angleTo, lerp, damp, abbrev,
} from '../core/Math2.js';
import { hexA, mixHex } from '../core/Renderer.js';

import { getAstra, STARTER_ID, astraSprite } from '../data/astra.js';

/** Elements Prism refracts through, one per hit. */
const ELEMENTAL_CYCLE = ['ember', 'tide', 'gale', 'terra', 'lumen'];
import { starPower, SCORE_SCALE } from '../data/constants.js';
import { blankMods, CARDS, CARD_WEIGHTS, getCard } from '../data/cards.js';
import { ENEMY } from '../data/enemies.js';
import { WaveDirector } from './WaveDirector.js';
import { resolveSupports } from '../systems/Loadout.js';
import { currentSkin } from '../systems/Skins.js';
import { updateWeapon, fireEchoes, nearestEnemy } from './Weapons.js';
import { fireUlt } from './Ults.js';

/**
 * Ceiling on simultaneous hostile projectiles. Tuned from a deep-run probe:
 * past roughly this many the pattern reads as noise rather than as something
 * you can thread.
 */
const MAX_ENEMY_BULLETS = 190;

/* ------------------------------------------------------------------
   Pool factories
   ------------------------------------------------------------------ */

const blankBullet = () => ({
  _alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 6, dmg: 1, life: 2, t: 0,
  sprite: 'bullet/basic', color: '#fff', color2: '#fff', angle: 0, speed: 0,
  pierce: 0, hits: 0, chains: 0, chainRange: 160, homing: 0, target: null,
  bounce: 0, slow: 0, burn: 0, knockback: 0, splash: 0, crit: false, split: 0,
  owner: 'player', orbit: false, orbitAngle: 0, orbitRadius: 0, orbitSpeed: 0,
  amplitude: 0, wavePhase: 0, waveDir: 1, gravity: 0, drag: 0, accel: 0,
  boomerang: false, returnTime: 0, pullRadius: 0, pullForce: 0,
  cooldownMap: null, temporary: false, hitIds: null, prevX: 0, prevY: 0,
});

const resetBullet = (b) => {
  b.pierce = 0; b.hits = 0; b.chains = 0; b.homing = 0; b.target = null;
  b.bounce = 0; b.slow = 0; b.burn = 0; b.knockback = 0; b.splash = 0;
  b.crit = false; b.split = 0; b.orbit = false; b.amplitude = 0; b.gravity = 0;
  b.drag = 0; b.accel = 0; b.boomerang = false; b.pullRadius = 0; b.pullForce = 0;
  b.cooldownMap = null; b.temporary = false; b.t = 0; b.owner = 'player';
  b.hitIds = null; b.life = 2;
};

const blankEnemy = () => ({
  _alive: false, id: 0, type: 'drone', def: null, sprite: 'enemy/drone',
  x: 0, y: 0, vx: 0, vy: 0, r: 16, hp: 1, maxHp: 1, dmg: 1, speed: 100,
  score: 10, xp: 3, armor: 0, color: '#f43f5e', color2: '#fff', ai: 'dive',
  elite: null, eliteMod: null, t: 0, flash: 0, slowT: 0, slowAmt: 0,
  burnT: 0, burnDmg: 0, stunT: 0, gunT: 0, charge: 0, aim: 1.57,
  phase: 0, chargeState: 'idle', chargeT: 0, trailT: 0, orbitA: 0, weak: 0,
  knockX: 0, knockY: 0, marked: 0, spawnIn: false, spawnT: 0, isBoss: false,
});

const resetEnemy = (e) => {
  e.elite = null; e.eliteMod = null; e.flash = 0; e.slowT = 0; e.slowAmt = 0;
  e.weak = 0;
  e.burnT = 0; e.burnDmg = 0; e.stunT = 0; e.marked = 0; e.isBoss = false;
  e.knockX = 0; e.knockY = 0; e.charge = 0; e.spawnIn = false; e.spawnT = 0;
};

const blankPickup = () => ({
  _alive: false, kind: 'prism', x: 0, y: 0, vx: 0, vy: 0, r: 9, t: 0,
  value: 1, color: '#67e8f9', life: 14, magnetised: false, sprite: 'pickup/prism',
});
const resetPickup = (p) => { p.magnetised = false; p.t = 0; p.life = 14; p.value = 1; };

const blankHazard = () => ({
  _alive: false, kind: 'zone', shape: 'rect', x: 0, y: 0, w: 0, h: 0, r: 0,
  life: 1, maxLife: 1, dps: 0, color: '#fff', friendly: true, tick: 0,
  pull: 0, slow: 0, swirl: false, detonate: 0, riseSpeed: 0,
  sweepFrom: 0, sweepTo: 0, dmg: 0, stun: 0, knockback: 0, big: false, radius: 0,
});
const resetHazard = (z) => {
  z.pull = 0; z.slow = 0; z.swirl = false; z.detonate = 0; z.riseSpeed = 0;
  z.tick = 0; z.big = false; z.stun = 0; z.knockback = 0;
};

/* ================================================================== */

export class RunScene extends Scene {
  constructor(game) {
    super(game);
    this.clearColor = '#05060f';

    this.bullets = new Pool(blankBullet, resetBullet, 200);
    this.ebullets = new Pool(blankBullet, resetBullet, 200);
    this.enemies = new Pool(blankEnemy, resetEnemy, 80);
    this.pickups = new Pool(blankPickup, resetPickup, 120);
    this.hazards = new Pool(blankHazard, resetHazard, 24);

    this.fx = new Particles(1500);
    this.tweens = new Tweens();
    this.timers = [];
    this.pendingEcho = [];
    this.trail = new Ring(22, () => ({ x: 0, y: 0, a: 0 }));

    this.state = 'intro';
    this.enemyId = 1;
  }

  get view() { return this.game.renderer.view; }

  /* ============================================================
     ENTER
     ============================================================ */

  enter(params = {}) {
    const p = save.profile;
    const view = this.view;

    this.seed = params.seed || 'FREE' + Math.floor(Math.random() * 1e6).toString(36).toUpperCase();
    this.isDaily = !!params.daily;
    this.rng = new RNG(`run|${this.seed}`);

    this.astraId = params.astraId || p.equipped || STARTER_ID;
    this.astra = getAstra(this.astraId) ?? getAstra(STARTER_ID);
    // A trial flight loans an Astra you don't own, so the star level comes
    // from the caller rather than from the collection.
    this.isTrial = !!params.trial;
    this.stars = params.stars ?? p.collection[this.astraId]?.stars ?? 1;

    // Support Astra are read once, at run start: swapping mid-run isn't a
    // thing, and re-reading the profile every frame would be a trap.
    this.supports = params.trial ? [] : resolveSupports();
    this.skin = currentSkin();

    this.mods = blankMods();
    this.cardStacks = {};
    this.cards = [];

    this.player = {
      x: view.w / 2, y: view.h * 0.78,
      vx: 0, vy: 0, tilt: 0, thrust: 0,
      hp: 3, maxHp: 3, invuln: 1.2, shield: 0, shieldT: 0,
      ramT: 0, ramSpeed: 1, r: 15, flash: 0,
      killsSinceHeal: 0,
    };

    this.score = 0;
    this.kills = 0;
    // Per-type tally for the bestiary. Accumulated here and written once at
    // the end of the run — a save write per kill would land in the hot loop.
    this.seenTypes = new Map();
    this.level = 1;
    this.xp = 0;
    this.xpNeed = 8;
    this.combo = 0;
    this.comboT = 0;
    this.maxCombo = 0;
    this.ult = 0;
    this.ultMax = 100;
    this.ultsFired = 0;
    this.bossesKilled = 0;
    this.hitsTaken = 0;
    this.time = 0;
    this.fireTimer = 0;
    this.revivesLeft = 0;
    this.passiveKey = this.astra.passive?.key ?? null;
    this.heat = 0;           // OVERVERHITTING build-up
    this.overheatMul = 1;
    this.tailwind = 0;       // Zephyr: fire-rate stacks that decay
    this.untouchedT = 0;     // Carousel: seconds since the last hit taken
    this.bossMusicT = 0;     // countdown to handing the boss track back
    this.tailwindT = 0;
    this.hitCount = 0;       // Basalt: every 4th hit shockwaves
    this.feastKills = 0;     // Umbra: heal every 25 kills
    this.timeFreeze = 0;
    this.markMul = 1;
    this.markT = 0;
    this.bossRef = null;
    this.banner = null;
    this.runCoins = 0;
    this.enemyId = 1;
    this.edt = 0;
    this.beam = { active: false, x: 0, y: 0, width: 0, dmg: 0, heat: 0, color: '#fff', color2: '#fff', tick: 0 };

    this.screen = new ScreenFX(this.game.renderer);
    this.stars_bg = new Starfield(view, { layers: 3, count: 140 });
    this.env = new Environment(view);
    this.director = new WaveDirector(this, this.rng.fork('waves'));

    this.applyMetaUpgrades();
    this.applySupports();
    this.resolveStats();
    this.player.hp = this.player.maxHp;

    this.state = 'intro';
    this.introT = 0;
    this.deathT = 0;
    this.pendingCards = null;

    this.game.uiRoot.replaceChildren();
    bus.emit(EV.RUN_START, { seed: this.seed, astraId: this.astraId, daily: this.isDaily });
    Music.start('run');
    Music.setIntensity(0.35);
  }

  exit() {
    this.screen.reset();
    this.tweens.killAll();
    this.timers.length = 0;
    bus.emit(EV.RUN_TICK, null);
  }

  /* ============================================================
     STATS
     ============================================================ */

  /** Support Astra fold into the same modifier bag as everything else. */
  applySupports() {
    const m = this.mods;
    this.supportElements = [];
    for (const s of this.supports) {
      const b = s.bonus;
      m.damageMul += b.damage;
      m.fireRateMul += b.fireRate;
      m.magnetMul += b.magnet;
      m.ultChargeMul += b.ultCharge;
      m.maxHp += b.hp;
      this.supportElements.push({ element: b.element, power: b.elementPower });
    }
  }

  /** Permanent meta upgrades bought with Cores fold straight into mods. */
  applyMetaUpgrades() {
    const up = save.profile.meta.upgrades || {};
    const m = this.mods;
    if (up.hp) m.maxHp += up.hp;
    if (up.power) m.damageMul += up.power * 0.05;
    if (up.rate) m.fireRateMul += up.rate * 0.04;
    if (up.magnet) m.magnetMul += up.magnet * 0.15;
    if (up.xp) m.xpMul += up.xp * 0.06;
    if (up.ult) m.ultChargeMul += up.ult * 0.08;
    if (up.luck) m.luck += up.luck * 0.05;
  }

  /** Base × star × cards. Recomputed on every card pick, never per frame. */
  resolveStats() {
    const a = this.astra;
    const m = this.mods;
    const sp = starPower(this.stars);
    const b = a.stats;

    const s = {
      damage: b.power * sp * m.damageMul,
      fireRate: b.fireRate * m.fireRateMul,
      projectiles: b.projectiles + m.projectiles,
      spread: b.spread,
      moveSpeed: 1150 * b.speed * m.moveMul,
      magnet: 96 * b.magnet * m.magnetMul,
      crit: clamp01(b.crit + m.crit),
      critDmg: b.critDmg + m.critDmg,
      pierce: m.pierce,
      chains: m.chains,
      homing: m.homing,
      bounce: m.bounce,
      bulletSize: m.bulletSize,
      bulletSpeedMul: m.bulletSpeedMul,
      xpMul: m.xpMul,
      luck: m.luck,
      thorns: m.thorns,
      echo: m.echo,
      misfire: m.misfire,
      overheat: m.overheat,
      prismUlt: m.prismUlt,
      pickupLife: m.pickupLife,
      element: a.element,
      color: a.colors.primary,
      color2: a.colors.secondary,
    };

    /* ---- Astra passives that are pure stat edits ----
       Everything the collection screen promises has to be true somewhere.
       The flat ones fold in here; the situational ones are handled in the
       gameplay hooks below (see `passiveKey`). */
    switch (a.passive?.key) {
      case 'bulwark':  m.maxHp = Math.max(m.maxHp, m.maxHp + 1); break;
      case 'unmoved':  m.maxHp += 2; s.moveSpeed *= 0.85; break;
      case 'swift':    s.moveSpeed *= 1.12; break;
      case 'undertow': s.pierce += 2; break;
      case 'refract':  s.chains += 2; break;
      case 'shell':    m.shieldRegen = Math.max(m.shieldRegen, 1); break;
      case 'draft':    s.bulletSpeedMul *= 1.1; break;
    }

    // HP is special: it can be forced (GLASKANON) and must not heal on rebuild.
    const wantMax = m.forceHp ? m.forceHp : Math.round(b.hp + m.maxHp);
    const delta = wantMax - this.player.maxHp;
    this.player.maxHp = Math.max(1, wantMax);
    if (delta > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + delta);
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);

    if (m.healNow > 0) { this.healPlayer(m.healNow); m.healNow = 0; }
    this.revivesLeft = m.revives + (a.passive?.key === 'rewind' ? 1 : 0);
    this.ultMax = (a.ult?.cost ?? 100) / m.ultChargeMul;

    this.stats = s;
    return s;
  }

  /* ============================================================
     UPDATE
     ============================================================ */

  /**
   * Hand the boss track back to the run track.
   *
   * This lives in realUpdate, not in updatePlay, and is not a scheduled
   * callback. Killing a boss is enough XP to level up, so by the time any
   * play-state timer would fire the run is sitting on the card screen with
   * its simulation frozen — and the boss track stayed on for the rest of the
   * run. Unscaled real time also means it is not stretched by slow-motion.
   */
  updateBossMusic(dt) {
    if (this.bossMusicT > 0) {
      this.bossMusicT -= dt;
      if (this.bossMusicT <= 0) Music.start('run', { fade: 1.2 });
    } else if (this.state !== 'dead' && Music.trackName === 'boss' && !this.bossRef?._alive) {
      this.bossMusicT = 1.6;
    }
  }

  update(dt) {
    switch (this.state) {
      case 'intro':   this.updateIntro(dt); break;
      case 'play':    this.updatePlay(dt); break;
      case 'levelup': this.updateFrozen(dt); break;
      case 'dead':    this.updateDeath(dt); break;
    }
  }

  realUpdate(dt) {
    this.updateBossMusic(dt);
    this.screen.update(dt);
    const bgScale = this.state === 'play' ? 1 : 0.3;
    this.stars_bg.update(dt * bgScale);
    this.env.speed = this.state === 'intro' ? 4 : 1;
    this.env.update(dt * bgScale);
    this.tweens.update(dt);
    if (this.state === 'play' || this.state === 'intro') this.fx.update(dt);
  }

  updateIntro(dt) {
    this.introT += dt;
    this.stars_bg.warp = clamp01(1 - this.introT / 0.9) * 0.8;
    if (this.introT > 1.15) {
      this.state = 'play';
      this.stars_bg.warp = 0;
      this.director.breathTime = 0.4;
      bus.emit(EV.TOAST, { text: 'GO', tone: 'good', ttl: 800 });
      Sfx.play('confirm');
    }
  }

  /** Level-up freeze: only cosmetics keep moving. */
  updateFrozen(dt) {
    this.fx.update(dt * 0.25);
  }

  updatePlay(dt) {
    this.time += dt;

    // Time-stop only halts hostiles.
    let edt = dt * this.mods.enemyTimeScale;
    if (this.timeFreeze > 0) { this.timeFreeze -= dt; edt = 0; }
    this.edt = edt;

    this.runTimers(dt);
    this.updatePlayer(dt);
    this.game.onboarding?.tick(this, this.game.input);

    this.beam.active = false;
    updateWeapon(this, dt);
    fireEchoes(this, dt);
    if (!this.beam.active) this.beam.heat = Math.max(0, this.beam.heat - dt * 1.4);

    this.director.update(edt);
    this.updateEnemies(edt);
    this.updateBullets(dt);
    this.updateEnemyBullets(edt);
    this.updatePickups(dt);
    this.updateHazards(dt);
    this.updateBeam(dt);
    this.updateCombo(dt);
    this.updateAuras(dt);
    this.updatePassives(dt);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.dur) this.banner = null;
    }

    if (this.markT > 0) { this.markT -= dt; if (this.markT <= 0) this.markMul = 1; }

    // Danger read-out drives music intensity and the red vignette.
    const hpFrac = this.player.hp / this.player.maxHp;
    const pressure = clamp01(this.enemies.count / 26) * 0.5 + (1 - hpFrac) * 0.5;
    this.screen.setDanger(hpFrac <= 0.34 ? 1 - hpFrac : 0);
    Music.setIntensity(clamp01(0.3 + pressure * 0.7));

    this.emitHud();
  }

  updateDeath(dt) {
    this.deathT += dt;
    this.fx.update(dt);
    this.updateBullets(dt * 0.3);
    this.updateEnemies(dt * 0.2);
  }

  /* ------------------------------------------------------------
     PLAYER
     ------------------------------------------------------------ */

  updatePlayer(dt) {
    const p = this.player;
    const input = this.game.input;
    const view = this.view;

    // Relative drag: the thumb never covers the ship. 1.35× amplification
    // means a small thumb sweep crosses the whole screen.
    const AMP = 1.35;
    const speed = this.stats.moveSpeed * (p.ramT > 0 ? p.ramSpeed : 1);
    let dx = input.dx * AMP;
    let dy = input.dy * AMP;

    const maxStep = speed * dt;
    const mag = Math.hypot(dx, dy);
    if (mag > maxStep) { dx = dx / mag * maxStep; dy = dy / mag * maxStep; }

    p.x += dx;
    p.y += dy;

    const pad = 26;
    p.x = clamp(p.x, pad, view.w - pad);
    p.y = clamp(p.y, view.h * 0.22, view.h - pad - 40);

    // Tilt and thrust are pure presentation, smoothed so they never snap.
    p.tilt = damp(p.tilt, clamp(dx / (maxStep || 1), -1, 1), 12, dt);
    p.thrust = damp(p.thrust, clamp01(mag / (maxStep || 1)), 9, dt);

    if (p.invuln > 0) p.invuln -= dt;
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 5);
    if (p.ramT > 0) {
      p.ramT -= dt;
      this.enemies.each((e) => {
        if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r + 18) ** 2) {
          this.damageEnemy(e, this.stats.damage * 3, { source: 'ram' });
        }
      });
    }

    // Shield regen card.
    if (this.mods.shieldRegen > 0) {
      p.shieldT -= dt;
      if (p.shieldT <= 0 && p.shield < this.mods.shieldRegen) {
        p.shield++;
        p.shieldT = 14 / this.mods.shieldRegen;
        this.fx.absorb(p.x, p.y, '#67e8f9');
        Sfx.play('coin');
      }
    }

    // Motion trail.
    const slot = this.trail.push();
    slot.x = p.x; slot.y = p.y; slot.a = p.tilt;

    if (p.thrust > 0.25 && this.game.frame % 2 === 0) {
      this.fx.trail(p.x, p.y + 18, this.stats.color2, 2.5, 0.26);
    }
  }

  hitPlayer(amount = 1, fromX = 0, fromY = 0) {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'play') return false;

    this.untouchedT = 0;

    if (p.shield > 0) {
      p.shield--;
      p.invuln = 0.7;
      this.fx.burst(p.x, p.y, '#67e8f9', 1.1);
      this.screen.shake(0.3);
      this.screen.doFlash(0.2, '#a5f3fc');
      Sfx.play('coin');
      haptic('medium');
      return false;
    }

    p.hp -= amount;
    this.hitsTaken++;
    p.invuln = 1.35 * this.mods.iframeMul;
    p.flash = 1;
    this.combo = 0;

    this.fx.burst(p.x, p.y, '#f43f5e', 1.4);
    this.screen.shake(0.62, p.x - fromX, p.y - fromY);
    this.screen.doFlash(0.42, '#f43f5e');
    this.game.hitstop(0.075);
    Sfx.play('hurt', { gate: 0 });
    haptic('heavy');
    bus.emit(EV.PLAYER_HIT, { hp: p.hp });

    if (p.hp <= 0) this.onPlayerDead();
    else if (p.hp === 1) {
      bus.emit(EV.NEAR_DEATH);
      this.game.slowmo(0.35, 0.7);
      bus.emit(EV.TOAST, { text: 'LAATSTE ADEM', tone: 'bad', ttl: 1400 });
    }
    return true;
  }

  healPlayer(n = 1) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    if (p.hp > before) {
      this.fx.ascend(p.x, p.y, '#34d399', 140);
      this.fx.number(p.x, p.y - 40, `+${p.hp - before}`, '#34d399', 30);
      Sfx.play('levelup');
    }
  }

  onPlayerDead() {
    if (this.revivesLeft > 0) {
      this.revivesLeft--;
      this.player.hp = 3;
      this.player.invuln = 3;
      this.clearEnemyBullets();
      this.fx.explosion(this.player.x, this.player.y, '#ff5cf0', 2.6);
      this.screen.doFlash(0.85, '#ff5cf0');
      this.screen.shake(1);
      this.game.hitstop(0.22);
      Sfx.play('ultimate');
      bus.emit(EV.TOAST, { text: '✦ HERREZEN ✦', tone: 'gold', ttl: 2200 });
      haptic('legendary');
      return;
    }

    this.state = 'dead';
    this.deathT = 0;
    this.player.hp = 0;
    this.game.slowmo(0.12, 1.4);
    this.screen.shake(1);
    this.screen.doFlash(0.7, '#f43f5e');
    this.fx.explosion(this.player.x, this.player.y, '#f43f5e', 2.8);
    Sfx.play('death');
    Music.stop({ fade: 1.2 });
    haptic('fail');
    bus.emit(EV.PLAYER_DEAD);

    this.game.uiRoot.replaceChildren();
    setTimeout(() => this.finish(true), 1500);
  }

  finish(died) {
    const result = {
      score: Math.round(this.score),
      wave: this.director.wave,
      time: this.time,
      kills: this.kills,
      maxCombo: this.maxCombo,
      level: this.level,
      cards: this.cards,
      astraId: this.astraId,
      seed: this.seed,
      isDaily: this.isDaily,
      isTrial: this.isTrial,
      bossesKilled: this.bossesKilled,
      ultsFired: this.ultsFired,
      hitsTaken: this.hitsTaken,
      bestiary: Object.fromEntries(this.seenTypes),
      died,
    };
    bus.emit(EV.RUN_END, result);
  }

  /* ------------------------------------------------------------
     BULLETS (player)
     ------------------------------------------------------------ */

  updateBullets(dt) {
    const view = this.view;
    const p = this.player;

    this.bullets.each((b) => {
      b.t += dt;
      b.prevX = b.x; b.prevY = b.y;

      if (b.orbit) {
        b.orbitAngle += b.orbitSpeed * dt;
        b.x = p.x + Math.cos(b.orbitAngle) * b.orbitRadius;
        b.y = p.y + Math.sin(b.orbitAngle) * b.orbitRadius * 0.85;
        b.life -= dt;
        if (b.life <= 0) { b._alive = false; return; }
        this.collideOrbiter(b, dt);
        return;
      }

      // Steering
      if (b.homing > 0) {
        if (!b.target || !b.target._alive) b.target = nearestEnemy(this, b.x, b.y, 640);
        if (b.target) {
          const want = angleTo(b.x, b.y, b.target.x, b.target.y);
          let d = want - b.angle;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          b.angle += clamp(d, -b.homing * dt, b.homing * dt);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(b.angle) * sp;
          b.vy = Math.sin(b.angle) * sp;
        }
      }

      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy) + b.accel * dt;
        b.vx = Math.cos(b.angle) * sp;
        b.vy = Math.sin(b.angle) * sp;
      }
      if (b.gravity) b.vy += b.gravity * dt;
      if (b.drag) { const k = Math.exp(-b.drag * dt); b.vx *= k; b.vy *= k; }

      if (b.boomerang) {
        const half = b.returnTime;
        if (b.t > half && b.t < half * 2.4) {
          const back = angleTo(b.x, b.y, p.x, p.y);
          const sp = Math.hypot(b.vx, b.vy);
          b.angle = lerp(b.angle, back, clamp01(dt * 5));
          b.vx = Math.cos(b.angle) * sp;
          b.vy = Math.sin(b.angle) * sp;
          if (dist2(b.x, b.y, p.x, p.y) < 900) { b._alive = false; return; }
        }
      }

      if (b.amplitude) {
        const perp = b.angle + Math.PI / 2;
        const off = Math.sin(b.t * 9 + b.wavePhase) * b.amplitude * b.waveDir;
        b.x += Math.cos(perp) * off * dt * 3;
        b.y += Math.sin(perp) * off * dt * 3;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.pullRadius) this.applyPull(b.x, b.y, b.pullRadius, b.pullForce, dt);

      // Bounce off the walls.
      if (b.bounce > 0) {
        const before = b.bounce;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); b.bounce--; b.angle = Math.atan2(b.vy, b.vx); }
        else if (b.x > view.w - b.r) { b.x = view.w - b.r; b.vx = -Math.abs(b.vx); b.bounce--; b.angle = Math.atan2(b.vy, b.vx); }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); b.bounce--; b.angle = Math.atan2(b.vy, b.vx); }
        // Ricochet turns a miss into a threat: each wall it takes makes the
        // shot worth more, so the narrow lanes late on become an advantage.
        if (b.owner === 'player' && this.passiveKey === 'carom' && b.bounce < before) {
          b.dmg *= 1 + 0.35 * (before - b.bounce);
          b.r *= 1.08;
        }
      }

      b.life -= dt;
      if (b.life <= 0 || b.y < -80 || b.y > view.h + 80 || b.x < -80 || b.x > view.w + 80) {
        b._alive = false;
        return;
      }

      this.collideBullet(b);
    });

    this.bullets.sweep();
  }

  /** Swept circle test so fast bullets can't tunnel through small enemies. */
  collideBullet(b) {
    let hit = null;
    let bestD = Infinity;
    this.enemies.each((e) => {
      if (e.spawnT > 0) return;
      if (b.hitIds && b.hitIds.has(e.id)) return;
      const rr = (e.r + b.r) ** 2;
      const d = dist2(b.x, b.y, e.x, e.y);
      if (d <= rr && d < bestD) { bestD = d; hit = e; }
    });
    if (!hit) return;

    this.damageEnemy(hit, b.dmg, {
      crit: b.crit, knockback: b.knockback, source: 'bullet',
      fromX: b.prevX, fromY: b.prevY,
    });

    if (b.burn) this.applyBurn(hit, b.burn * 2, b.dmg * 0.3);
    if (b.slow) { hit.slowT = Math.max(hit.slowT, 2); hit.slowAmt = Math.max(hit.slowAmt, b.slow); }
    if (b.splash) this.spawnShockwave(b.x, b.y, b.splash, b.dmg * 0.6, { color: b.color, knockback: 90 });

    if (b.chains > 0) this.doChain(b, hit);

    if (b.split > 0) {
      const n = b.split;
      for (let i = 0; i < n; i++) {
        const child = this.bullets.spawn();
        Object.assign(child, b);
        child.split = 0;
        child.pierce = 0;
        child.hits = 0;
        child.life = 1.1;
        child.r = b.r * 0.7;
        child.dmg = b.dmg * 0.55;
        child.hitIds = null;
        const a = b.angle + (i - (n - 1) / 2) * 0.7;
        child.angle = a;
        const sp = Math.hypot(b.vx, b.vy) * 0.85;
        child.vx = Math.cos(a) * sp;
        child.vy = Math.sin(a) * sp;
        child.x = b.x; child.y = b.y;
      }
    }

    b.hits++;
    if (b.pierce >= 99) {
      (b.hitIds ??= new Set()).add(hit.id);
    } else if (b.hits > b.pierce) {
      b._alive = false;
    } else {
      (b.hitIds ??= new Set()).add(hit.id);
    }
  }

  /** Orbiters damage on a per-enemy cooldown instead of dying on contact. */
  collideOrbiter(b, dt) {
    const map = b.cooldownMap ??= new Map();
    this.enemies.each((e) => {
      const cd = map.get(e.id) ?? 0;
      if (cd > 0) { map.set(e.id, cd - dt); return; }
      if (dist2(b.x, b.y, e.x, e.y) <= (e.r + b.r) ** 2) {
        this.damageEnemy(e, b.dmg, { source: 'orbit', knockback: 40 });
        map.set(e.id, 0.35);
      }
    });
  }

  doChain(b, from) {
    let src = from;
    const hitIds = new Set([from.id]);
    for (let i = 0; i < b.chains; i++) {
      let next = null, bestD = (b.chainRange || 160) ** 2;
      this.enemies.each((e) => {
        if (hitIds.has(e.id)) return;
        const d = dist2(src.x, src.y, e.x, e.y);
        if (d < bestD) { bestD = d; next = e; }
      });
      if (!next) break;
      hitIds.add(next.id);
      this.damageEnemy(next, b.dmg * 0.6, { source: 'chain' });
      this.spawnArc(src.x, src.y, next.x, next.y, b.color);
      src = next;
    }
  }

  spawnArc(x1, y1, x2, y2, color) {
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fx.emit({
        x: lerp(x1, x2, t) + (Math.random() - 0.5) * 14,
        y: lerp(y1, y2, t) + (Math.random() - 0.5) * 14,
        life: 0.16, size: 3, color, shape: 1, glow: 2, weight: 0.5, layer: 1,
      });
    }
  }

  /* ------------------------------------------------------------
     ENEMY BULLETS
     ------------------------------------------------------------ */

  updateEnemyBullets(dt) {
    const view = this.view;
    const p = this.player;
    this.ebullets.each((b) => {
      b.t += dt;
      if (b.homing > 0) {
        const want = angleTo(b.x, b.y, p.x, p.y);
        let d = want - b.angle;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        b.angle += clamp(d, -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(b.angle) * sp;
        b.vy = Math.sin(b.angle) * sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y > view.h + 60 || b.y < -140 || b.x < -80 || b.x > view.w + 80) {
        b._alive = false; return;
      }
      if (p.invuln <= 0 && dist2(b.x, b.y, p.x, p.y) < (p.r + b.r) ** 2) {
        this.hitPlayer(1, b.x, b.y);
        b._alive = false;
      }
    });
    this.ebullets.sweep();
  }

  clearEnemyBullets() {
    this.ebullets.each((b) => { this.fx.hit(b.x, b.y, '#a5f3fc', 0, 0.6); b._alive = false; });
  }

  spawnEnemyBullet(x, y, angle, speed, opts = {}) {
    // Hard ceiling on hostile fire.
    //
    // Late waves stack several shooters, a boss pattern and a spinner, and the
    // count climbed past 250 in testing — at which point the screen stops being
    // a bullet pattern and becomes a texture you cannot read. Retiring the
    // oldest shot keeps the newest, most relevant threats on screen and bounds
    // the chaos without touching how any single pattern is authored.
    if (this.ebullets.count >= MAX_ENEMY_BULLETS) {
      let oldest = null;
      this.ebullets.each((o) => { if (!oldest || o.t > oldest.t) oldest = o; });
      if (oldest) {
        this.fx.hit(oldest.x, oldest.y, oldest.color, 0, 0.4);
        oldest._alive = false;
      }
    }

    const b = this.ebullets.spawn();
    b.x = x; b.y = y;
    b.angle = angle;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.r = opts.r ?? 8;
    b.dmg = 1;
    b.life = opts.life ?? 6;
    b.sprite = 'bullet/enemy';
    b.color = opts.color ?? '#fb7185';
    b.color2 = '#fff';
    b.homing = opts.homing ?? 0;
    b.owner = 'enemy';
    b.t = 0;
    return b;
  }

  /* ------------------------------------------------------------
     ENEMIES
     ------------------------------------------------------------ */

  updateEnemies(dt) {
    const view = this.view;
    const p = this.player;

    this.enemies.each((e) => {
      e.t += dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 6);
      if (e.marked > 0) e.marked -= dt;
      if (e.weak > 0) e.weak -= dt;

      if (e.spawnT > 0) {
        e.spawnT -= dt;
        return;   // materialising — no movement, no collision
      }

      // Status effects
      let speedMul = 1;
      if (e.slowT > 0) { e.slowT -= dt; speedMul *= 1 - e.slowAmt; }
      if (e.stunT > 0) { e.stunT -= dt; speedMul = 0; }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick = (e.burnTick ?? 0) - dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.4;
          this.damageEnemy(e, e.burnDmg, { source: 'burn', silent: true });
          this.fx.emit({ x: e.x + (Math.random() - 0.5) * e.r, y: e.y, vy: -60, life: 0.4, size: 3, color: '#fb923c', shape: 1, weight: 0.3 });
        }
      }

      if (e.isBoss) { this.updateBoss(e, dt, speedMul); }
      else this.updateEnemyAI(e, dt, speedMul);

      // Knockback decays fast.
      if (e.knockX || e.knockY) {
        e.x += e.knockX * dt;
        e.y += e.knockY * dt;
        const k = Math.exp(-9 * dt);
        e.knockX *= k; e.knockY *= k;
        if (Math.abs(e.knockX) < 2) e.knockX = 0;
        if (Math.abs(e.knockY) < 2) e.knockY = 0;
      }

      // Weapons.
      if (e.def?.gun && e.stunT <= 0) this.updateEnemyGun(e, dt);

      // Hazard trails (weavers).
      if (e.def?.trail) {
        e.trailT -= dt;
        if (e.trailT <= 0) {
          e.trailT = e.def.trail.every;
          const z = this.hazards.spawn();
          z.kind = 'trail'; z.shape = 'circle';
          z.x = e.x; z.y = e.y; z.r = e.def.trail.radius;
          z.life = z.maxLife = e.def.trail.life;
          z.dps = 0; z.dmg = e.def.trail.dmg;
          z.color = e.color; z.friendly = false; z.tick = 0;
        }
      }

      // Contact with the player.
      if (e.def?.contact !== false && p.invuln <= 0 &&
          dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) ** 2) {
        this.hitPlayer(Math.max(1, Math.round(e.dmg)), e.x, e.y);
        if (this.stats.thorns > 0) {
          this.damageEnemy(e, this.stats.thorns, { source: 'thorns', crit: true });
        }
      }

      // Cull anything that has left the field for good.
      if (e.y > view.h + 140 || e.y < -420 || e.x < -220 || e.x > view.w + 220) {
        if (!e.isBoss) e._alive = false;
      }
    });

    this.enemies.sweep();
  }

  updateEnemyAI(e, dt, speedMul) {
    const p = this.player;
    const view = this.view;
    const sp = e.speed * speedMul;

    switch (e.ai) {
      case 'dive': {
        e.vy = sp;
        e.vx = Math.sin(e.t * 1.4 + e.phase) * 42;
        break;
      }
      case 'seek': {
        const a = angleTo(e.x, e.y, p.x, p.y);
        e.vx = damp(e.vx, Math.cos(a) * sp, 4, dt);
        e.vy = damp(e.vy, Math.sin(a) * sp, 4, dt);
        break;
      }
      case 'drift': {
        e.vy = sp * 0.8;
        e.vx = Math.sin(e.t * 2.2 + e.phase) * sp * 0.9;
        break;
      }
      case 'hover': {
        // Camping is not allowed: after a while the hold-band creeps down, so a
        // shooter the player is ignoring eventually forces the issue instead of
        // stalling the wave from a corner.
        const impatience = clamp((e.t - 10) / 22, 0, 1) * 0.34;
        const targetY = view.h * (0.14 + (e.phase % 1) * 0.2 + impatience);
        e.vy = e.y < targetY ? sp : (e.y > targetY + 30 ? -sp * 0.5 : Math.sin(e.t * 1.6) * 22);
        // Drift toward the player's column so it can be lined up and answered.
        e.vx = Math.sin(e.t * 0.9 + e.phase) * 62 + (p.x - e.x) * 0.55;
        break;
      }
      case 'orbit': {
        e.orbitA += dt * 1.1 * speedMul;
        const closing = clamp((e.t - 8) / 24, 0, 1);
        const cx = view.w / 2;
        const cy = view.h * (0.34 + closing * 0.2);
        const rx = view.w * (0.36 - closing * 0.12);
        const ry = view.h * 0.17;
        const tx = cx + Math.cos(e.orbitA + e.phase) * rx;
        const ty = cy + Math.sin(e.orbitA + e.phase) * ry;
        e.vx = (tx - e.x) * 3.2;
        e.vy = (ty - e.y) * 3.2;
        break;
      }
      case 'charge': {
        const c = e.def.charge;
        e.chargeT -= dt;
        if (e.chargeState === 'idle') {
          e.vy = sp * 0.5;
          e.vx = damp(e.vx, (p.x - e.x) * 0.8, 3, dt);
          if (e.chargeT <= 0 && e.y > 60) {
            e.chargeState = 'windup';
            e.chargeT = c.windup;
            e.charge = 0;
          }
        } else if (e.chargeState === 'windup') {
          e.charge = 1 - clamp01(e.chargeT / c.windup);
          e.vx = damp(e.vx, 0, 8, dt);
          e.vy = damp(e.vy, -40, 8, dt);
          if (e.chargeT <= 0) {
            const a = angleTo(e.x, e.y, p.x, p.y);
            e.dashVX = Math.cos(a) * c.dashSpeed;
            e.dashVY = Math.sin(a) * c.dashSpeed;
            e.chargeState = 'dash';
            e.chargeT = c.dashTime;
            Sfx.play('whoosh', { dur: 0.25, gate: 0.05 });
          }
        } else if (e.chargeState === 'dash') {
          e.charge = 0;
          e.vx = e.dashVX; e.vy = e.dashVY;
          this.fx.trail(e.x, e.y, e.color, 4, 0.3);
          if (e.chargeT <= 0) { e.chargeState = 'idle'; e.chargeT = c.cooldown; }
        }
        break;
      }
      default:
        e.vy = sp;
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.x = clamp(e.x, -60, view.w + 60);
    e.aim = angleTo(e.x, e.y, p.x, p.y);
  }

  updateEnemyGun(e, dt) {
    const g = e.def.gun;
    e.gunT -= dt;
    if (e.gunT <= g.charge && e.gunT > 0) {
      e.charge = 1 - e.gunT / g.charge;
    }
    if (e.gunT <= 0) {
      e.gunT = g.cooldown;
      e.charge = 0;
      const base = g.aimed ? e.aim : Math.PI / 2 + (g.spiral ? e.t * g.spiral * 6 : 0);
      const n = g.bullets;
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i / (n - (g.spread >= 6 ? 0 : 1)) - 0.5) * g.spread;
        this.spawnEnemyBullet(e.x, e.y + e.r * 0.4, base + off, g.speed, { color: e.color });
      }
      this.fx.muzzle(e.x, e.y + e.r * 0.4, Math.PI / 2, e.color);
      Sfx.play('laser', { pitch: 0.55, gate: 0.08 });
    }
  }

  /* ------------------------------------------------------------
     DAMAGE + DEATH
     ------------------------------------------------------------ */

  damageEnemy(e, amount, opts = {}) {
    if (!e._alive || e.spawnT > 0) return 0;

    let dmg = amount;

    // Nyx doesn't hunt what is strong — it hunts what is nearly finished.
    if (this.passiveKey === 'hunt' && !opts.crit &&
        e.hp / e.maxHp < 0.4 && this.rng.chance(0.35)) {
      dmg *= this.stats.critDmg;
      opts = { ...opts, crit: true };
    }
    if (e.armor) dmg *= 1 - clamp(e.armor, 0, 0.85);
    if (e.marked > 0) dmg *= this.markMul;
    if (e.weak > 0) dmg *= 1.3;
    dmg = Math.max(1, dmg);

    e.hp -= dmg;
    // Bosses are shot continuously; a full-strength flash would leave them
    // permanently white instead of reading as individual hits.
    e.flash = e.isBoss ? 0.55 : 1;

    if (opts.knockback) {
      const a = opts.fromX !== undefined ? angleTo(opts.fromX, opts.fromY, e.x, e.y) : -Math.PI / 2;
      e.knockX += Math.cos(a) * opts.knockback;
      e.knockY += Math.sin(a) * opts.knockback;
    }

    if (!opts.silent) {
      const dir = opts.fromX !== undefined ? angleTo(e.x, e.y, opts.fromX, opts.fromY) + Math.PI : -Math.PI / 2;
      this.fx.hit(e.x, e.y, opts.crit ? '#fff7ed' : e.color2, dir, opts.crit ? 1.5 : 1);
      Sfx.play('hit', { pitch: opts.crit ? 1.4 : 1, gate: 0.03 });
    }
    if (opts.crit) {
      this.fx.number(e.x, e.y - e.r, Math.round(dmg).toString(), '#fde047', 30);
      this.game.hitstop(0.02);
    }

    if (opts.source === 'bullet' || opts.source === 'beam') {
      this.applyElement(e, dmg, opts);

      // Supports lend their element too, but only some of the time. That's
      // what makes a lead/support combination feel like a blend rather than
      // like stacking two of everything.
      for (const se of this.supportElements ?? []) {
        if (this.rng.chance(se.power)) this.applyElement(e, dmg * 0.5, opts, se.element);
      }

      if (this.passiveKey === 'aftershock' && ++this.hitCount % 4 === 0) {
        // Basalt: the fourth blow always lands like the first one should have.
        this.spawnShockwave(e.x, e.y, 110, this.stats.damage * 0.8,
          { color: '#fbbf24', knockback: 130 });
      }
      if (this.passiveKey === 'sparks' && opts.crit && this.rng.chance(0.5)) {
        // Flint: a crit throws off a second spark at a neighbour.
        const other = nearestEnemy(this, e.x, e.y, 220);
        if (other && other !== e) {
          this.damageEnemy(other, dmg * 0.5, { source: 'spark' });
          this.spawnArc(e.x, e.y, other.x, other.y, '#fdba74');
        }
      }
    }

    if (e.hp <= 0) this.killEnemy(e, opts);
    return dmg;
  }

  /**
   * Element traits.
   *
   * These are the effects the collection screen advertises on every Astra, so
   * they have to actually exist. They are deliberately small — a trait should
   * colour how an Astra feels without competing with the card build for the
   * player's attention.
   */
  applyElement(e, dmg, opts, forceElement = null) {
    let el = forceElement ?? this.stats.element;
    // Prism refracts: every hit borrows a different element.
    if (el === 'prism') el = ELEMENTAL_CYCLE[(this.kills + e.id) % ELEMENTAL_CYCLE.length];

    switch (el) {
      case 'ember':
        this.applyBurn(e, 1.6, dmg * 0.22);
        break;
      case 'tide':
        e.slowT = Math.max(e.slowT, 1.6);
        e.slowAmt = Math.max(e.slowAmt, 0.24);
        break;
      case 'gale':
        if (this.rng.chance(0.12)) {
          e.knockY -= 260;
          e.knockX += this.rng.range(-90, 90);
        }
        break;
      case 'terra': {
        // Fracture: a quarter of the hit shudders into everything nearby.
        const r2 = 92 * 92;
        this.enemies.each((o) => {
          if (o === e || !o._alive) return;
          if (dist2(o.x, o.y, e.x, e.y) > r2) return;
          o.hp -= dmg * 0.25;
          o.flash = Math.max(o.flash, 0.6);
          if (o.hp <= 0) this.killEnemy(o, { source: 'fracture' });
        });
        break;
      }
      case 'lumen':
        if (opts.crit) {
          e.weak = Math.max(e.weak ?? 0, 3);
          this.fx.emit({ x: e.x, y: e.y, life: 0.3, size: e.r, size2: e.r * 2.2,
                         color: '#fef9c3', shape: 2, weight: 0.6, layer: 1 });
        }
        break;
      // 'void' resolves on kill, in killEnemy.
    }
  }

  applyBurn(e, seconds, dmgPerTick) {
    e.burnT = Math.max(e.burnT, seconds);
    e.burnDmg = Math.max(e.burnDmg, dmgPerTick);
  }

  /** Record an encounter (and optionally a kill) for the bestiary. */
  noteType(e, killed = 0) {
    const id = e.isBoss ? `boss/${e.type}` : e.type;
    if (!id) return;
    const cur = this.seenTypes.get(id) ?? { seen: 0, kills: 0 };
    // Counted once at spawn, never again on death — otherwise every enemy you
    // actually killed is counted twice and "met" drifts above what appeared.
    if (killed) cur.kills += killed;
    else cur.seen++;
    this.seenTypes.set(id, cur);
  }

  killEnemy(e, opts = {}) {
    if (!e._alive) return;
    e._alive = false;

    this.kills++;
    this.noteType(e, 1);
    this.director.killedThisWave++;
    this.combo++;
    this.comboT = 2.6;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    const comboMul = 1 + Math.min(this.combo, 60) * 0.02;
    const gained = Math.round(e.score * comboMul);
    this.score += gained;

    const ultBefore = this.ult;
    this.ult = Math.min(this.ultMax, this.ult + (e.isBoss ? 40 : e.elite ? 8 : 2.2));
    if (ultBefore < this.ultMax && this.ult >= this.ultMax) bus.emit(EV.ULT_READY);

    // Visuals scale with how big a deal the kill was.
    const power = e.isBoss ? 3 : e.elite ? 1.7 : clamp(e.r / 20, 0.7, 1.6);
    if (e.isBoss || e.elite) {
      this.fx.explosion(e.x, e.y, e.color, power);
      this.screen.shake(e.isBoss ? 1 : 0.45);
      this.game.hitstop(e.isBoss ? 0.16 : 0.05);
      Sfx.play('explode', { size: power * 0.7, gate: 0 });
    } else {
      this.fx.burst(e.x, e.y, e.color, power, e.color2);
      Sfx.play('explode', { size: 0.35, gate: 0.02 });
    }

    // Drops.
    const xpValue = Math.max(1, Math.round(e.xp));
    const shards = clamp(Math.round(xpValue / 3), 1, 6);
    for (let i = 0; i < shards; i++) {
      this.spawnPickup('prism', e.x + this.rng.range(-14, 14), e.y + this.rng.range(-10, 10), {
        value: Math.ceil(xpValue / shards),
      });
    }

    const luck = this.stats.luck;
    if (this.rng.chance(0.026 + luck * 0.012)) this.spawnPickup('heart', e.x, e.y);
    if (this.rng.chance(0.02 + luck * 0.012)) this.spawnPickup('bomb', e.x, e.y);
    if (this.rng.chance(0.015 + luck * 0.01)) this.spawnPickup('magnet', e.x, e.y);
    if (e.elite && this.rng.chance(0.7)) this.spawnPickup('coin', e.x, e.y, { value: 20 });
    if (e.isBoss) {
      for (let i = 0; i < 8; i++) {
        this.spawnPickup('coin', e.x + this.rng.range(-60, 60), e.y + this.rng.range(-40, 40), { value: 30 });
      }
      this.spawnPickup('heart', e.x, e.y);
    }

    switch (this.passiveKey) {
      case 'tailwind':
        // Zephyr accelerates while it is winning.
        this.tailwind = Math.min(5, this.tailwind + 1);
        this.tailwindT = 1;
        break;
      case 'feast':
        if (++this.feastKills >= 25) { this.feastKills = 0; this.healPlayer(1); }
        break;
      case 'wildfire':
        // Pyra: a burning corpse sets its neighbours alight.
        if (e.burnT > 0) {
          const r2 = 150 * 150;
          this.enemies.each((o) => {
            if (o !== e && o._alive && dist2(o.x, o.y, e.x, e.y) < r2) {
              this.applyBurn(o, 2, e.burnDmg);
            }
          });
          this.fx.burst(e.x, e.y, '#fb923c', 1.1);
        }
        break;
    }

    // Void's trait: a kill reels in everything loose nearby.
    if (this.stats.element === 'void') {
      const r2 = 300 * 300;
      this.pickups.each((k) => {
        if (k.kind === 'prism' && dist2(k.x, k.y, e.x, e.y) < r2) k.magnetised = true;
      });
    }

    // Cards that trigger on kill.
    if (this.mods.explodeOnKill > 0) {
      this.spawnShockwave(e.x, e.y, 90 + this.mods.explodeOnKill * 30,
        this.stats.damage * 0.9 * this.mods.explodeOnKill, { color: '#fb923c', knockback: 80 });
    }
    if (this.mods.lifesteal > 0) {
      this.player.killsSinceHeal++;
      const need = Math.round(40 / this.mods.lifesteal);
      if (this.player.killsSinceHeal >= need) {
        this.player.killsSinceHeal = 0;
        this.healPlayer(1);
      }
    }

    // Splitters.
    if (e.def?.splitInto && !e.elite) {
      const s = e.def.splitInto;
      for (let i = 0; i < s.count; i++) {
        const child = this.director.spawnAt(s.id, e.x + this.rng.range(-20, 20), e.y, { hpMul: 0.6, scale: 0.9 });
        if (child) { child.vx = this.rng.range(-120, 120); child.vy = this.rng.range(-40, 60); }
      }
    }

    // Volatile elites detonate.
    if (e.eliteMod?.explodeOnDeath) {
      const x = e.eliteMod.explodeOnDeath;
      this.spawnShockwave(e.x, e.y, x.radius, 0, { color: '#fb923c', hostile: true, dmg: x.dmg });
    }

    if (e.isBoss) {
      this.bossesKilled++;
      bus.emit(EV.BOSS_DEAD, { name: e.bossDef?.name });
      this.screen.doFlash(0.6, e.color);
      this.game.slowmo(0.25, 1.1);
      this.fx.celebrate(e.x, e.y, '#fbbf24', 1.4);
      bus.emit(EV.TOAST, { text: `${e.bossDef?.name ?? 'BOSS'} VERSLAGEN`, tone: 'gold', ttl: 2600 });
      haptic('success');
      // Hand the music back after a beat of victory. Scheduling it with a
      // `state === 'play'` guard did not work: killing a boss is enough XP to
      // level up, so the run is sitting on the card screen when the timer
      // fires and the boss track stayed on for the rest of the run.
      this.bossMusicT = 1.6;
    }

    bus.emit(EV.ENEMY_KILLED, { type: e.type, elite: !!e.elite, boss: e.isBoss, score: gained });
    if (this.combo > 0 && this.combo % 25 === 0) {
      bus.emit(EV.COMBO, this.combo);
      this.fx.number(this.player.x, this.player.y - 70, `${this.combo}× COMBO`, '#fbbf24', 34);
      Sfx.play('confirm');
    }
  }

  /* ------------------------------------------------------------
     SHOCKWAVES + HAZARDS
     ------------------------------------------------------------ */

  spawnShockwave(x, y, radius, damage, opts = {}) {
    const z = this.hazards.spawn();
    z.kind = 'shock';
    z.shape = 'circle';
    z.x = x; z.y = y;
    z.r = 0;
    z.radius = radius;
    z.life = z.maxLife = opts.big ? 0.55 : 0.32;
    z.dmg = damage;
    z.dps = 0;
    z.color = opts.color ?? '#fbbf24';
    z.friendly = !opts.hostile;
    z.knockback = opts.knockback ?? 0;
    z.stun = opts.stun ?? 0;
    z.tick = 0;
    z.hitSet = new Set();
    z.big = !!opts.big;
    if (opts.hostile) z.dmg = opts.dmg ?? 1;
    return z;
  }

  updateHazards(dt) {
    const p = this.player;
    this.hazards.each((z) => {
      z.life -= dt;
      const k = 1 - z.life / z.maxLife;

      if (z.kind === 'shock') {
        z.r = z.radius * (0.15 + k * 0.85);
        if (z.friendly) {
          this.enemies.each((e) => {
            if (z.hitSet.has(e.id)) return;
            if (dist2(e.x, e.y, z.x, z.y) <= (z.r + e.r) ** 2) {
              z.hitSet.add(e.id);
              this.damageEnemy(e, z.dmg, { knockback: z.knockback, fromX: z.x, fromY: z.y, source: 'shock' });
              if (z.stun) e.stunT = Math.max(e.stunT, z.stun);
            }
          });
        } else if (!z.hitSet.has(-1) && dist2(p.x, p.y, z.x, z.y) <= (z.r + p.r) ** 2) {
          z.hitSet.add(-1);
          this.hitPlayer(z.dmg, z.x, z.y);
        }
      } else if (z.kind === 'zone' || z.kind === 'sweep' || z.kind === 'trail') {
        if (z.kind === 'sweep') z.x = lerp(z.sweepFrom, z.sweepTo, k) - z.w / 2;
        if (z.riseSpeed) z.y -= z.riseSpeed * dt;

        z.tick -= dt;
        const doTick = z.tick <= 0;
        if (doTick) z.tick = 0.18;

        if (z.friendly) {
          if (z.pull) this.applyPull(z.x + (z.shape === 'rect' ? z.w / 2 : 0), z.y + (z.shape === 'rect' ? z.h / 2 : 0), z.r, z.pull, dt);
          if (doTick) {
            this.enemies.each((e) => {
              if (this.hazardHits(z, e.x, e.y, e.r)) {
                this.damageEnemy(e, z.dps * 0.18, { source: 'zone', silent: true });
                if (z.slow) { e.slowT = 0.4; e.slowAmt = z.slow; }
                this.fx.emit({ x: e.x, y: e.y, life: 0.25, size: 4, color: z.color, shape: 1, weight: 0.3 });
              }
            });
          }
        } else if (doTick && p.invuln <= 0 && this.hazardHits(z, p.x, p.y, p.r)) {
          this.hitPlayer(z.dmg || 1, z.x, z.y);
        }
      }

      if (z.life <= 0) {
        if (z.detonate) {
          this.spawnShockwave(z.x, z.y, z.r * 1.3, this.stats.damage * z.detonate, { color: z.color, big: true, knockback: 300 });
          this.fx.explosion(z.x, z.y, z.color, 2.4);
          this.screen.shake(0.6);
          Sfx.play('explode', { size: 1.4 });
        }
        z._alive = false;
      }
    });
    this.hazards.sweep();
  }

  hazardHits(z, x, y, r) {
    if (z.shape === 'circle') return dist2(x, y, z.x, z.y) <= (z.r + r) ** 2;
    return x + r > z.x && x - r < z.x + z.w && y + r > z.y && y - r < z.y + z.h;
  }

  applyPull(x, y, radius, force, dt) {
    const r2 = radius * radius;
    this.enemies.each((e) => {
      if (e.isBoss) return;
      const dx = x - e.x, dy = y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1) return;
      const d = Math.sqrt(d2);
      const k = (1 - d / radius) * force * dt;
      e.x += (dx / d) * k;
      e.y += (dy / d) * k;
    });
  }

  /* ------------------------------------------------------------
     BEAM
     ------------------------------------------------------------ */

  updateBeam(dt) {
    const b = this.beam;
    if (!b.active) return;
    b.tick -= dt;
    if (b.tick > 0) return;
    b.tick = 1 / 14;
    const halfW = b.width / 2;
    this.enemies.each((e) => {
      if (e.y > b.y) return;
      if (Math.abs(e.x - b.x) > halfW + e.r) return;
      this.damageEnemy(e, b.dmg, { source: 'beam', crit: Math.random() < this.stats.crit });
    });
  }

  /* ------------------------------------------------------------
     PICKUPS
     ------------------------------------------------------------ */

  spawnPickup(kind, x, y, opts = {}) {
    const p = this.pickups.spawn();
    p.kind = kind;
    p.x = x; p.y = y;
    p.vx = this.rng.range(-70, 70);
    p.vy = this.rng.range(-110, -30);
    p.t = 0;
    p.life = (kind === 'prism' ? 12 : 16) * (1 + (this.mods?.pickupLife ?? 0));
    p.value = opts.value ?? 1;
    p.magnetised = false;
    switch (kind) {
      case 'prism':  p.r = 9;  p.color = '#67e8f9'; p.sprite = 'pickup/prism'; break;
      case 'heart':  p.r = 13; p.color = '#fb7185'; p.sprite = 'pickup/heart'; break;
      case 'magnet': p.r = 13; p.color = '#c084fc'; p.sprite = 'pickup/magnet'; break;
      case 'bomb':   p.r = 14; p.color = '#fbbf24'; p.sprite = 'pickup/bomb'; break;
      case 'coin':   p.r = 11; p.color = '#fbbf24'; p.sprite = 'pickup/coin'; break;
    }
    return p;
  }

  updatePickups(dt) {
    const pl = this.player;
    const view = this.view;
    const magnetR = this.stats.magnet;
    const magnetR2 = magnetR * magnetR;
    const voidPull = this.astra.passive?.key === 'eventhorizon';

    this.pickups.each((p) => {
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0) { p._alive = false; return; }

      const d2 = dist2(p.x, p.y, pl.x, pl.y);
      if (p.magnetised || d2 < magnetR2 || (voidPull && p.kind === 'prism')) {
        p.magnetised = true;
        const a = angleTo(p.x, p.y, pl.x, pl.y);
        const pull = 900 + (1 - clamp01(Math.sqrt(d2) / 700)) * 900;
        p.vx = damp(p.vx, Math.cos(a) * pull, 12, dt);
        p.vy = damp(p.vy, Math.sin(a) * pull, 12, dt);
      } else {
        p.vy += 190 * dt;
        p.vx *= Math.exp(-1.2 * dt);
        if (p.y > view.h - 30) { p.y = view.h - 30; p.vy = -Math.abs(p.vy) * 0.4; }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.x = clamp(p.x, 12, view.w - 12);

      if (d2 < (pl.r + p.r + 8) ** 2) {
        this.collect(p);
        p._alive = false;
      }
    });
    this.pickups.sweep();
  }

  collect(p) {
    const pl = this.player;
    switch (p.kind) {
      case 'prism': {
        const harvest = this.passiveKey === 'harvest' ? 1.25 : 1;
        const gain = p.value * this.stats.xpMul * harvest;
        this.xp += gain;
        this.score += Math.round(p.value * 2 * SCORE_SCALE * harvest);
        if (this.mods.prismUlt > 0) {
          this.ult = Math.min(this.ultMax, this.ult + 0.9 * this.mods.prismUlt);
        }
        this.fx.absorb(p.x, p.y, '#67e8f9');
        Sfx.play('pickup', { step: Math.min(24, this.combo * 0.4), gate: 0.012 });
        while (this.xp >= this.xpNeed) this.levelUp();
        break;
      }
      case 'heart':
        this.healPlayer(1);
        this.fx.absorb(p.x, p.y, '#fb7185');
        break;
      case 'magnet':
        this.pickups.each((o) => { if (o.kind === 'prism') o.magnetised = true; });
        this.fx.ascend(pl.x, pl.y, '#c084fc', 180);
        bus.emit(EV.TOAST, { text: 'MAGNEET', tone: 'good', ttl: 900 });
        Sfx.play('confirm');
        break;
      case 'bomb': {
        this.spawnShockwave(pl.x, pl.y, 520, this.stats.damage * 6, { color: '#fbbf24', big: true, knockback: 340, stun: 0.6 });
        this.fx.explosion(pl.x, pl.y, '#fbbf24', 2.4);
        this.screen.shake(0.85);
        this.screen.doFlash(0.45, '#fef3c7');
        this.game.hitstop(0.1);
        Sfx.play('explode', { size: 1.6 });
        haptic('heavy');
        break;
      }
      case 'coin':
        this.score += p.value * 10 * SCORE_SCALE;
        this.runCoins = (this.runCoins ?? 0) + p.value;
        this.fx.number(p.x, p.y, `+${p.value * 10 * SCORE_SCALE}`, '#fde047', 24);
        Sfx.play('coin', { gate: 0.02 });
        break;
    }
  }

  /* ------------------------------------------------------------
     PROGRESSION
     ------------------------------------------------------------ */

  levelUp() {
    this.xp -= this.xpNeed;
    this.level++;
    this.xpNeed = Math.round(8 * Math.pow(this.level, 1.42));

    this.fx.ascend(this.player.x, this.player.y, '#fbbf24', 320);
    this.screen.doFlash(0.28, '#fde68a');
    this.screen.shake(0.22);
    Sfx.play('levelup');
    haptic('success');

    if (this.astra.passive?.key === 'bloomheal') {
      this.healPlayer(1);
      this.player.invuln = Math.max(this.player.invuln, 4);
    }

    if (this.mods.levelNova > 0) {
      this.spawnShockwave(this.player.x, this.player.y, 560,
        this.stats.damage * 5 * this.mods.levelNova,
        { color: '#fbbf24', big: true, knockback: 320, stun: 0.6 });
      this.screen.doFlash(0.4, '#fef3c7');
      Sfx.play('explode', { size: 1.4 });
    }

    this.pendingCards = this.drawCards(3);
    this.state = 'levelup';
    bus.emit(EV.LEVEL_UP, { level: this.level, cards: this.pendingCards });
  }

  /** Draw N distinct, legal cards weighted by rarity and luck. */
  drawCards(n) {
    const stacks = this.cardStacks;
    const legal = CARDS.filter((c) => {
      if ((stacks[c.id] ?? 0) >= c.max) return false;
      if (c.requires && !c.requires(stacks)) return false;
      return true;
    });

    const luck = this.stats.luck;
    const weightOf = (c) => {
      let w = CARD_WEIGHTS[c.rarity] ?? 1;
      if (c.rarity >= 2) w *= 1 + luck * 1.6;
      if (c.rarity >= 3) w *= 1 + this.level * 0.03;
      // Slight bias toward cards you already invested in — builds should snowball.
      if (stacks[c.id]) w *= 1.25;
      return w;
    };

    const picked = [];
    const pool = legal.slice();
    for (let i = 0; i < n && pool.length; i++) {
      const c = this.rng.weighted(pool, weightOf);
      if (!c) break;
      picked.push(c);
      pool.splice(pool.indexOf(c), 1);
    }
    return picked;
  }

  pickCard(card) {
    if (this.state !== 'levelup') return;
    this.cardStacks[card.id] = (this.cardStacks[card.id] ?? 0) + 1;
    this.cards.push({ id: card.id, name: card.name, rarity: card.rarity });
    try { card.apply(this.mods, this.cardStacks); }
    catch (e) { console.error('[card] apply failed', card.id, e); }
    this.resolveStats();

    this.state = 'play';
    this.pendingCards = null;
    this.game.input.reset();
    this.fx.celebrate(this.player.x, this.player.y, card.color ?? '#fbbf24', 0.5, card.rarity >= 3);
    this.screen.doFlash(0.2, card.color ?? '#fff');
    Sfx.play('confirm');
    haptic('medium');
    bus.emit(EV.CARD_PICKED, { card, stacks: this.cardStacks });
  }

  tryUlt() {
    if (this.state !== 'play' || this.ult < this.ultMax) return false;
    this.ult = 0;
    const name = fireUlt(this, this.astra, this.stars);
    bus.emit(EV.ULT_FIRED, { name });
    bus.emit(EV.TOAST, { text: name.toUpperCase(), tone: 'gold', ttl: 1600 });
    haptic('legendary');
    return true;
  }

  /* ------------------------------------------------------------
     WAVE CALLBACKS
     ------------------------------------------------------------ */

  onWaveStart(wave, isBoss) {
    bus.emit(EV.WAVE_START, { wave, isBoss });
    this.env.setWave(wave);
    if (!isBoss) {
      // A banner on the canvas rather than a toast: it sits in the play field,
      // reads at a glance, and clears itself out of the way in under a second.
      const biome = biomeForWave(wave);
      const newBiome = wave === 1 || (wave - 1) % 5 === 0;
      this.banner = {
        text: `GOLF ${wave}`,
        sub: newBiome ? biome.name.toUpperCase() : null,
        t: 0, dur: newBiome ? 2.1 : 1.5,
      };
      Sfx.play('tick');
    }
  }

  onWaveClear(wave) {
    const bonus = 100 * wave * SCORE_SCALE;
    this.score += bonus;
    this.fx.number(this.view.w / 2, this.view.h * 0.40, `GOLF ${wave} VEILIG`, '#34d399', 30);
    this.fx.number(this.view.w / 2, this.view.h * 0.46, `+${bonus}`, '#fde047', 26);
    Sfx.play('confirm', { gate: 0.2 });
  }

  onBossWave(bossDef) {
    const view = this.view;
    const sc = this.director.scaling;

    bus.emit(EV.BOSS_SPAWN, { name: bossDef.name, subtitle: bossDef.subtitle });
    Sfx.play('warning');
    this.screen.shake(0.5);
    Music.start('boss');
    Music.setIntensity(0.85);

    const e = this.enemies.spawn();
    e.id = this.enemyId++;
    e.isBoss = true;
    e.bossDef = bossDef;
    e.type = bossDef.id;
    e.sprite = bossDef.sprite;
    e.def = { contact: true, gun: null };
    e.x = view.w / 2;
    e.y = -140;
    e.r = bossDef.radius;
    e.maxHp = Math.round(bossDef.hp * (1 + (this.director.wave / 5 - 1) * 0.85));
    e.hp = e.maxHp;
    e.dmg = 2;
    e.speed = 60;
    e.score = bossDef.score * SCORE_SCALE;
    e.xp = bossDef.xp;
    e.color = bossDef.color;
    e.color2 = bossDef.color2;
    e.armor = 0.1;
    e.t = 0;
    e.phaseIdx = 0;
    e.attackT = 3;
    e.minionT = bossDef.minions?.every ?? 99;
    e.entering = true;
    e.charge = 0;
    e.stunT = 0; e.slowT = 0; e.burnT = 0; e.marked = 0;
    e.flash = 0; e.knockX = 0; e.knockY = 0; e.spawnT = 0;

    this.noteType(e, 0);
    this.director.bossRef = e;
    this.bossRef = e;
  }

  updateBoss(e, dt, speedMul) {
    const view = this.view;
    const p = this.player;
    const def = e.bossDef;

    if (e.entering) {
      e.y = damp(e.y, view.h * 0.2, 2.2, dt);
      if (Math.abs(e.y - view.h * 0.2) < 6) { e.entering = false; Sfx.play('bossRoar'); }
      return;
    }

    // Drift.
    e.x = view.w / 2 + Math.sin(e.t * 0.55) * view.w * 0.28;
    e.y = view.h * 0.2 + Math.sin(e.t * 0.9) * 26;

    // Phase transitions.
    const frac = e.hp / e.maxHp;
    let idx = 0;
    for (let i = 0; i < def.phases.length; i++) if (frac <= def.phases[i].at) idx = i;
    if (idx !== e.phaseIdx) {
      e.phaseIdx = idx;
      this.screen.doFlash(0.35, e.color);
      this.screen.shake(0.6);
      this.clearEnemyBullets();
      Sfx.play('bossRoar');
      bus.emit(EV.TOAST, { text: def.phases[idx].note.toUpperCase(), tone: 'bad', ttl: 1800 });
    }

    const phase = def.phases[e.phaseIdx];
    e.attackT -= dt * speedMul;
    e.charge = clamp01(1 - e.attackT / 0.7);

    if (e.attackT <= 0) {
      e.attackT = phase.interval;
      this.bossAttack(e, phase.pattern);
      e.charge = 0;
    }

    if (def.minions) {
      e.minionT -= dt;
      if (e.minionT <= 0) {
        e.minionT = def.minions.every;
        for (let i = 0; i < def.minions.count; i++) {
          this.director.spawnAt(def.minions.id, view.w * (0.2 + 0.6 * (i / Math.max(1, def.minions.count - 1))), -40);
        }
      }
    }
  }

  bossAttack(e, pattern) {
    const p = this.player;
    const view = this.view;
    const aim = angleTo(e.x, e.y, p.x, p.y);
    Sfx.play('laser', { pitch: 0.45, gate: 0 });
    this.screen.shake(0.2);

    switch (pattern) {
      case 'radial': {
        const n = 14;
        for (let i = 0; i < n; i++) {
          this.spawnEnemyBullet(e.x, e.y, (i / n) * TAU + e.t, 250, { color: e.color });
        }
        break;
      }
      case 'sweep': {
        for (let i = 0; i < 9; i++) {
          this.schedule(i * 0.07, () => {
            this.spawnEnemyBullet(e.x, e.y, aim - 0.6 + i * 0.15, 320, { color: e.color });
          });
        }
        break;
      }
      case 'spiral': {
        for (let i = 0; i < 18; i++) {
          this.schedule(i * 0.045, () => {
            this.spawnEnemyBullet(e.x, e.y, e.t * 2 + i * 0.42, 280, { color: e.color2 });
          });
        }
        break;
      }
      case 'wall': {
        const gap = this.rng.range(0.15, 0.85);
        for (let i = 0; i < 14; i++) {
          const x = (i / 13) * view.w;
          if (Math.abs(i / 13 - gap) < 0.12) continue;
          this.spawnEnemyBullet(x, e.y, Math.PI / 2, 240, { color: e.color });
        }
        break;
      }
      case 'suction': {
        this.applyPullPlayer(e.x, e.y, 900);
        for (let i = 0; i < 10; i++) {
          this.spawnEnemyBullet(e.x, e.y, (i / 10) * TAU, 190, { color: e.color, homing: 0.7 });
        }
        break;
      }
      case 'ring': {
        const z = this.hazards.spawn();
        z.kind = 'zone'; z.shape = 'circle';
        z.x = e.x; z.y = e.y; z.r = 200;
        z.life = z.maxLife = 1.4; z.dps = 0; z.dmg = 1;
        z.color = e.color; z.friendly = false; z.tick = 0;
        for (let i = 0; i < 20; i++) {
          this.spawnEnemyBullet(e.x, e.y, (i / 20) * TAU, 200, { color: e.color2 });
        }
        break;
      }
      case 'laser': {
        for (let k = 0; k < 3; k++) {
          this.schedule(k * 0.5, () => {
            const a = aim + (k - 1) * 0.5;
            for (let i = 0; i < 12; i++) {
              this.spawnEnemyBullet(e.x + Math.cos(a) * i * 30, e.y + Math.sin(a) * i * 30, a, 420, { color: '#fef3c7', r: 7 });
            }
          });
        }
        break;
      }
      case 'nova': {
        this.schedule(0.9, () => {
          for (let ring = 0; ring < 3; ring++) {
            this.schedule(ring * 0.24, () => {
              for (let i = 0; i < 22; i++) {
                this.spawnEnemyBullet(e.x, e.y, (i / 22) * TAU + ring * 0.14, 220 + ring * 60, { color: ring % 2 ? e.color : e.color2 });
              }
            });
          }
          this.screen.shake(0.7);
        });
        bus.emit(EV.TOAST, { text: '⚠ NOVA', tone: 'bad', ttl: 1000 });
        Sfx.play('warning');
        break;
      }

      /**
       * A slowly turning cross of spokes.
       *
       * Every other pattern is dodged on sight; this one you have to read
       * ahead, because the safe wedge you are standing in is rotating toward
       * a spoke whether you move or not.
       */
      case 'cross': {
        const arms = 4;
        const turn = e.t * 0.6;
        for (let a = 0; a < arms; a++) {
          const ang = turn + (a / arms) * TAU;
          for (let i = 0; i < 7; i++) {
            this.schedule(i * 0.06, () => {
              this.spawnEnemyBullet(e.x, e.y, ang, 210 + i * 22, { color: e.color2 });
            });
          }
        }
        break;
      }

      /**
       * Mines: stationary shots that sit for a moment and then burst.
       *
       * They turn the floor into a decision instead of a reaction — the
       * dangerous square is the one you can already see, and you have about a
       * second and a half to not be in it. No new system: a zero-speed shot
       * is its own telegraph, and the burst is scheduled at its position.
       */
      case 'mines': {
        const count = 5;
        for (let i = 0; i < count; i++) {
          const mx = view.w * (0.12 + 0.76 * (i / (count - 1)));
          const my = e.y + 180 + this.rng.range(-40, 120);
          // Danger red, not the boss's emerald. In the first pass they took
          // the boss colour and read as pickups — a glowing thing sitting
          // still in an empty lane is something a player flies *toward*.
          const mine = this.spawnEnemyBullet(mx, my, 0, 0, { color: '#f43f5e', r: 11, life: 1.7 });
          if (mine) mine.homing = 0;
          // Two ticks before it goes: the pattern is only fair if the moment
          // is legible, not just the position.
          this.schedule(0.9, () => { this.fx.hit(mx, my, '#fda4af', 0, 0.7); Sfx.play('tick', { gate: 0.1 }); });
          this.schedule(1.35, () => { this.fx.hit(mx, my, '#fecdd3', 0, 1); Sfx.play('tick', { pitch: 1.4, gate: 0.1 }); });
          this.schedule(1.6, () => {
            this.fx.explosion(mx, my, '#fb7185', 0.8);
            for (let k = 0; k < 9; k++) {
              this.spawnEnemyBullet(mx, my, (k / 9) * TAU + i, 230, { color: e.color2 });
            }
          });
        }
        Sfx.play('warning', { gate: 0.3 });
        break;
      }
    }
  }

  applyPullPlayer(x, y, force) {
    const p = this.player;
    const a = angleTo(p.x, p.y, x, y);
    p.x += Math.cos(a) * force * 0.05;
    p.y += Math.sin(a) * force * 0.05;
  }

  /* ------------------------------------------------------------
     MISC
     ------------------------------------------------------------ */

  /** Passives whose value changes moment to moment. */
  updatePassives(dt) {
    // OVERVERHITTING: standing your ground and keeping the trigger down builds
    // heat; moving vents it. It gives a stationary playstyle a real payoff
    // without ever being safer than moving.
    if (this.mods.overheat > 0) {
      const venting = this.player.thrust > 0.2;
      this.heat = clamp(this.heat + (venting ? -dt * 1.6 : dt * 0.34), 0, 1);
      this.overheatMul = 1 + this.heat * 0.5 * this.mods.overheat;
    } else {
      this.overheatMul = 1;
    }

    this.untouchedT += dt;

    if (this.passiveKey === 'tailwind') {
      this.tailwindT -= dt;
      if (this.tailwindT <= 0 && this.tailwind > 0) {
        this.tailwind--;
        this.tailwindT = 1;
      }
    }
  }

  /** Multiplier applied to every shot, recomputed per volley. */
  get passiveDamageMul() {
    // Pip stands its ground: holding still is a real, readable choice.
    if (this.passiveKey === 'steady' && this.player.thrust < 0.12) return 1.08;
    // Carousel pays for every second you go untouched, and loses all of it
    // the moment you don't — a streak you can feel building.
    if (this.passiveKey === 'carousel') return 1 + Math.min(0.4, this.untouchedT * 0.05);
    return 1;
  }

  /** Crit bonus from a passive, added to the resolved crit chance. */
  get passiveCritBonus() {
    // Standing still is how you aim a burst weapon; reward it there too.
    if (this.passiveKey === 'deadeye' && this.player.thrust < 0.12) return 0.2;
    return 0;
  }

  get passiveRateMul() {
    if (this.passiveKey === 'tailwind') return 1 + this.tailwind * 0.25;
    return 1;
  }

  updateCombo(dt) {
    if (this.combo > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
  }

  updateAuras(dt) {
    if (this.mods.freezeAura > 0) {
      const r = 130 + this.mods.freezeAura * 40;
      const r2 = r * r;
      this.enemies.each((e) => {
        if (dist2(e.x, e.y, this.player.x, this.player.y) < r2) {
          e.slowT = 0.2;
          e.slowAmt = Math.max(e.slowAmt, 0.35 + this.mods.freezeAura * 0.1);
        }
      });
    }
    if (this.mods.blackhole > 0) {
      this.bhT = (this.bhT ?? 8) - dt;
      if (this.bhT <= 0) {
        this.bhT = 8;
        const x = this.rng.range(100, this.view.w - 100);
        const y = this.rng.range(140, this.view.h * 0.55);
        const z = this.hazards.spawn();
        z.kind = 'zone'; z.shape = 'circle';
        z.x = x; z.y = y; z.r = 170;
        z.life = z.maxLife = 3; z.dps = this.stats.damage * 2;
        z.color = '#a855f7'; z.friendly = true; z.tick = 0; z.pull = 380; z.swirl = true;
      }
    }
  }

  randomEnemy() {
    const a = this.enemies.active.filter((e) => e._alive && !e.isBoss);
    return a.length ? a[Math.floor(this.rng.float() * a.length)] : null;
  }

  schedule(delay, fn) { this.timers.push({ t: delay, fn }); }

  runTimers(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        try { fn(); } catch (e) { console.error('[timer]', e); }
      }
    }
  }

  emitHud() {
    bus.emit(EV.RUN_TICK, {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      shield: this.player.shield,
      score: Math.round(this.score),
      wave: this.director.wave,
      waveProgress: this.director.progress,
      level: this.level,
      xp: this.xp,
      xpNeed: this.xpNeed,
      combo: this.combo,
      ult: this.ult / this.ultMax,
      time: this.time,
      boss: this.bossRef && this.bossRef._alive
        ? { name: this.bossRef.bossDef.name, hp: this.bossRef.hp / this.bossRef.maxHp }
        : null,
      kills: this.kills,
    });
  }

  /* ============================================================
     DRAW
     ============================================================ */

  draw(r) {
    const ctx = r.ctx;
    const view = this.view;

    this.env.drawBack(r);
    this.stars_bg.draw(r);
    this.drawHazards(r, false);
    this.fx.draw(r, 0);
    this.drawPickups(r);
    this.drawBeam(r);
    this.drawEnemies(r);
    this.drawEnemyBullets(r);
    this.drawPlayer(r);
    this.drawBullets(r);
    this.drawHazards(r, true);
    this.fx.draw(r, 1);
    this.env.drawFront(r);

    if (this.banner) this.drawBanner(r);
    if (this.state === 'intro') this.drawIntro(r);
    if (this.state === 'dead') this.drawDeathVeil(r);
    if (this.timeFreeze > 0) this.drawTimeFreeze(r);
  }

  drawPlayer(r) {
    const p = this.player;
    const ctx = r.ctx;
    if (this.state === 'dead' && this.deathT > 0.25) return;

    // Motion trail.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let i = 0;
    this.trail.each((s) => {
      i++;
      if (i % 3) return;
      const a = (1 - i / this.trail.cap) * 0.1;
      if (a <= 0.01) return false;
      ctx.globalAlpha = a;
      Assets.draw(ctx, 'vessel/idle', s.x, s.y, {
        scale: 1 - i * 0.045, tint: this.stats.color, tint2: this.stats.color2,
        data: { tilt: s.a, thrust: 0, shield: 0, invuln: 0, hull: this.skin.hull, trim: this.skin.trim },
      });
    });
    ctx.restore();

    const blink = p.invuln > 0 && Math.floor(this.game.realTime * 22) % 2 === 0;
    Assets.draw(ctx, 'vessel/idle', p.x, p.y, {
      t: this.game.realTime,
      alpha: blink ? 0.55 : 1,
      tint: this.stats.color,
      tint2: this.stats.color2,
      flash: p.flash,
      data: {
        tilt: p.tilt, thrust: p.thrust,
        shield: p.shield > 0 ? 1 : 0,
        invuln: p.invuln > 0 ? 1 : 0,
        hull: this.skin.hull, trim: this.skin.trim,
      },
    });

    // The equipped Astra flies alongside — it's the thing you pulled for, so it
    // must be visible the entire run.
    const ax = p.x + Math.cos(this.game.realTime * 1.4) * 46;
    const ay = p.y - 44 + Math.sin(this.game.realTime * 1.9) * 12;
    Assets.draw(ctx, astraSprite(this.astra, 'idle'), ax, ay, {
      t: this.game.realTime,
      scale: 0.62,
      tint: this.astra.colors.primary,
      tint2: this.astra.colors.secondary,
      charge: clamp01(this.ult / this.ultMax),
    });

    // Freeze aura.
    if (this.mods.freezeAura > 0) {
      const rad = 130 + this.mods.freezeAura * 40;
      r.ctx.save();
      r.ctx.globalCompositeOperation = 'lighter';
      r.ring(p.x, p.y, rad, 2, hexA('#a5f3fc', 0.25 + Math.sin(this.game.realTime * 3) * 0.08));
      r.ctx.restore();
    }
  }

  drawBullets(r) {
    const ctx = r.ctx;
    this.bullets.each((b) => {
      Assets.draw(ctx, b.sprite, b.x, b.y, {
        t: b.t,
        rot: b.orbit ? b.orbitAngle : b.angle + Math.PI / 2,
        scale: b.r / 6,
        tint: b.crit ? '#fff7ed' : b.color,
        tint2: b.color2,
        blend: 'lighter',
      });
    });
  }

  drawEnemyBullets(r) {
    const ctx = r.ctx;
    this.ebullets.each((b) => {
      Assets.draw(ctx, b.sprite, b.x, b.y, {
        t: b.t, rot: b.angle, scale: b.r / 8,
        tint: b.color, tint2: b.color2, blend: 'lighter',
      });
    });
  }

  drawEnemies(r) {
    const ctx = r.ctx;
    this.enemies.each((e) => {
      const scale = e.isBoss ? 1 : (e.r / (e.def?.radius ?? e.r));

      // Materialising enemies fade and scale in so nothing appears from nowhere.
      if (e.spawnT > 0) {
        const k = 1 - e.spawnT / 0.6;
        ctx.save();
        ctx.globalAlpha = k * 0.8;
        r.ring(e.x, e.y, e.r * (2 - k), 2, hexA(e.color, 1 - k));
        ctx.restore();
        Assets.draw(ctx, e.sprite, e.x, e.y, {
          t: e.t, scale: scale * k, alpha: k, tint: e.color, tint2: e.color2,
        });
        return;
      }

      if (e.elite) {
        Assets.draw(ctx, 'enemy/elite', e.x, e.y, { t: e.t, scale: e.r / 40 });
      }

      Assets.draw(ctx, e.sprite, e.x, e.y, {
        t: e.t,
        scale,
        tint: e.color,
        tint2: e.color2,
        flash: e.flash,
        charge: e.charge,
        data: { aim: e.aim, phase: e.phaseIdx ?? 0 },
      });

      if (e.slowT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        r.circle(e.x, e.y, e.r * 1.15, hexA('#a5f3fc', 0.16));
        ctx.restore();
      }
      if (e.stunT > 0) {
        for (let i = 0; i < 3; i++) {
          const a = this.game.realTime * 5 + (i / 3) * TAU;
          r.circle(e.x + Math.cos(a) * e.r, e.y - e.r - 6 + Math.sin(a) * 4, 2.5, '#fde047');
        }
      }
      if (e.marked > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        r.ring(e.x, e.y, e.r * 1.3, 2, hexA('#ff5cf0', 0.6));
        ctx.restore();
      }

      // Health bar: only when damaged, and only for things worth tracking.
      if (!e.isBoss && e.hp < e.maxHp && (e.maxHp > 20 || e.elite)) {
        const w = e.r * 2;
        const frac = clamp01(e.hp / e.maxHp);
        r.rect(e.x - w / 2, e.y - e.r - 10, w, 3.5, 'rgba(0,0,0,.55)');
        r.rect(e.x - w / 2, e.y - e.r - 10, w * frac, 3.5, e.elite ? '#fbbf24' : '#f43f5e');
      }
    });
  }

  drawPickups(r) {
    const ctx = r.ctx;
    this.pickups.each((p) => {
      const flick = p.life < 3 && Math.floor(p.life * 8) % 2 === 0;
      Assets.draw(ctx, p.sprite, p.x, p.y, {
        t: p.t, scale: p.r / 9 * (p.kind === 'prism' ? 1 : 0.8),
        alpha: flick ? 0.4 : 1, tint: p.color, tint2: '#ffffff',
      });
    });
  }

  drawHazards(r, over) {
    const ctx = r.ctx;
    this.hazards.each((z) => {
      const k = 1 - z.life / z.maxLife;
      if (z.kind === 'shock') {
        if (!over) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - k) * 0.9;
        r.ring(z.x, z.y, z.r, 3 + (1 - k) * (z.big ? 14 : 6), z.color);
        r.ring(z.x, z.y, z.r * 0.82, 2, hexA('#ffffff', 0.6 * (1 - k)));
        ctx.restore();
        return;
      }
      if (over) return;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fade = z.life < 0.4 ? z.life / 0.4 : 1;
      ctx.globalAlpha = 0.5 * fade;

      if (z.shape === 'circle') {
        const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
        g.addColorStop(0, hexA(z.color, z.swirl ? 0.85 : 0.4));
        g.addColorStop(0.6, hexA(z.color, 0.25));
        g.addColorStop(1, hexA(z.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.fill();
        if (z.swirl) {
          for (let i = 0; i < 4; i++) {
            const a = this.game.realTime * 3 + (i / 4) * TAU;
            r.arc(z.x, z.y, z.r * (0.4 + i * 0.16), a, a + 1.6, 3, hexA('#ffffff', 0.35));
          }
        }
      } else {
        const g = ctx.createLinearGradient(z.x, z.y, z.x + z.w, z.y + z.h);
        g.addColorStop(0, hexA(z.color, 0.15));
        g.addColorStop(0.5, hexA(z.color, 0.45));
        g.addColorStop(1, hexA(z.color, 0.15));
        ctx.fillStyle = g;
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = hexA('#ffffff', 0.35);
        ctx.lineWidth = 2;
        ctx.strokeRect(z.x, z.y, z.w, z.h);
      }
      ctx.restore();
    });
  }

  drawBeam(r) {
    const b = this.beam;
    if (!b.active) return;
    const ctx = r.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(b.x - b.width, 0, b.x + b.width, 0);
    g.addColorStop(0, hexA(b.color, 0));
    g.addColorStop(0.35, hexA(b.color, 0.5));
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.65, hexA(b.color, 0.5));
    g.addColorStop(1, hexA(b.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(b.x - b.width, 0, b.width * 2, b.y);
    ctx.globalAlpha = 0.6 + Math.sin(this.game.realTime * 40) * 0.15;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(b.x - b.width * 0.16, 0, b.width * 0.32, b.y);
    r.glow(b.x, b.y, b.width * 2.4, b.color, 0.8);
    ctx.restore();
  }

  /** Wave banner: sweeps in, holds, sweeps out. Never blocks the play field. */
  drawBanner(r) {
    const b = this.banner;
    const view = this.view;
    const k = b.t / b.dur;
    // in 0..0.18, hold to 0.72, out to 1
    const enter = clamp01(k / 0.18);
    const exit = 1 - clamp01((k - 0.72) / 0.28);
    const alpha = Math.min(enter, exit);
    if (alpha <= 0.01) return;

    const y = view.h * 0.3;
    const slide = (1 - enter) * 90 - (1 - exit) * 90;
    const ctx = r.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    // Thin light bars top and bottom frame the text without hiding anything.
    const g = ctx.createLinearGradient(0, 0, view.w, 0);
    g.addColorStop(0, hexA(this.stats.color, 0));
    g.addColorStop(0.5, hexA(this.stats.color, 0.85));
    g.addColorStop(1, hexA(this.stats.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 34 + slide * 0.3, view.w, 1.5);
    ctx.fillRect(0, y + 26 + slide * 0.3, view.w, 1.5);
    ctx.restore();

    r.text(b.text, view.w / 2 + slide, y, {
      size: 44, weight: 900, color: '#ffffff', alpha,
      letterSpacing: 8, shadow: this.stats.color, shadowBlur: 26,
    });
    if (b.sub) {
      r.text(b.sub, view.w / 2 - slide, y + 44, {
        size: 17, weight: 800, color: this.env._col('rim'), alpha: alpha * 0.9,
        letterSpacing: 7,
      });
    }
  }

  drawIntro(r) {
    const view = this.view;
    const k = clamp01(this.introT / 1.15);
    const ctx = r.ctx;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();

    const scale = 1 + (1 - k) * 0.5;
    r.text(this.astra.name.toUpperCase(), view.w / 2, view.h * 0.44, {
      size: 52 * scale, weight: 900, color: this.astra.colors.primary,
      alpha: Math.sin(k * Math.PI), letterSpacing: 6, shadow: this.astra.colors.primary, shadowBlur: 30,
    });
    r.text(this.astra.title, view.w / 2, view.h * 0.5, {
      size: 20, weight: 600, color: '#a3adcc', alpha: Math.sin(k * Math.PI),
    });
    r.text(`SEED ${this.seed}`, view.w / 2, view.h * 0.56, {
      size: 17, weight: 800, color: '#67e8f9', alpha: Math.sin(k * Math.PI) * 0.8,
      letterSpacing: 4,
    });
  }

  drawDeathVeil(r) {
    const view = this.view;
    const k = clamp01(this.deathT / 1.4);
    const ctx = r.ctx;
    ctx.save();
    ctx.globalAlpha = k * 0.8;
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();
    if (this.deathT > 0.35) {
      r.text('VERLOREN', view.w / 2, view.h * 0.46, {
        size: 56, weight: 900, color: '#f43f5e',
        alpha: clamp01((this.deathT - 0.35) / 0.5), letterSpacing: 8,
        shadow: '#f43f5e', shadowBlur: 26,
      });
    }
  }

  drawTimeFreeze(r) {
    const view = this.view;
    const ctx = r.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.1 + Math.sin(this.game.realTime * 8) * 0.03;
    ctx.fillStyle = '#67e8f9';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();
  }

  resize(r) {
    this.stars_bg.resize(r.view);
    this.env.resize(r.view);
    this.player.x = clamp(this.player.x, 26, r.view.w - 26);
    this.player.y = clamp(this.player.y, r.view.h * 0.22, r.view.h - 66);
  }
}
