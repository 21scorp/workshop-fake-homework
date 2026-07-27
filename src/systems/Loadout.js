/**
 * Loadout.js — one lead Astra plus two supports.
 *
 * The problem this solves: in a collection game where only one unit is
 * equipped, every duplicate and every off-meta pull is dead weight. Two support
 * slots turn the whole roster into something you use, which is the difference
 * between a collection and a drawer.
 *
 * Supports contribute two things:
 *
 *  1. A stat package scaled by rarity and stars. Modest — a support should
 *     never out-contribute the Astra actually flying.
 *  2. Their element trait, at reduced strength. That's the interesting half:
 *     it lets a player build a *combination* (Ember lead + Tide supports for
 *     burn-and-slow) rather than just stacking the highest numbers.
 *
 * A support can't be the lead at the same time, and the same Astra can't fill
 * both support slots.
 */

import { save } from '../core/Save.js';
import { bus, EV } from '../core/Events.js';
import { getAstra } from '../data/astra.js';
import { starPower } from '../data/constants.js';

export const SUPPORT_SLOTS = 2;

/** Normalise the stored loadout: valid, owned, no duplicates, not the lead. */
export function supports() {
  const p = save.profile;
  const out = [];
  const seen = new Set([p.equipped]);
  for (const id of (p.loadout ?? []).slice(0, SUPPORT_SLOTS)) {
    if (!id || seen.has(id) || !p.collection[id]) { out.push(null); continue; }
    seen.add(id);
    out.push(id);
  }
  while (out.length < SUPPORT_SLOTS) out.push(null);
  return out;
}

/**
 * What a single support contributes.
 * Deliberately a formula rather than 21 hand-tuned entries: every future Astra
 * is balanced the moment it exists, and the player can predict the value.
 */
export function supportBonus(astra, stars = 1) {
  if (!astra) return null;
  const tier = astra.rarity + 1;              // 1..5
  const k = starPower(stars);                 // 1.00 .. 2.15
  return {
    damage: 0.025 * tier * k,
    fireRate: 0.018 * tier * k,
    magnet: 0.05 * tier * k,
    ultCharge: 0.03 * tier * k,
    hp: astra.rarity >= 3 ? 1 : 0,
    element: astra.element,
    /** Element traits fire at this probability when a support supplies them. */
    elementPower: 0.28 + astra.rarity * 0.06,
  };
}

/** Everything the run needs, resolved from the current profile. */
export function resolveSupports() {
  const p = save.profile;
  return supports().map((id) => {
    if (!id) return null;
    const astra = getAstra(id);
    if (!astra) return null;
    return {
      id,
      astra,
      stars: p.collection[id]?.stars ?? 1,
      bonus: supportBonus(astra, p.collection[id]?.stars ?? 1),
    };
  }).filter(Boolean);
}

/** Combined multipliers, for the run and for the loadout UI. */
export function totals() {
  const t = { damage: 0, fireRate: 0, magnet: 0, ultCharge: 0, hp: 0, elements: [] };
  for (const s of resolveSupports()) {
    t.damage += s.bonus.damage;
    t.fireRate += s.bonus.fireRate;
    t.magnet += s.bonus.magnet;
    t.ultCharge += s.bonus.ultCharge;
    t.hp += s.bonus.hp;
    t.elements.push({ element: s.bonus.element, power: s.bonus.elementPower });
  }
  return t;
}

/** @returns {{ok: boolean, reason?: string}} */
export function setSupport(slot, id) {
  const p = save.profile;
  if (slot < 0 || slot >= SUPPORT_SLOTS) return { ok: false, reason: 'slot' };
  if (id) {
    if (!p.collection[id]) return { ok: false, reason: 'unowned' };
    if (id === p.equipped) return { ok: false, reason: 'is_lead' };
  }
  p.loadout ??= [];
  // Moving an Astra into a slot it already occupies elsewhere clears the old one.
  const other = p.loadout.findIndex((x, i) => x === id && i !== slot);
  if (id && other >= 0) p.loadout[other] = null;
  p.loadout[slot] = id;
  save.touch();
  bus.emit(EV.ASTRA_EQUIP, { slot, id, support: true });
  return { ok: true };
}

/** Called when the lead changes, so it can't also sit in a support slot. */
export function clearLeadFromSupports() {
  const p = save.profile;
  let changed = false;
  p.loadout = (p.loadout ?? []).map((id) => {
    if (id && id === p.equipped) { changed = true; return null; }
    return id;
  });
  if (changed) save.touch();
}

bus.on(EV.ASTRA_EQUIP, (e) => { if (!e?.support) clearLeadFromSupports(); });
