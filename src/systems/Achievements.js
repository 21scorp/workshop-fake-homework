/**
 * Achievements.js — long-horizon goals.
 *
 * Dailies give a player a reason to come back tomorrow. Achievements give them
 * a reason to come back next week. They are deliberately *declarative*: each one
 * is a predicate over the profile plus the last run, so there is no progress
 * bookkeeping to drift out of sync with reality — the state of the profile is
 * always the source of truth, even if a save is imported from another device.
 *
 * Rewards are granted the moment the condition is met. Nothing to collect, no
 * screen to remember to visit. The only ceremony is the toast.
 */

import { save } from '../core/Save.js';
import { bus, EV } from '../core/Events.js';
import { grantAll } from './Economy.js';
import { ASTRA } from '../data/astra.js';
import { RARITY } from '../data/constants.js';
import { ENEMY_LIST, BOSSES } from '../data/enemies.js';

/**
 * @typedef {Object} Achievement
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {string} icon
 * @property {string} group
 * @property {(ctx: EvalCtx) => number} progress   0..1
 * @property {Object} reward
 * @property {boolean} [secret]
 */

/** @typedef {{p: object, run: object|null, owned: number, byTier: number[]}} EvalCtx */

const ratio = (v, target) => Math.max(0, Math.min(1, v / target));

