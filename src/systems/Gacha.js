/**
 * Gacha.js — the summon roller.
 *
 * Rules implemented here, all of them visible to the player in-game:
 *
 *  1. Published base rates per rarity.
 *  2. Soft pity — SSR+ odds climb linearly from `pity.soft` to a guaranteed
 *     hit at `pity.hard`.
 *  3. Hard pity — the guaranteed pull.
 *  4. Every 10 pulls guarantees SR or better.
 *  5. 50/50 (or 75/25 on limited) — if an SSR+ is off-banner, the *next* one
 *     is guaranteed to be featured. Losing twice in a row is impossible.
 *  6. Duplicates convert to Echoes and push the Astra toward its next star.
 *
 * The roller is pure: hand it a profile + banner + rng and it returns results.
 * Awarding is a separate step so the reveal animation can play first and the
 * currency can be spent atomically.
 */

import { RNG } from '../core/RNG.js';
import { RARITY, RARITY_INFO, MAX_STAR, STAR_TABLE } from '../data/constants.js';
import { getBanner, ssrChanceAt } from '../data/banners.js';
import { ASTRA, getAstra } from '../data/astra.js';
import { save } from '../core/Save.js';
import { bus, EV } from '../core/Events.js';

/** Ensure the pity block exists for a banner. */
export function pityState(profile, bannerId) {
  let st = profile.gacha[bannerId];
  if (!st) {
    st = profile.gacha[bannerId] = {
      total: 0,          // lifetime pulls on this banner
      sinceSSR: 0,       // pulls since the last SSR+
      sinceSR: 0,        // pulls since the last SR+
      guaranteedFeatured: false,
      lastSSR: null,
      history: [],       // last 50 results, for the "recent" panel
    };
  }
  return st;
}

/** Astra eligible on a banner. */
function poolFor(banner, tier) {
  const ids = banner.pool;
  return ASTRA.filter((a) => a.rarity === tier && (!ids || ids.includes(a.id)));
}

/**
 * Roll a single pull. Mutates `st` (the pity block).
 * @returns {{astra: object, tier: number, featured: boolean, pity: string|null}}
 */
function rollOne(banner, st, rng, { forceMinTier = -1 } = {}) {
  st.total++;
  st.sinceSSR++;
  st.sinceSR++;

  let tier = -1;
  let pityKind = null;

  // --- 1. Hard/soft pity on SSR+
  const ssrChance = ssrChanceAt(banner, st.sinceSSR - 1);
  if (rng.float() < ssrChance) {
    // Split SSR vs UR by their relative base rates.
    const ur = banner.rates[RARITY.UR];
    const ssr = banner.rates[RARITY.SSR];
    tier = rng.float() < ur / (ur + ssr) ? RARITY.UR : RARITY.SSR;
    if (st.sinceSSR >= banner.pity.hard) pityKind = 'hard';
    else if (st.sinceSSR > banner.pity.soft) pityKind = 'soft';
  }

  // --- 2. Every-10 SR guarantee
  if (tier < 0 && st.sinceSR >= banner.pity.srEvery) {
    tier = RARITY.SR;
    pityKind = 'sr';
  }

  // --- 3. Normal roll over the remaining tiers
  if (tier < 0) {
    const r = banner.rates;
    const lowTotal = r[RARITY.C] + r[RARITY.R] + r[RARITY.SR];
    let x = rng.float() * lowTotal;
    if ((x -= r[RARITY.SR]) < 0) tier = RARITY.SR;
    else if ((x -= r[RARITY.R]) < 0) tier = RARITY.R;
    else tier = RARITY.C;
  }

  // --- 4. Ten-pull floor
  if (forceMinTier >= 0 && tier < forceMinTier) {
    tier = forceMinTier;
    pityKind = pityKind ?? 'ten';
  }

  // --- 5. Reset counters
  if (tier >= RARITY.SSR) st.sinceSSR = 0;
  if (tier >= RARITY.SR) st.sinceSR = 0;

  // --- 6. Which Astra?
  const featuredAtTier = (banner.featured ?? [])
    .map(getAstra).filter((a) => a && a.rarity === tier);

  let astra = null;
  let featured = false;

  if (tier >= RARITY.SSR && featuredAtTier.length) {
    if (st.guaranteedFeatured) {
      astra = rng.pick(featuredAtTier);
      featured = true;
      st.guaranteedFeatured = false;
      pityKind = pityKind ?? 'guaranteed';
    } else if (rng.float() < (banner.featuredBoost ?? 0.5)) {
      astra = rng.pick(featuredAtTier);
      featured = true;
    } else {
      st.guaranteedFeatured = true;
    }
  } else if (featuredAtTier.length && rng.float() < 0.35) {
    // Featured SR/R still get a modest rate-up so the banner feels themed.
    astra = rng.pick(featuredAtTier);
    featured = true;
  }

  if (!astra) {
    const pool = poolFor(banner, tier);
    astra = pool.length ? rng.pick(pool) : rng.pick(poolFor(banner, RARITY.C));
  }
  if (!astra) astra = ASTRA[0];

  if (tier >= RARITY.SSR) st.lastSSR = astra.id;

  const rec = { id: astra.id, tier, featured, at: Date.now(), pity: pityKind };
  st.history.unshift(rec);
  if (st.history.length > 50) st.history.length = 50;

  return { astra, tier, featured, pity: pityKind };
}

