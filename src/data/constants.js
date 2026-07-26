/**
 * constants.js — rarity, element and currency definitions.
 * Everything that needs a colour, a name or a sort order lives here.
 */

/* ============================================================
   RARITY
   ============================================================ */

export const RARITY = {
  C:   0,
  R:   1,
  SR:  2,
  SSR: 3,
  UR:  4,
};

export const RARITY_KEYS = ['C', 'R', 'SR', 'SSR', 'UR'];

export const RARITY_INFO = [
  {
    key: 'C', tier: 0, name: 'Common', short: 'C', stars: 1,
    color: '#8b96b8', glow: '#b6bfd8',
    grad: ['#94a3b8', '#64748b'],
    dust: 12, echoes: 1,
  },
  {
    key: 'R', tier: 1, name: 'Rare', short: 'R', stars: 2,
    color: '#22d3ee', glow: '#67e8f9',
    grad: ['#67e8f9', '#0891b2'],
    dust: 40, echoes: 4,
  },
  {
    key: 'SR', tier: 2, name: 'Superior', short: 'SR', stars: 3,
    color: '#a855f7', glow: '#d8b4fe',
    grad: ['#d8b4fe', '#7e22ce'],
    dust: 140, echoes: 15,
  },
  {
    key: 'SSR', tier: 3, name: 'Stellar', short: 'SSR', stars: 4,
    color: '#fbbf24', glow: '#fde68a',
    grad: ['#fde68a', '#d97706'],
    dust: 520, echoes: 60,
  },
  {
    key: 'UR', tier: 4, name: 'Ultra', short: 'UR', stars: 5,
    color: '#ff5cf0', glow: '#ffb3f6',
    grad: ['#22d3ee', '#a855f7', '#ff5cf0', '#fbbf24'],
    dust: 2000, echoes: 240,
  },
];

export const rarityOf = (tier) => RARITY_INFO[tier] ?? RARITY_INFO[0];

/* ============================================================
   ELEMENTS
   ============================================================ */

export const ELEMENT = {
  ember:  { key: 'ember',  name: 'Ember',  icon: '✦', color: '#fb7185', accent: '#fed7aa',
            trait: 'Brand', traitDesc: 'Vijanden branden na door voor extra schade over tijd.' },
  tide:   { key: 'tide',   name: 'Tide',   icon: '❋', color: '#38bdf8', accent: '#bae6fd',
            trait: 'Stroom', traitDesc: 'Geraakte vijanden worden vertraagd.' },
  gale:   { key: 'gale',   name: 'Gale',   icon: '❃', color: '#5eead4', accent: '#ccfbf1',
            trait: 'Windstoot', traitDesc: 'Kans om vijanden weg te blazen.' },
  terra:  { key: 'terra',  name: 'Terra',  icon: '❖', color: '#fbbf24', accent: '#fde68a',
            trait: 'Breuk', traitDesc: 'Schade schokgolft naar vijanden ernaast.' },
  void:   { key: 'void',   name: 'Void',   icon: '◈', color: '#a855f7', accent: '#e9d5ff',
            trait: 'Leegte', traitDesc: 'Kills trekken nabije Prisms aan.' },
  lumen:  { key: 'lumen',  name: 'Lumen',  icon: '✷', color: '#facc15', accent: '#fef9c3',
            trait: 'Straling', traitDesc: 'Kritieke treffers verblinden en verzwakken.' },
  prism:  { key: 'prism',  name: 'Prism',  icon: '✵', color: '#ff5cf0', accent: '#fbcfe8',
            trait: 'Refractie', traitDesc: 'Neemt het element van je sterkste kaart over.' },
};

export const ELEMENT_KEYS = Object.keys(ELEMENT);
export const elementOf = (k) => ELEMENT[k] ?? ELEMENT.lumen;

/* ============================================================
   CURRENCIES
   ============================================================ */

export const CURRENCY = {
  stardust: { key: 'stardust', name: 'Stardust', symbol: '✦', color: '#67e8f9',
              desc: 'Verdien je door te spelen. Betaalt de Standaard Summon.' },
  shards:   { key: 'shards',   name: 'Nova Shards', symbol: '◈', color: '#ff5cf0',
              desc: 'Premium valuta. Voor limited banners en bundels.' },
  echoes:   { key: 'echoes',   name: 'Echoes', symbol: '◉', color: '#fbbf24',
              desc: 'Uit dubbele Astra. Verhoogt sterren.' },
  cores:    { key: 'cores',    name: 'Cores', symbol: '⬢', color: '#a3e635',
              desc: 'Permanente upgrades in de Werf.' },
};

/* ============================================================
   STAR LEVELS
   ============================================================ */

/** Echo cost to go from star N → N+1, and what each star unlocks. */
export const STAR_TABLE = [
  { star: 1, cost: 0,   power: 1.00, note: 'Basisvorm' },
  { star: 2, cost: 20,  power: 1.18, note: '+18% kracht' },
  { star: 3, cost: 60,  power: 1.40, note: 'Vaardigheid verbeterd' },
  { star: 4, cost: 160, power: 1.70, note: '+70% kracht' },
  { star: 5, cost: 400, power: 2.15, note: 'Ultimate verbeterd' },
];

export const MAX_STAR = STAR_TABLE.length;

export function starPower(star) {
  return STAR_TABLE[Math.min(star, MAX_STAR) - 1]?.power ?? 1;
}

/* ============================================================
   SCORING
   ============================================================ */

/**
 * Global score multiplier.
 *
 * Enemy `score` values are authored as small readable integers (a drone is
 * worth 10). This scales them into the range that actually feels like a
 * score — five digits by the end of a decent run. Numbers people want to
 * screenshot are part of the design, not decoration.
 */
export const SCORE_SCALE = 6;

/* ============================================================
   ACCOUNT LEVEL
   ============================================================ */

/** XP needed to reach level N (cumulative curve, tuned for ~6 runs/level early). */
export function xpForLevel(level) {
  return Math.floor(120 * Math.pow(level, 1.55));
}

/** Rewards handed out on each account level-up. */
export function levelReward(level) {
  const r = { stardust: 120 + level * 40 };
  if (level % 5 === 0) r.shards = 30;
  if (level % 3 === 0) r.cores = 2;
  if (level % 10 === 0) r.shards = (r.shards ?? 0) + 60;
  return r;
}
