/**
 * Economy.js — currency, account XP, run rewards.
 *
 * One rule governs the whole economy: **every run pays.** A player who dies in
 * 20 seconds still leaves with Stardust, still moves their pity counter closer,
 * still sees a number go up. The moment a run can feel wasted is the moment the
 * "one more try" loop breaks.
 */

import { save } from '../core/Save.js';
import { bus, EV } from '../core/Events.js';
import { CURRENCY, xpForLevel, levelReward } from '../data/constants.js';
import { clamp } from '../core/Math2.js';

/** Add currency. Negative amounts are a spend — use `spend()` for those. */
export function grant(kind, amount, reason = '') {
  if (!CURRENCY[kind] || !amount) return 0;
  const p = save.profile;
  p.currency[kind] = Math.max(0, (p.currency[kind] ?? 0) + amount);
  save.touch();
  bus.emit(EV.CURRENCY, { kind, amount, total: p.currency[kind], reason });
  return p.currency[kind];
}

export function spend(kind, amount, reason = '') {
  const p = save.profile;
  if ((p.currency[kind] ?? 0) < amount) return false;
  p.currency[kind] -= amount;
  save.touch();
  bus.emit(EV.CURRENCY, { kind, amount: -amount, total: p.currency[kind], reason });
  return true;
}

export const balance = (kind) => save.profile.currency[kind] ?? 0;
export const canAfford = (kind, amount) => balance(kind) >= amount;

/** Grant a bag: `{ stardust: 200, shards: 10 }`. */
export function grantAll(bag, reason = '') {
  const out = {};
  for (const k in bag) if (bag[k]) out[k] = grant(k, bag[k], reason);
  if (Object.keys(bag).length) bus.emit(EV.REWARD, { bag, reason });
  return out;
}

/* ============================================================
   ACCOUNT LEVEL
   ============================================================ */

export function addAccountXp(amount) {
  const p = save.profile;
  p.account.xp += Math.max(0, Math.round(amount));
  const gained = [];
  while (p.account.xp >= xpForLevel(p.account.level)) {
    p.account.xp -= xpForLevel(p.account.level);
    p.account.level++;
    const reward = levelReward(p.account.level);
    grantAll(reward, 'levelup');
    gained.push({ level: p.account.level, reward });
    bus.emit(EV.LEVEL_ACCOUNT, { level: p.account.level, reward });
  }
  save.touch();
  return gained;
}

export function accountProgress() {
  const p = save.profile;
  const need = xpForLevel(p.account.level);
  return { level: p.account.level, xp: p.account.xp, need, pct: clamp(p.account.xp / need, 0, 1) };
}

/* ============================================================
   RUN REWARDS
   ============================================================ */

/**
 * Turn a finished run into currency and XP.
 *
 * The curve is deliberately front-loaded: the first minute of a run pays a lot
 * per second, later minutes pay less. That rewards *starting* runs (which is
 * the habit we want) rather than grinding one long one.
 */
export function runRewards(result) {
  const {
    score = 0, wave = 1, time = 0, kills = 0,
    bossesKilled = 0, isDaily = false, isNewBest = false, level = 1,
  } = result;

  const base = Math.round(score * 0.01);
  const waveBonus = Math.round(Math.pow(wave, 1.35) * 14);
  const killBonus = Math.round(kills * 0.7);
  const bossBonus = bossesKilled * 180;
  const timeBonus = Math.round(Math.min(time, 90) * 1.6);

  let stardust = base + waveBonus + killBonus + bossBonus + timeBonus;
  let shards = 0;
  let cores = Math.floor(wave / 3) + bossesKilled * 2;

  if (isDaily) { stardust = Math.round(stardust * 1.5); shards += 5; }
  if (isNewBest) { stardust = Math.round(stardust * 1.25); shards += 3; }
  if (bossesKilled > 0) shards += bossesKilled;

  const xp = Math.round(score * 0.009 + wave * 22 + kills * 0.5 + bossesKilled * 120);

  return { stardust, shards, cores, xp, breakdown: { base, waveBonus, killBonus, bossBonus, timeBonus } };
}

/** Apply run rewards and update lifetime stats + history. */
export function commitRun(result) {
  const p = save.profile;
  const rewards = runRewards(result);

  grantAll({ stardust: rewards.stardust, shards: rewards.shards, cores: rewards.cores }, 'run');
  const levels = addAccountXp(rewards.xp);

  const s = p.stats;
  s.runs++;
  s.kills += result.kills ?? 0;
  s.deaths += result.died ? 1 : 0;
  s.totalTime += result.time ?? 0;
  s.totalScore += result.score ?? 0;
  s.cardsPicked += result.cards?.length ?? 0;
  s.bossesKilled += result.bossesKilled ?? 0;
  s.ultsFired += result.ultsFired ?? 0;
  s.bestScore = Math.max(s.bestScore, result.score ?? 0);
  s.bestWave = Math.max(s.bestWave, result.wave ?? 0);
  s.bestCombo = Math.max(s.bestCombo, result.maxCombo ?? 0);
  s.bestTime = Math.max(s.bestTime, result.time ?? 0);

  if (result.astraId && p.collection[result.astraId]) p.collection[result.astraId].uses++;

  // Collect what this run met for the first time — the results screen shows
  // it, which is the only place the discovery is worth a beat.
  const discovered = [];
  for (const id in result.bestiary ?? {}) {
    if (!p.bestiary[id]) discovered.push(id);
    const entry = (p.bestiary[id] ??= { seen: 0, kills: 0, firstAt: Date.now() });
    entry.seen += result.bestiary[id].seen;
    entry.kills += result.bestiary[id].kills;
  }

  if (result.seed) {
    const prev = p.daily.seedScores[result.seed] ?? 0;
    if ((result.score ?? 0) > prev) p.daily.seedScores[result.seed] = result.score;
  }

  p.history.unshift({
    at: Date.now(),
    score: result.score ?? 0,
    wave: result.wave ?? 1,
    time: Math.round((result.time ?? 0) * 10) / 10,
    kills: result.kills ?? 0,
    astraId: result.astraId,
    seed: result.seed,
    cards: (result.cards ?? []).map((c) => c.id),
    maxCombo: result.maxCombo ?? 0,
  });
  if (p.history.length > 20) p.history.length = 20;

  save.touch();
  return { rewards, levels, discovered };
}

/** Local leaderboard: best runs on this device, newest tiebreak. */
export function leaderboard(limit = 10) {
  return [...save.profile.history]
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, limit);
}
