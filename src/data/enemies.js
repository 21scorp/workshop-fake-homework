/**
 * enemies.js — enemy archetypes.
 *
 * `hp`, `dmg` and `score` are *base* values at wave 1; the wave director scales
 * them. Everything else is behavioural and never scales, so an enemy always
 * feels like itself no matter how deep the run goes.
 */

export const ENEMY = {
  drone: {
    id: 'drone',
    sprite: 'enemy/drone',
    name: 'Drone',
    hp: 12, dmg: 1, speed: 105, radius: 17,
    score: 10, xp: 3,
    color: '#f43f5e', color2: '#fecdd3',
    ai: 'dive',            // straight down, slight drift
    contact: true,
    weight: 10,
  },

  swarm: {
    id: 'swarm',
    sprite: 'enemy/swarm',
    name: 'Zwerm',
    hp: 5, dmg: 1, speed: 190, radius: 10,
    score: 6, xp: 2,
    color: '#fb7185', color2: '#ffe4e6',
    ai: 'seek',            // slowly homes toward the player
    contact: true,
    weight: 9,
    groupSize: 7,          // never spawns alone
  },

  tank: {
    id: 'tank',
    sprite: 'enemy/tank',
    name: 'Bastion',
    hp: 95, dmg: 2, speed: 46, radius: 31,
    score: 55, xp: 14,
    color: '#94a3b8', color2: '#e2e8f0',
    ai: 'dive',
    contact: true,
    armor: 0.28,           // flat damage reduction
    weight: 4,
    minWave: 3,
  },

  shooter: {
    id: 'shooter',
    sprite: 'enemy/shooter',
    name: 'Wachter',
    hp: 26, dmg: 1, speed: 62, radius: 21,
    score: 30, xp: 8,
    color: '#c084fc', color2: '#f3e8ff',
    ai: 'hover',           // descends to a band, then holds and fires
    contact: true,
    weight: 7,
    minWave: 2,
    gun: { cooldown: 2.1, charge: 0.75, bullets: 1, speed: 300, spread: 0, aimed: true },
  },

  splitter: {
    id: 'splitter',
    sprite: 'enemy/splitter',
    name: 'Splijter',
    hp: 34, dmg: 1, speed: 78, radius: 23,
    score: 34, xp: 9,
    color: '#34d399', color2: '#d1fae5',
    ai: 'drift',           // sine-wave descent
    contact: true,
    weight: 6,
    minWave: 4,
    splitInto: { id: 'swarm', count: 3 },
  },

  weaver: {
    id: 'weaver',
    sprite: 'enemy/weaver',
    name: 'Wever',
    hp: 40, dmg: 1, speed: 130, radius: 20,
    score: 42, xp: 11,
    color: '#22d3ee', color2: '#cffafe',
    ai: 'orbit',           // circles the play area
    contact: true,
    weight: 5,
    minWave: 5,
    trail: { life: 2.4, radius: 13, dmg: 1, every: 0.16 },
  },

  lancer: {
    id: 'lancer',
    sprite: 'enemy/swarm',
    name: 'Lansier',
    hp: 22, dmg: 2, speed: 95, radius: 14,
    score: 26, xp: 7,
    color: '#fbbf24', color2: '#fef3c7',
    ai: 'charge',          // pauses, telegraphs, then dashes at the player
    contact: true,
    weight: 5,
    minWave: 6,
    charge: { windup: 0.85, dashSpeed: 720, dashTime: 0.55, cooldown: 1.8 },
  },

  turret: {
    id: 'turret',
    sprite: 'enemy/shooter',
    name: 'Geschutstoren',
    hp: 70, dmg: 1, speed: 26, radius: 25,
    score: 60, xp: 16,
    color: '#f472b6', color2: '#fce7f3',
    ai: 'hover',
    contact: true,
    armor: 0.15,
    weight: 3,
    minWave: 7,
    gun: { cooldown: 2.6, charge: 0.6, bullets: 5, speed: 260, spread: 0.7, aimed: true },
  },

  spinner: {
    id: 'spinner',
    sprite: 'enemy/weaver',
    name: 'Tolwezen',
    hp: 55, dmg: 1, speed: 70, radius: 22,
    score: 48, xp: 13,
    color: '#818cf8', color2: '#e0e7ff',
    ai: 'drift',
    contact: true,
    weight: 4,
    minWave: 8,
    gun: { cooldown: 1.5, charge: 0.3, bullets: 8, speed: 200, spread: 6.283, aimed: false, spiral: 0.4 },
  },
};

