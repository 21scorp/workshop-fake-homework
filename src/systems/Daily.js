/**
 * Daily.js — login streak, daily quests, daily seed.
 *
 * The daily loop is the retention layer, and it is deliberately generous: the
 * streak reward curve is steep enough that missing a day *stings*, but a broken
 * streak restores to day 3 rather than day 1, because punishing people for
 * having a life is how you lose them permanently.
 */

import { save } from '../core/Save.js';
import { bus, EV } from '../core/Events.js';
import { grantAll } from './Economy.js';
import { dailySeedCode, RNG } from '../core/RNG.js';
import { ASTRA } from '../data/astra.js';
import { RARITY } from '../data/constants.js';

/** Local calendar day key, so "today" matches the player's midnight. */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a, b) {
  const pa = new Date(a + 'T00:00:00');
  const pb = new Date(b + 'T00:00:00');
  return Math.round((pb - pa) / 86400000);
}

/* ============================================================
   LOGIN STREAK
   ============================================================ */

/** 7-day cycle; day 7 is worth showing off. */
export const STREAK_REWARDS = [
  { day: 1, bag: { stardust: 300 } },
  { day: 2, bag: { stardust: 400 } },
  { day: 3, bag: { stardust: 500, echoes: 10 } },
  { day: 4, bag: { stardust: 650 } },
  { day: 5, bag: { shards: 40 } },
  { day: 6, bag: { stardust: 900, cores: 5 } },
  { day: 7, bag: { shards: 100, stardust: 1200 }, big: true, label: 'Gegarandeerde SR+' },
];

export function streakState() {
  const d = save.profile.daily;
  const today = dayKey();
  const claimedToday = d.lastClaimDay === today;
  let streak = d.streak ?? 0;

  if (d.lastClaimDay && !claimedToday) {
    const gap = daysBetween(d.lastClaimDay, today);
    if (gap > 1) streak = Math.min(streak, 2);   // soft reset, never to zero
  }

  const cycleDay = (streak % 7) + (claimedToday ? 0 : 1);
  return {
    streak,
    claimedToday,
    bestStreak: d.bestStreak ?? 0,
    nextDay: Math.min(7, cycleDay),
    rewards: STREAK_REWARDS,
  };
}

export function claimDaily() {
  const st = streakState();
  if (st.claimedToday) return { ok: false, reason: 'claimed' };

  const d = save.profile.daily;
  const today = dayKey();
  const gap = d.lastClaimDay ? daysBetween(d.lastClaimDay, today) : 1;
  d.streak = gap === 1 ? (d.streak ?? 0) + 1 : Math.min((d.streak ?? 0), 2) + 1;
  d.bestStreak = Math.max(d.bestStreak ?? 0, d.streak);
  d.lastClaimDay = today;

  const reward = STREAK_REWARDS[(d.streak - 1) % 7];
  grantAll(reward.bag, 'daily');
  save.touch();

  bus.emit(EV.TOAST, { text: `Dag ${d.streak} beloning!`, tone: 'gold', ttl: 2200 });
  return { ok: true, streak: d.streak, reward };
}

/* ============================================================
   FREE DAILY SUMMON
   ============================================================ */

export function freePullAvailable() {
  return save.profile.daily.freePullDay !== dayKey();
}

export function consumeFreePull() {
  save.profile.daily.freePullDay = dayKey();
  save.touch();
}

/* ============================================================
   DAILY QUESTS
   ============================================================ */

