/**
 * banners.js — summon banners.
 *
 * Rates are published in-game, on the banner, in plain language. Not because a
 * store requires it — because a player who understands the odds pulls more, and
 * a player who feels tricked uninstalls. Pity is visible too: the counter is on
 * the banner, always.
 */

import { RARITY } from './constants.js';

/**
 * @typedef {Object} Banner
 * @property {string} id
 * @property {string} name
 * @property {string} tagline
 * @property {'stardust'|'shards'} currency
 * @property {number} cost1
 * @property {number} cost10
 * @property {number[]} rates          index = rarity tier, must sum to 1
 * @property {string[]} featured       rate-up Astra ids
 * @property {string[]} [pool]         restrict the pool; omit = everything
 * @property {Object} pity
 * @property {string[]} colors         gradient for the banner art
 */

/** @type {Banner[]} */
export const BANNERS = [
  {
    id: 'standard',
    name: 'Sterrenval',
    tagline: 'De eeuwige stroom. Alles is mogelijk.',
    subtitle: 'Standaard banner — altijd beschikbaar',
    currency: 'stardust',
    cost1: 160,
    cost10: 1440,           // 10% off — always pull ten
    rates: [0.547, 0.30, 0.12, 0.028, 0.005],
    featured: ['aurelia', 'nautilus'],
    featuredBoost: 0.5,     // 50/50 on the first SSR+
    pity: {
      soft: 65,             // SSR+ odds start climbing here
      hard: 80,             // guaranteed SSR+ here
      srEvery: 10,          // guaranteed SR+ every 10 pulls
    },
    colors: ['#0e7490', '#7e22ce', '#1e1b4b'],
    accent: '#22d3ee',
  },
  {
    id: 'kairos',
    name: 'HET JUISTE MOMENT',
    tagline: 'KAIROS verschijnt. Tijd is onderhandelbaar.',
    subtitle: 'Beperkte banner — hoge kans op KAIROS',
    currency: 'shards',
    cost1: 20,
    cost10: 180,
    rates: [0.50, 0.30, 0.145, 0.045, 0.010],
    featured: ['kairos', 'solaris', 'nyx'],
    featuredBoost: 0.75,    // heavily weighted toward the headliner
    limited: true,
    pity: { soft: 60, hard: 75, srEvery: 10 },
    colors: ['#701a75', '#be185d', '#0c4a6e'],
    accent: '#ff5cf0',
  },
  {
    id: 'voidcall',
    name: 'STEM UIT DE LEEGTE',
    tagline: 'OUROBOROS keert terug. Zoals altijd.',
    subtitle: 'Beperkte banner — Void-gefocust',
    currency: 'shards',
    cost1: 20,
    cost10: 180,
    rates: [0.50, 0.30, 0.145, 0.045, 0.010],
    featured: ['ouroboros', 'vantablack', 'umbra'],
    featuredBoost: 0.75,
    limited: true,
    pool: null,
    pity: { soft: 60, hard: 75, srEvery: 10 },
    colors: ['#3b0764', '#1e1b4b', '#4a044e'],
    accent: '#a855f7',
  },
];

const BY_ID = new Map(BANNERS.map((b) => [b.id, b]));
export const getBanner = (id) => BY_ID.get(id) ?? BANNERS[0];
export const DEFAULT_BANNER = 'standard';

/**
 * Human-readable rate table for the "details" sheet.
 * Shown verbatim in the UI — no rounding tricks.
 */
export function rateTable(banner) {
  const names = ['Common', 'Rare', 'Superior', 'Stellar', 'Ultra'];
  return banner.rates.map((r, i) => ({
    tier: i,
    name: names[i],
    rate: r,
    label: `${(r * 100).toFixed(r < 0.02 ? 2 : 1)}%`,
  })).reverse();
}

/**
 * Effective SSR+ chance at a given pity count, including soft pity.
 * Exported so the UI can draw the same curve the roller uses — the player
 * sees exactly the maths that decides their pull.
 */
export function ssrChanceAt(banner, pityCount) {
  const base = banner.rates[RARITY.SSR] + banner.rates[RARITY.UR];
  const { soft, hard } = banner.pity;
  const n = pityCount + 1;
  if (n >= hard) return 1;
  if (n <= soft) return base;
  const k = (n - soft) / (hard - soft);
  return base + (1 - base) * k;
}