export const ENEMY_LIST = Object.values(ENEMY);

/** Enemies legal at a given wave, with their spawn weights. */
export function enemyPool(wave) {
  return ENEMY_LIST.filter((e) => (e.minWave ?? 1) <= wave);
}

/* ============================================================
   ELITES — any enemy can be promoted.
   ============================================================ */

export const ELITE_MODS = {
  armored:  { name: 'Gepantserd', hp: 3.2, dmg: 1, speed: 0.8, armor: 0.35, color: '#94a3b8' },
  swift:    { name: 'Razend',     hp: 2.0, dmg: 1, speed: 1.9, color: '#5eead4' },
  volatile: { name: 'Instabiel',  hp: 2.4, dmg: 1, speed: 1.0, explodeOnDeath: { radius: 120, dmg: 1 }, color: '#fb923c' },
  vampiric: { name: 'Bloedzuiger',hp: 2.8, dmg: 1, speed: 1.1, healAura: true, color: '#f43f5e' },
  warped:   { name: 'Vervormd',   hp: 2.6, dmg: 2, speed: 1.2, color: '#a855f7' },
};

export const ELITE_KEYS = Object.keys(ELITE_MODS);

/* ============================================================
   BOSSES — one per 5 waves, cycling with escalating stats.
   ============================================================ */

export const BOSSES = [
  {
    id: 'warden',
    sprite: 'boss/warden',
    name: 'DE WACHTER',
    subtitle: 'Poortwachter van de Val',
    hp: 1400, radius: 78, score: 1200, xp: 260,
    color: '#818cf8', color2: '#c7d2fe',
    phases: [
      { at: 1.00, pattern: 'radial',  interval: 2.2, note: 'Radiale salvo\'s' },
      { at: 0.66, pattern: 'sweep',   interval: 1.7, note: 'Vegende waaier' },
      { at: 0.33, pattern: 'spiral',  interval: 1.1, note: 'Spiraal + minions' },
    ],
    minions: { id: 'drone', every: 6, count: 3 },
  },
  {
    id: 'devourer',
    sprite: 'boss/devourer',
    name: 'DE VERSLINDER',
    subtitle: 'Hij die de Leegte voedt',
    hp: 2100, radius: 84, score: 1800, xp: 340,
    color: '#a855f7', color2: '#f0abfc',
    phases: [
      { at: 1.00, pattern: 'suction', interval: 3.0, note: 'Zuigt je naar binnen' },
      { at: 0.60, pattern: 'spiral',  interval: 1.3, note: 'Tandenspiraal' },
      { at: 0.28, pattern: 'wall',    interval: 2.4, note: 'Muren van kogels' },
    ],
    minions: { id: 'swarm', every: 5, count: 6 },
  },
  {
    id: 'nova',
    sprite: 'boss/nova',
    name: 'NOVA',
    subtitle: 'Een ster die weigert te doven',
    hp: 3000, radius: 76, score: 2600, xp: 460,
    color: '#fbbf24', color2: '#fef3c7',
    phases: [
      { at: 1.00, pattern: 'ring',    interval: 2.6, note: 'Uitdijende ringen' },
      { at: 0.65, pattern: 'laser',   interval: 3.2, note: 'Roterende stralen' },
      { at: 0.30, pattern: 'nova',    interval: 4.0, note: 'Volledige detonatie' },
    ],
    minions: { id: 'lancer', every: 7, count: 4 },
  },
];

export const bossForWave = (wave) => BOSSES[Math.floor(wave / 5 - 1) % BOSSES.length];
