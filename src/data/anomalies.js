/**
 * anomalies.js — run modifiers.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  WHY
 * ─────────────────────────────────────────────────────────────────────────
 *  Past wave ten the run stopped being a different fight and started being
 *  the same fight with bigger numbers. Scaling extends a run; it does not
 *  vary one. Every fifty seconds of a deep run looked like the fifty before
 *  it, which is exactly where "one more try" stops working.
 *
 *  So every fourth wave the sky changes. An anomaly is a small set of
 *  multipliers with a name and a promise, announced before it lands, listed
 *  on the results screen afterwards. Half of them help you. That matters: a
 *  modifier system where every entry is a tax reads as difficulty creep, and
 *  one where every entry is a gift reads as noise. A twist has to be able to
 *  go either way, so the announcement is worth reading.
 *
 *  They are drawn from the run's seeded stream, so a shared `?s=CODE` link
 *  reproduces the same anomalies in the same order — otherwise the daily seed
 *  would stop being a fair comparison the moment this existed.
 *
 *  Every field here is a multiplier the run already applies somewhere. That
 *  is deliberate: an anomaly cannot introduce a code path of its own, so it
 *  cannot break one either.
 */

/**
 * @typedef {Object} Anomaly
 * @property {string} id
 * @property {string} name
 * @property {string} desc     one line, shown in the banner and the results
 * @property {string} icon
 * @property {string} color
 * @property {boolean} [boon]  true when it is on the player's side
 * @property {Object} mods     multipliers, all optional and all default to 1
 */

/** @type {Anomaly[]} */
export const ANOMALIES = [
  {
    id: 'swift', name: 'VERSNELLING', icon: '⏩', color: '#22d3ee',
    desc: 'Alles beweegt sneller. Ook jij.',
    mods: { enemySpeed: 1.3, playerSpeed: 1.18 },
  },
  {
    id: 'swarm', name: 'ZWERMTIJ', icon: '❋', color: '#fb7185',
    desc: 'Meer vijanden, maar ze zijn broos.',
    mods: { density: 1.5, enemyHp: 0.62 },
  },
  {
    id: 'bounty', name: 'PREMIEJACHT', icon: '◈', color: '#fbbf24', boon: true,
    desc: 'Dubbele Prisms. Vijanden slaan harder terug.',
    mods: { prismValue: 2, enemyDmg: 1.5 },
  },
  {
    id: 'overcharge', name: 'OVERLADING', icon: '⚡', color: '#a855f7', boon: true,
    desc: 'Je vuurt de helft sneller. Hun kogels ook.',
    mods: { fireRate: 1.5, enemyBulletSpeed: 1.3 },
  },
  {
    id: 'bulwark', name: 'BOLWERK', icon: '❤', color: '#34d399', boon: true,
    desc: 'Je begint deze golf met een extra hart.',
    mods: { grantHp: 1 },
  },
  {
    id: 'gravity', name: 'ZWAARTEKRACHT', icon: '⬇', color: '#818cf8',
    desc: 'Vijanden zakken sneller. Prisms komen naar je toe.',
    mods: { enemySpeed: 1.22, magnet: 2.2 },
  },
  {
    id: 'iron', name: 'IJZERTIJ', icon: '⬢', color: '#94a3b8',
    desc: 'Taaiere vijanden, minder van ze, meer punten.',
    mods: { enemyHp: 1.45, density: 0.72, score: 1.35 },
  },
  {
    id: 'frenzy', name: 'RAZERNIJ', icon: '✖', color: '#f97316', boon: true,
    desc: 'Je ultimate laadt dubbel zo snel.',
    mods: { ultCharge: 2 },
  },
  {
    id: 'hunt', name: 'JACHTSEIZOEN', icon: '★', color: '#e879f9',
    desc: 'Veel meer elites. Ze zijn ook veel meer waard.',
    mods: { eliteChance: 2.6, score: 1.2 },
  },
  {
    id: 'calm', name: 'WINDSTILTE', icon: '◌', color: '#5eead4', boon: true,
    desc: 'Vijanden vuren veel trager. Ze bewegen wel sneller.',
    mods: { enemyFireRate: 0.55, enemySpeed: 1.15 },
  },
];

const BY_ID = new Map(ANOMALIES.map((a) => [a.id, a]));
export const getAnomaly = (id) => BY_ID.get(id) ?? null;

/** Every wave that is a multiple of this gets one, boss waves excepted. */
export const ANOMALY_EVERY = 4;

/** The neutral set — what the run uses when nothing is active. */
export function blankMods() {
  return {
    enemySpeed: 1, enemyHp: 1, enemyDmg: 1, enemyBulletSpeed: 1,
    enemyFireRate: 1, eliteChance: 1,
    density: 1, score: 1,
    playerSpeed: 1, fireRate: 1, prismValue: 1, magnet: 1, ultCharge: 1,
    grantHp: 0,
  };
}

/** Fold a list of anomalies into one multiplier bag. */
export function foldMods(list) {
  const out = blankMods();
  for (const a of list) {
    for (const k in a.mods ?? {}) {
      if (k === 'grantHp') out[k] += a.mods[k];
      else out[k] *= a.mods[k];
    }
  }
  return out;
}
