/**
 * Starpass.js — season progress and claiming.
 *
 * State lives on the profile under `pass`. Claims are tracked per tier per
 * track so buying the premium track later retroactively unlocks everything
 * already earned — a player who buys at tier 20 gets tiers 1–20's premium
 * rewards immediately. Anything else punishes people for deciding late.
 */

import { save } from '../core/Save.js';
import { bus, EV } from '../core/Events.js';
import { grantAll } from './Economy.js';
import { SEASON, TIERS, MAX_XP, seasonXpForRun } from '../data/starpass.js';
import { owned as skuOwned } from '../data/shop.js';

const PASS_SKU = 'starpass_season';

function state() {
  const p = save.profile;
  if (!p.pass || p.pass.season !== SEASON.id) {
    p.pass = { season: SEASON.id, xp: 0, claimedFree: [], claimedPremium: [], startedAt: Date.now() };
    save.touch();
  }
  return p.pass;
}

export const hasPremium = () => skuOwned(PASS_SKU);

export function progress() {
  const st = state();
  const xp = Math.min(st.xp, MAX_XP);
  const tier = Math.min(SEASON.tiers, Math.floor(xp / SEASON.xpPerTier));
  const into = xp - tier * SEASON.xpPerTier;
  return {
    xp,
    tier,
    maxTier: SEASON.tiers,
    into,
    need: SEASON.xpPerTier,
    pct: tier >= SEASON.tiers ? 1 : into / SEASON.xpPerTier,
    complete: tier >= SEASON.tiers,
    premium: hasPremium(),
  };
}

/** Add season XP for a finished run. */
export function addRunXp(result) {
  const st = state();
  const before = progress().tier;
  st.xp = Math.min(MAX_XP, st.xp + seasonXpForRun(result));
  save.touch();
  const after = progress().tier;
  if (after > before) {
    bus.emit(EV.TOAST, { text: `Starpass tier ${after}`, tone: 'gold', ttl: 2200, icon: '⬢' });
  }
  return { gained: seasonXpForRun(result), tier: after, tiersGained: after - before };
}

/** Every tier the player has reached but not yet collected, per track. */
export function pending() {
  const st = state();
  const { tier, premium } = progress();
  const free = TIERS.filter((t) => t.n <= tier && !st.claimedFree.includes(t.n));
  const prem = premium ? TIERS.filter((t) => t.n <= tier && !st.claimedPremium.includes(t.n)) : [];
  return { free, premium: prem, total: free.length + prem.length };
}

export function claimTier(n, track = 'free') {
  const st = state();
  const { tier, premium } = progress();
  const t = TIERS.find((x) => x.n === n);
  if (!t || n > tier) return { ok: false, reason: 'locked' };
  if (track === 'premium' && !premium) return { ok: false, reason: 'no_premium' };

  const list = track === 'premium' ? st.claimedPremium : st.claimedFree;
  if (list.includes(n)) return { ok: false, reason: 'claimed' };

  list.push(n);
  const bag = track === 'premium' ? t.premium : t.free;
  grantAll(bag, 'starpass');
  save.touch();
  return { ok: true, bag };
}

/** One tap collects everything outstanding. Nobody wants to press thirty buttons. */
export function claimAll() {
  const p = pending();
  const bag = {};
  const add = (b) => { for (const k in b) bag[k] = (bag[k] ?? 0) + b[k]; };

  for (const t of p.free) { const r = claimTier(t.n, 'free'); if (r.ok) add(r.bag); }
  for (const t of p.premium) { const r = claimTier(t.n, 'premium'); if (r.ok) add(r.bag); }

  return { count: p.total, bag };
}

export function claimed(n, track) {
  const st = state();
  return (track === 'premium' ? st.claimedPremium : st.claimedFree).includes(n);
}

/** ms until the season ends. */
export function msUntilSeasonEnd() {
  const st = state();
  return Math.max(0, st.startedAt + SEASON.days * 86400000 - Date.now());
}

export { SEASON, TIERS };