/**
 * Roll `count` pulls without spending anything or writing to the collection.
 * @returns {Array} results
 */
export function preview(bannerId, count, seed) {
  const banner = getBanner(bannerId);
  const st = structuredClone(pityState(save.profile, bannerId));
  const rng = new RNG(seed ?? `preview-${Math.random()}`);
  const out = [];
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const needFloor = count >= 10 && isLast && !out.some((r) => r.tier >= RARITY.SR);
    out.push(rollOne(banner, st, rng, { forceMinTier: needFloor ? RARITY.SR : -1 }));
  }
  return out;
}

/**
 * The real thing: check cost, spend, roll, award, persist.
 *
 * @returns {{ok: boolean, reason?: string, results?: Array, summary?: object}}
 */
export function pull(bannerId, count = 1) {
  const banner = getBanner(bannerId);
  const p = save.profile;
  const cost = count >= 10 ? banner.cost10 : banner.cost1 * count;
  const cur = banner.currency;

  if ((p.currency[cur] ?? 0) < cost) {
    return { ok: false, reason: 'insufficient', need: cost - (p.currency[cur] ?? 0), currency: cur };
  }

  p.currency[cur] -= cost;

  const st = pityState(p, bannerId);
  // Seeded from the profile + pull index: reproducible for support/debugging,
  // but not predictable by the player (they can't see their own pull index
  // ahead of time, and the seed includes a rolling counter).
  const rng = new RNG(`${p.playerId}|${bannerId}|${st.total}|${Date.now() & 0xffff}`);

  const results = [];
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const needFloor = count >= 10 && isLast && !results.some((r) => r.tier >= RARITY.SR);
    results.push(rollOne(banner, st, rng, { forceMinTier: needFloor ? RARITY.SR : -1 }));
  }

  const summary = award(results);
  p.stats.pulls += count;
  p.stats.ssrCount += results.filter((r) => r.tier === RARITY.SSR).length;
  p.stats.urCount += results.filter((r) => r.tier === RARITY.UR).length;
  p.flags.firstPullDone = true;
  save.touch();

  bus.emit(EV.GACHA_PULL, { bannerId, count, results, summary });
  return { ok: true, results, summary, cost, currency: cur };
}

/**
 * Write results into the collection. New Astra are added; duplicates become
 * Echoes (and auto-star if the player has enough, which they always want).
 */