export const ACHIEVEMENTS = [
  /* ---------------- first steps ---------------- */
  { id: 'first_run', group: 'Begin', icon: '▶', name: 'Eerste val',
    desc: 'Speel je eerste run',
    progress: (c) => ratio(c.p.stats.runs, 1), reward: { stardust: 200 } },
  { id: 'first_pull', group: 'Begin', icon: '✦', name: 'Eerste roep',
    desc: 'Doe je eerste summon',
    progress: (c) => ratio(c.p.stats.pulls, 1), reward: { stardust: 300 } },
  { id: 'first_boss', group: 'Begin', icon: '☠', name: 'Poortwachter',
    desc: 'Versla je eerste boss',
    progress: (c) => ratio(c.p.stats.bossesKilled, 1), reward: { shards: 20 } },
  { id: 'first_ult', group: 'Begin', icon: '◉', name: 'Ontketend',
    desc: 'Gebruik je eerste ultimate',
    progress: (c) => ratio(c.p.stats.ultsFired, 1), reward: { stardust: 150 } },

  /* ---------------- depth ---------------- */
  { id: 'wave_5', group: 'Diepte', icon: '▼', name: 'De Wieg voorbij',
    desc: 'Bereik golf 5',
    progress: (c) => ratio(c.p.stats.bestWave, 5), reward: { stardust: 400 } },
  { id: 'wave_10', group: 'Diepte', icon: '▼', name: 'De Smidse in',
    desc: 'Bereik golf 10',
    progress: (c) => ratio(c.p.stats.bestWave, 10), reward: { shards: 25, cores: 5 } },
  { id: 'wave_15', group: 'Diepte', icon: '▼', name: 'Door de Tuin',
    desc: 'Bereik golf 15',
    progress: (c) => ratio(c.p.stats.bestWave, 15), reward: { shards: 40, cores: 10 } },
  { id: 'wave_20', group: 'Diepte', icon: '▼', name: 'Achter de Sluier',
    desc: 'Bereik golf 20',
    progress: (c) => ratio(c.p.stats.bestWave, 20), reward: { shards: 80, cores: 20 } },

  /* ---------------- score ---------------- */
  { id: 'score_10k', group: 'Score', icon: '★', name: 'Vijf cijfers',
    desc: 'Scoor 10.000 in één run',
    progress: (c) => ratio(c.p.stats.bestScore, 10000), reward: { stardust: 500 } },
  { id: 'score_50k', group: 'Score', icon: '★', name: 'Serieus',
    desc: 'Scoor 50.000 in één run',
    progress: (c) => ratio(c.p.stats.bestScore, 50000), reward: { shards: 30 } },
  { id: 'score_150k', group: 'Score', icon: '★', name: 'Buiten categorie',
    desc: 'Scoor 150.000 in één run',
    progress: (c) => ratio(c.p.stats.bestScore, 150000), reward: { shards: 90, cores: 25 } },

  /* ---------------- combat ---------------- */
  { id: 'kills_500', group: 'Strijd', icon: '✖', name: 'Opruimdienst',
    desc: 'Versla 500 vijanden in totaal',
    progress: (c) => ratio(c.p.stats.kills, 500), reward: { stardust: 400 } },
  { id: 'kills_5000', group: 'Strijd', icon: '✖', name: 'Sterrenvuil',
    desc: 'Versla 5.000 vijanden in totaal',
    progress: (c) => ratio(c.p.stats.kills, 5000), reward: { shards: 50, cores: 15 } },
  { id: 'combo_50', group: 'Strijd', icon: '⟫', name: 'Op dreef',
    desc: 'Haal een 50× combo',
    progress: (c) => ratio(c.p.stats.bestCombo, 50), reward: { stardust: 350 } },
  { id: 'combo_150', group: 'Strijd', icon: '⟫', name: 'Onaantastbaar',
    desc: 'Haal een 150× combo',
    progress: (c) => ratio(c.p.stats.bestCombo, 150), reward: { shards: 35 } },
  { id: 'boss_10', group: 'Strijd', icon: '☠', name: 'Bossenjager',
    desc: 'Versla 10 bosses',
    progress: (c) => ratio(c.p.stats.bossesKilled, 10), reward: { shards: 45, cores: 12 } },
  { id: 'survive_180', group: 'Strijd', icon: '◷', name: 'Drie minuten',
    desc: 'Overleef 180 seconden in één run',
    progress: (c) => ratio(c.p.stats.bestTime, 180), reward: { shards: 30 } },

  /* ---------------- collection ---------------- */
  { id: 'own_5', group: 'Verzameling', icon: '◈', name: 'Gezelschap',
    desc: 'Bezit 5 Astra',
    progress: (c) => ratio(c.owned, 5), reward: { stardust: 400 } },
  { id: 'own_12', group: 'Verzameling', icon: '◈', name: 'Constellatie',
    desc: 'Bezit 12 Astra',
    progress: (c) => ratio(c.owned, 12), reward: { shards: 35, echoes: 40 } },
  { id: 'own_all', group: 'Verzameling', icon: '◈', name: 'Compleet',
    desc: 'Bezit elke Astra',
    progress: (c) => ratio(c.owned, ASTRA.length), reward: { shards: 200, cores: 50 } },
  { id: 'first_ssr', group: 'Verzameling', icon: '✧', name: 'Stellair',
    desc: 'Trek je eerste Stellar Astra',
    progress: (c) => ratio(c.p.stats.ssrCount, 1), reward: { shards: 25 } },
  { id: 'first_ur', group: 'Verzameling', icon: '✵', name: 'Ultra',
    desc: 'Trek een Ultra Astra',
    progress: (c) => ratio(c.p.stats.urCount, 1), reward: { shards: 120 } },
  { id: 'star_3', group: 'Verzameling', icon: '★', name: 'Doorontwikkeld',
    desc: 'Breng een Astra naar ★3',
    progress: (c) => ratio(Math.max(0, ...Object.values(c.p.collection).map((e) => e.stars ?? 0)), 3),
    reward: { echoes: 40 } },
  { id: 'star_5', group: 'Verzameling', icon: '★', name: 'Maximaal',
    desc: 'Breng een Astra naar ★5',
    progress: (c) => ratio(Math.max(0, ...Object.values(c.p.collection).map((e) => e.stars ?? 0)), 5),
    reward: { shards: 100, echoes: 120 } },

  /* ---------------- habits ---------------- */
  { id: 'streak_7', group: 'Gewoonte', icon: '🔥', name: 'Een week',
    desc: 'Haal een inlogreeks van 7 dagen',
    progress: (c) => ratio(c.p.daily.bestStreak, 7), reward: { shards: 60 } },
  { id: 'runs_50', group: 'Gewoonte', icon: '↻', name: 'Nog één keer',
    desc: 'Speel 50 runs',
    progress: (c) => ratio(c.p.stats.runs, 50), reward: { shards: 40, cores: 10 } },
  { id: 'daily_played', group: 'Gewoonte', icon: '◈', name: 'Zelfde hemel',
    desc: 'Speel de dagelijkse seed',
    progress: (c) => (Object.keys(c.p.daily.seedScores).length > 0 ? 1 : 0), reward: { stardust: 250 } },
  { id: 'cards_200', group: 'Gewoonte', icon: '⌘', name: 'Bouwer',
    desc: 'Kies 200 kaarten',
    progress: (c) => ratio(c.p.stats.cardsPicked, 200), reward: { stardust: 600 } },

  /* ---------------- the difficult ones ---------------- */
  { id: 'flawless_wave5', group: 'Meesterschap', icon: '♦', name: 'Ongeschonden',
    desc: 'Bereik golf 5 zonder één treffer',
    progress: (c) => (c.run && c.run.wave >= 5 && c.run.hitsTaken === 0 ? 1 : 0),
    reward: { shards: 50 } },
  { id: 'common_hero', group: 'Meesterschap', icon: '◇', name: 'Onderschat',
    desc: 'Bereik golf 10 met een Common Astra',
    progress: (c) => {
      if (!c.run || c.run.wave < 10) return 0;
      const a = ASTRA.find((x) => x.id === c.run.astraId);
      return a && a.rarity === RARITY.C ? 1 : 0;
    },
    reward: { shards: 60, cores: 15 } },
  { id: 'no_ult', group: 'Meesterschap', icon: '○', name: 'Zonder vangnet',
    desc: 'Bereik golf 8 zonder je ultimate te gebruiken',
    progress: (c) => (c.run && c.run.wave >= 8 && (c.run.ultsFired ?? 0) === 0 ? 1 : 0),
    reward: { shards: 45 } },

  /* ---------------- anomalies ---------------- */
  { id: 'anom_three', group: 'Diepte', icon: '⚠', name: 'Drie hemels',
    desc: 'Overleef tot drie anomalieën tegelijk',
    progress: (c) => ratio(c.run?.anomalies?.length ?? 0, 3), reward: { stardust: 700 } },
  { id: 'anom_five', group: 'Diepte', icon: '⚠', name: 'De lucht is stuk',
    desc: 'Overleef tot vijf anomalieën tegelijk',
    progress: (c) => ratio(c.run?.anomalies?.length ?? 0, 5), reward: { shards: 60 } },

  /* ---------------- bestiary ----------------
     Declarative like the rest: the bestiary itself is the state, so these
     cannot drift and an imported save unlocks them the moment it lands. */
  { id: 'bes_half', group: 'Bestiarium', icon: '☰', name: 'Veldnotities',
    desc: 'Ontmoet de helft van alles wat er rondvliegt',
    progress: (c) => ratio(bestiaryKnown(c.p), Math.ceil(BESTIARY_TOTAL / 2)),
    reward: { stardust: 900 } },
  { id: 'bes_all', group: 'Bestiarium', icon: '☰', name: 'Volledig bestiarium',
    desc: 'Ontmoet elke vijand en elke baas',
    progress: (c) => ratio(bestiaryKnown(c.p), BESTIARY_TOTAL),
    reward: { shards: 120 } },
  { id: 'bes_bosses', group: 'Bestiarium', icon: '☠', name: 'Alle drie',
    desc: 'Versla elke baas minstens één keer',
    progress: (c) => ratio(BOSSES.filter((b) => (c.p.bestiary?.[`boss/${b.id}`]?.kills ?? 0) > 0).length, BOSSES.length),
    reward: { shards: 90 } },
];

