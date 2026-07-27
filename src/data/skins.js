/**
 * skins.js — Vessel finishes.
 *
 * Purely cosmetic, on purpose. The Starpass and the achievement list both
 * promise skins, and a reward that changes a number would make the pass a
 * power purchase; a reward that changes how your ship looks in a clip is worth
 * chasing without distorting the game.
 *
 * A skin only supplies a hull palette. The vessel drawer is unchanged, so a
 * skin can never break the silhouette players read the game by.
 */

export const SKINS = [
  {
    id: 'standard',
    name: 'Standaard',
    desc: 'De romp waarmee iedereen begint.',
    hull: ['#e2e8f0', '#94a3b8', '#334155'],
    trim: '#f8fafc',
    unlock: { type: 'default' },
  },
  {
    id: 'ember',
    name: 'Sintel',
    desc: 'Gebrand, gehamerd, nooit vervangen.',
    hull: ['#fed7aa', '#f97316', '#7c2d12'],
    trim: '#ffedd5',
    unlock: { type: 'pass', tier: 10, track: 'free' },
  },
  {
    id: 'prism',
    name: 'Prisma',
    desc: 'Breekt licht dat er nog niet is.',
    hull: ['#f5d0fe', '#c084fc', '#4c1d95'],
    trim: '#fae8ff',
    unlock: { type: 'pass', tier: 20, track: 'premium' },
  },
  {
    id: 'void',
    name: 'Leegte',
    desc: 'Voor wie te diep is geweest om terug te willen.',
    hull: ['#64748b', '#1e293b', '#020617'],
    trim: '#38bdf8',
    unlock: { type: 'achievement', id: 'wave_15' },
  },
  {
    id: 'stellar',
    name: 'Stellair',
    desc: 'Uit het metaal van een ster die het opgaf.',
    hull: ['#fef3c7', '#fbbf24', '#78350f'],
    trim: '#fffbeb',
    unlock: { type: 'achievement', id: 'first_ur' },
  },
];

const BY_ID = new Map(SKINS.map((s) => [s.id, s]));
export const getSkin = (id) => BY_ID.get(id) ?? SKINS[0];
export const DEFAULT_SKIN = 'standard';

/**
 * Human-readable unlock condition, for the picker.
 *
 * A locked skin that only says "Prestatie" is a locked door without a
 * keyhole — the goal exists in the data, so name it. The caller passes the
 * achievement's own line rather than this module importing the achievement
 * list, which keeps the data layer free of a dependency on a system.
 */
export function unlockLabel(skin, goal = '') {
  const u = skin.unlock;
  if (u.type === 'default') return 'Altijd beschikbaar';
  if (u.type === 'pass') return `Starpass tier ${u.tier}${u.track === 'premium' ? ' (premium)' : ''}`;
  if (u.type === 'achievement') return goal ? `Prestatie · ${goal}` : 'Prestatie';
  return '';
}