export function award(results) {
  const p = save.profile;
  const summary = { newAstra: [], dupes: [], echoes: 0, stardust: 0, best: -1 };

  for (const r of results) {
    const id = r.astra.id;
    summary.best = Math.max(summary.best, r.tier);
    const info = RARITY_INFO[r.tier];
    let entry = p.collection[id];

    if (!entry) {
      p.collection[id] = {
        stars: 1, dupes: 0, echoes: 0,
        obtainedAt: Date.now(), uses: 0, favourite: false, isNew: true,
      };
      summary.newAstra.push(id);
      r.isNew = true;
      bus.emit(EV.ASTRA_NEW, { id, tier: r.tier });
      // First-time pulls also give a little dust — the "everything is progress" rule.
      p.currency.stardust += Math.round(info.dust * 0.4);
      summary.stardust += Math.round(info.dust * 0.4);
    } else {
      entry.dupes++;
      entry.echoes = (entry.echoes ?? 0) + info.echoes;
      p.currency.echoes += info.echoes;
      p.currency.stardust += info.dust;
      summary.echoes += info.echoes;
      summary.stardust += info.dust;
      summary.dupes.push(id);
      r.isDupe = true;
    }
  }

  if (!p.equipped && summary.newAstra.length) p.equipped = summary.newAstra[0];
  save.touch();
  return summary;
}

/* ============================================================
   STARS
   ============================================================ */

export function starCost(currentStar) {
  return STAR_TABLE[Math.min(currentStar, MAX_STAR - 1)]?.cost ?? Infinity;
}

export function canStarUp(id) {
  const e = save.profile.collection[id];
  if (!e || e.stars >= MAX_STAR) return false;
  return save.profile.currency.echoes >= starCost(e.stars);
}

export function starUp(id) {
  const p = save.profile;
  const e = p.collection[id];
  if (!e || e.stars >= MAX_STAR) return { ok: false, reason: 'max' };
  const cost = starCost(e.stars);
  if (p.currency.echoes < cost) return { ok: false, reason: 'echoes', need: cost - p.currency.echoes };
  p.currency.echoes -= cost;
  e.stars++;
  save.touch();
  bus.emit(EV.ASTRA_STAR, { id, stars: e.stars });
  return { ok: true, stars: e.stars, unlocked: STAR_TABLE[e.stars - 1]?.note };
}

/* ============================================================
   QUERIES for the UI
   ============================================================ */

export function collectionStats() {
  const p = save.profile;
  const owned = Object.keys(p.collection).length;
  const byTier = [0, 0, 0, 0, 0];
  const totalByTier = [0, 0, 0, 0, 0];
  for (const a of ASTRA) {
    totalByTier[a.rarity]++;
    if (p.collection[a.id]) byTier[a.rarity]++;
  }
  return { owned, total: ASTRA.length, byTier, totalByTier, pct: owned / ASTRA.length };
}

export function pityInfo(bannerId) {
  const banner = getBanner(bannerId);
  const st = pityState(save.profile, bannerId);
  return {
    sinceSSR: st.sinceSSR,
    sinceSR: st.sinceSR,
    toHard: Math.max(0, banner.pity.hard - st.sinceSSR),
    toSR: Math.max(0, banner.pity.srEvery - st.sinceSR),
    inSoft: st.sinceSSR >= banner.pity.soft,
    chance: ssrChanceAt(banner, st.sinceSSR),
    guaranteedFeatured: st.guaranteedFeatured,
    total: st.total,
    history: st.history,
  };
}

/** Can the player afford this pull right now? */
export function canAfford(bannerId, count) {
  const b = getBanner(bannerId);
  const cost = count >= 10 ? b.cost10 : b.cost1 * count;
  return {
    cost,
    currency: b.currency,
    ok: (save.profile.currency[b.currency] ?? 0) >= cost,
    have: save.profile.currency[b.currency] ?? 0,
  };
}
