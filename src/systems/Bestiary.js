/**
 * Bestiary.js — what the player has met, and what it meant.
 *
 * Twelve archetypes now carry role marks that promise a behaviour: a barrel
 * means it shoots, a lance means it will dash, a seam means killing it makes
 * more. Marks only work if the player learns the language, and nothing in a
 * 90-second run stops to teach it. This is where that gets taught — after the
 * fact, on a screen with no clock running.
 *
 * Entries are discovery-gated on purpose. An enemy you have never met is a
 * silhouette and a question mark, so the list keeps paying out as the waves
 * go deeper, and the first Reaper is an event rather than a row you already
 * read weeks ago.
 */

import { save } from '../core/Save.js';
import { ENEMY_LIST, BOSSES, ELITE_MODS } from '../data/enemies.js';
import { marksFor } from '../art/entities.js';

/** What each mark promises. The legend at the top of the screen. */
export const MARK_INFO = {
  barrel: { name: 'Loop', desc: 'Schiet op je. De loop wijst waar hij mikt en licht op tijdens het laden.' },
  lance:  { name: 'Lans', desc: 'Stopt, laadt, en stormt dan in een rechte lijn. De lans schuift uit tijdens de aanloop.' },
  seam:   { name: 'Naad', desc: 'Breekt open als hij sterft. Er komt meer uit dan erin zat.' },
  fins:   { name: 'Vinnen', desc: 'Cirkelt om het veld in plaats van op je af te komen.' },
};

const entryOf = (id) => save.profile.bestiary?.[id] ?? null;

/** One row: the definition plus whatever the player knows about it. */
function row(def, { boss = false } = {}) {
  const id = boss ? `boss/${def.id}` : def.id;
  const seen = entryOf(id);
  return {
    id,
    def,
    boss,
    known: !!seen,
    seen: seen?.seen ?? 0,
    kills: seen?.kills ?? 0,
    marks: boss ? [] : marksFor(def),
  };
}

/** Every archetype, in the order they start appearing. */
export function enemyRows() {
  return ENEMY_LIST
    .slice()
    .sort((a, b) => (a.minWave ?? 1) - (b.minWave ?? 1) || a.name.localeCompare(b.name))
    .map((d) => row(d));
}

export function bossRows() {
  return BOSSES.map((b) => row(b, { boss: true }));
}

/** Elites are a modifier on any enemy, so they are listed but never gated. */
export function eliteRows() {
  return Object.entries(ELITE_MODS).map(([key, mod]) => ({ id: key, ...mod }));
}

export function bestiaryProgress() {
  const rows = [...enemyRows(), ...bossRows()];
  return { have: rows.filter((r) => r.known).length, total: rows.length };
}

/** Total kills across every type the player has met. */
export function totalRecorded() {
  const b = save.profile.bestiary ?? {};
  let kills = 0;
  for (const id in b) kills += b[id].kills ?? 0;
  return kills;
}