/** How many bestiary rows exist, and how many this profile has met. */
const BESTIARY_TOTAL = ENEMY_LIST.length + BOSSES.length;
const bestiaryKnown = (p) => {
  const b = p.bestiary ?? {};
  let n = 0;
  for (const e of ENEMY_LIST) if (b[e.id]) n++;
  for (const boss of BOSSES) if (b[`boss/${boss.id}`]) n++;
  return n;
};

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/* ------------------------------------------------------------------ */

function ctx(run) {
  const p = save.profile;
  const owned = Object.keys(p.collection).length;
  return { p, run, owned };
}

/** Unlocked map lives on the profile; created lazily so old saves work. */
function store() {
  const p = save.profile;
  if (!p.achievements) p.achievements = {};
  return p.achievements;
}

/**
 * Re-evaluate everything and grant anything newly completed.
 * Cheap enough to call after every run and every pull.
 * @param {object|null} run the run that just ended, if any
 * @returns {Array} newly unlocked achievements
 */
export function evaluate(run = null) {
  const c = ctx(run);
  const st = store();
  const unlocked = [];

  for (const a of ACHIEVEMENTS) {
    if (st[a.id]) continue;
    let pr = 0;
    try { pr = a.progress(c); } catch { pr = 0; }
    if (pr >= 1) {
      st[a.id] = { at: Date.now() };
      grantAll(a.reward, 'achievement');
      unlocked.push(a);
    }
  }

  if (unlocked.length) {
    save.touch();
    // Stagger the toasts so three at once don't land on top of each other.
    unlocked.forEach((a, i) => {
      setTimeout(() => {
        bus.emit(EV.TOAST, { text: a.name, tone: 'gold', ttl: 2400, icon: a.icon });
      }, 500 + i * 1500);
    });
  }
  return unlocked;
}

/** Everything, with live progress, for the achievements sheet. */
export function list() {
  const c = ctx(null);
  const st = store();
  return ACHIEVEMENTS.map((a) => {
    let pr = 0;
    try { pr = a.progress(c); } catch { pr = 0; }
    const done = !!st[a.id];
    return { ...a, done, progress: done ? 1 : Math.min(pr, 0.999) };
  });
}

export function summary() {
  const st = store();
  const done = ACHIEVEMENTS.filter((a) => st[a.id]).length;
  return { done, total: ACHIEVEMENTS.length, pct: done / ACHIEVEMENTS.length };
}

export const getAchievement = (id) => BY_ID.get(id) ?? null;

/** Groups in display order. */
export const GROUPS = ['Begin', 'Diepte', 'Score', 'Strijd', 'Verzameling', 'Bestiarium', 'Gewoonte', 'Meesterschap'];