const QUEST_POOL = [
  { id: 'runs3',    text: 'Speel 3 runs',                target: 3,    stat: 'runs',      bag: { stardust: 260 } },
  { id: 'kills150', text: 'Versla 150 vijanden',         target: 150,  stat: 'kills',     bag: { stardust: 300 } },
  { id: 'wave5',    text: 'Bereik golf 5',               target: 5,    stat: 'wave',      bag: { stardust: 400, cores: 2 } },
  { id: 'boss1',    text: 'Versla 1 boss',               target: 1,    stat: 'bosses',    bag: { shards: 15 } },
  { id: 'combo30',  text: 'Haal een 30× combo',          target: 30,   stat: 'combo',     bag: { stardust: 320 } },
  { id: 'cards10',  text: 'Kies 10 kaarten',             target: 10,   stat: 'cards',     bag: { stardust: 280 } },
  { id: 'ult3',     text: 'Gebruik 3 ultimates',         target: 3,    stat: 'ults',      bag: { stardust: 240 } },
  { id: 'score5k',  text: 'Scoor 5.000 in één run',      target: 5000, stat: 'bestScore', bag: { shards: 12 }, single: true },
  { id: 'daily1',   text: 'Speel de Dagelijkse Seed',    target: 1,    stat: 'daily',     bag: { shards: 10 } },
];

export function todaysQuests() {
  const d = save.profile.daily;
  const today = dayKey();
  if (d.questDay !== today || !d.quests?.length) {
    // Deterministic per day so a reload can't reroll into easier quests.
    const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
    const pool = QUEST_POOL.slice();
    const picked = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = (seed * (i + 7) * 31) % pool.length;
      picked.push({ ...pool[idx], progress: 0, claimed: false });
      pool.splice(idx, 1);
    }
    d.questDay = today;
    d.quests = picked;
    save.touch();
  }
  return d.quests;
}

/** Feed a finished run into today's quests. */
export function progressQuests(runResult) {
  const quests = todaysQuests();
  let changed = false;
  const add = (stat, value, single = false) => {
    for (const q of quests) {
      if (q.stat !== stat || q.claimed) continue;
      const next = q.single || single ? Math.max(q.progress, value) : q.progress + value;
      if (next !== q.progress) { q.progress = next; changed = true; }
    }
  };

  add('runs', 1);
  add('kills', runResult.kills ?? 0);
  add('wave', runResult.wave ?? 0, true);
  add('bosses', runResult.bossesKilled ?? 0);
  add('combo', runResult.maxCombo ?? 0, true);
  add('cards', runResult.cards?.length ?? 0);
  add('ults', runResult.ultsFired ?? 0);
  add('bestScore', runResult.score ?? 0, true);
  if (runResult.isDaily) add('daily', 1);

  if (changed) save.touch();
  return quests;
}

export function claimQuest(id) {
  const q = todaysQuests().find((x) => x.id === id);
  if (!q || q.claimed || q.progress < q.target) return { ok: false };
  q.claimed = true;
  grantAll(q.bag, 'quest');
  save.touch();
  bus.emit(EV.QUEST_DONE, q);
  return { ok: true, bag: q.bag };
}

export const questsComplete = () => todaysQuests().every((q) => q.claimed);

/* ============================================================
   TRIAL ASTRA — one free flight a day with something you don't own

   The hardest thing to sell in a gacha is a unit nobody has felt. A player who
   has flown SOLARIS for ninety seconds knows exactly what they'd be pulling
   for; a player looking at a stat block does not. So every day one Astra you
   don't have is unlocked for a single run, at two stars, for free.

   It costs nothing to give away — the run is over in two minutes — and it is
   the most honest advertisement the game can make.
   ============================================================ */

export function trialAstra() {
  const rng = new RNG(`trial-${dayKey()}`);
  const owned = save.profile.collection;
  const unowned = ASTRA.filter((a) => !owned[a.id] && a.rarity >= RARITY.SR);
  // Everything owned? Then the trial is a high-star loan instead of a demo.
  const pool = unowned.length ? unowned : ASTRA.filter((a) => a.rarity >= RARITY.SSR);
  return rng.pick(pool) ?? ASTRA[0];
}

export const trialStars = () => 2;
export const trialUsed = () => save.profile.daily.trialDay === dayKey();

export function consumeTrial() {
  save.profile.daily.trialDay = dayKey();
  save.touch();
}

/* ============================================================
   DAILY SEED
   ============================================================ */

export function dailySeed() {
  return dailySeedCode();
}

export function dailyBest() {
  return save.profile.daily.seedScores[dailySeed()] ?? 0;
}

/** ms until the daily rotates (UTC midnight). */
export function msUntilReset() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}
