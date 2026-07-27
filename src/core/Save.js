/**
 * Save.js — versioned local profile.
 *
 * Single source of truth for everything persistent: currency, collection, pity
 * counters, settings, records. Writes are debounced and wrapped, because a
 * localStorage failure (private mode, quota) must degrade to a memory-only
 * session rather than crash the game.
 */

import { bus, EV } from './Events.js';

const KEY = 'astrafall.profile.v1';
const BACKUP_KEY = 'astrafall.profile.backup';
const SCHEMA = 4;

export function defaultProfile() {
  const now = Date.now();
  return {
    v: SCHEMA,
    createdAt: now,
    lastSeen: now,
    playerId: 'AF' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    name: 'Pilot',

    account: { level: 1, xp: 0 },

    currency: {
      stardust: 1600,   // enough for a taste of the banner on day one
      shards: 60,
      echoes: 0,
      cores: 0,
    },

    /** astraId → { stars, dupes, obtainedAt, uses, favourite } */
    collection: {},
    equipped: null,
    /** Two support Astra alongside `equipped`. See systems/Loadout.js. */
    loadout: [null, null],

    /** bannerId → pity state */
    gacha: {},

    stats: {
      runs: 0, kills: 0, deaths: 0,
      bestScore: 0, bestWave: 0, bestCombo: 0, bestTime: 0,
      totalTime: 0, totalScore: 0,
      pulls: 0, ssrCount: 0, urCount: 0,
      cardsPicked: 0, bossesKilled: 0, ultsFired: 0,
    },

    /** Permanent meta upgrades bought with Cores. */
    meta: { upgrades: {} },

    daily: {
      lastClaimDay: null,
      streak: 0,
      bestStreak: 0,
      questDay: null,
      quests: [],
      freePullDay: null,
      trialDay: null,
      seedScores: {},      // seedCode → best score
    },

    settings: {
      sfx: 0.8,
      music: 0.55,
      haptics: true,
      quality: 'auto',     // auto | high | low
      reducedFlash: false,
      showFps: false,
      hand: 'right',
      lang: 'nl',
    },

    flags: {
      tutorialDone: false,
      firstPullDone: false,
      seenStore: false,
      installPrompted: false,
    },

    /** Last 20 run summaries — powers the local leaderboard and share card. */
    history: [],

    /** Owned SKUs / entitlements. Mirrors what a real IAP receipt store holds. */
    entitlements: {},

    /** achievementId → { at } for everything unlocked. */
    achievements: {},

    /** Season pass progress; reset when the season id changes. */
    pass: null,
  };
}

/* ------------------------------------------------------------------
   Migrations. Each function takes the old object and returns the new one.
   Index N migrates schema N → N+1.
   ------------------------------------------------------------------ */

const MIGRATIONS = {
  1: (p) => { p.loadout ??= [null, null]; p.entitlements ??= {}; return p; },
  2: (p) => { p.daily.seedScores ??= {}; p.stats.ultsFired ??= 0; return p; },
  3: (p) => { p.settings.lang ??= 'nl'; p.stats.bestTime ??= 0; p.achievements ??= {}; return p; },
};

/** Fill in anything a migration or a hand-edited save left out. */
function reconcile(profile) {
  const base = defaultProfile();
  const merge = (dst, src) => {
    for (const k in src) {
      if (dst[k] === undefined) dst[k] = structuredCloneSafe(src[k]);
      else if (isPlain(src[k]) && isPlain(dst[k])) merge(dst[k], src[k]);
    }
    return dst;
  };
  return merge(profile, base);
}

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const structuredCloneSafe = (v) => {
  try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); }
};

/* ------------------------------------------------------------------ */

class SaveStore {
  constructor() {
    this.available = probeStorage();
    this.profile = this.load();
    this._dirty = false;
    this._timer = null;
    this._writeErrors = 0;

    // Never lose a session to a background kill.
    window.addEventListener('pagehide', () => this.flush());
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  load() {
    if (!this.available) return defaultProfile();
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (!raw) return defaultProfile();

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error('[save] corrupt profile, trying backup', err);
      try { data = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); } catch { data = null; }
      if (!data) return defaultProfile();
    }

    let v = data.v ?? 1;
    while (v < SCHEMA && MIGRATIONS[v]) {
      try { data = MIGRATIONS[v](data) ?? data; } catch (e) { console.error('[save] migration failed at v' + v, e); break; }
      v++;
      data.v = v;
    }
    data.v = SCHEMA;
    return reconcile(data);
  }

  /** Mark dirty; the actual write is debounced. */
  touch() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, 600);
  }

  flush() {
    if (!this._dirty || !this.available) return;
    this._dirty = false;
    this.profile.lastSeen = Date.now();
    try {
      const json = JSON.stringify(this.profile);
      // Keep the previous good write around so corruption is recoverable.
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);
      localStorage.setItem(KEY, json);
      this._writeErrors = 0;
    } catch (err) {
      this._writeErrors++;
      if (this._writeErrors === 1) {
        console.warn('[save] write failed — continuing in memory only', err);
        bus.emit(EV.TOAST, { text: 'Opslag niet beschikbaar — voortgang bewaart niet', tone: 'bad' });
      }
    }
  }

  /** Mutate + persist in one call: `save.update(p => { p.currency.cores += 3 })`. */
  update(fn) {
    const r = fn(this.profile);
    this.touch();
    return r;
  }

  reset() {
    this.profile = defaultProfile();
    this._dirty = true;
    this.flush();
    bus.emit(EV.TOAST, { text: 'Profiel gewist', tone: 'bad' });
  }

  /** Export for the "transfer to another device" flow (base64 JSON). */
  export() {
    const json = JSON.stringify(this.profile);
    return btoa(unescape(encodeURIComponent(json)));
  }

  import(code) {
    try {
      const json = decodeURIComponent(escape(atob(code.trim())));
      const data = JSON.parse(json);
      if (!data || typeof data !== 'object' || !data.currency) throw new Error('shape');
      this.profile = reconcile(data);
      this._dirty = true;
      this.flush();
      return true;
    } catch (err) {
      console.error('[save] import failed', err);
      return false;
    }
  }
}

function probeStorage() {
  try {
    const k = '__af_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    console.warn('[save] localStorage unavailable — memory-only session');
    return false;
  }
}

export const save = new SaveStore();
/** Convenience alias — read-only usage all over the codebase. */
export const P = () => save.profile;
export default save;
