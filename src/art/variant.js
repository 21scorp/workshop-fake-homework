/**
 * variant.js — one silhouette per character, from a name.
 *
 * Both rosters have the same problem. Twenty-one Astra share eight forms;
 * twelve enemy archetypes share six. Drawing them all with one function per
 * form makes different things look identical, and that costs differently in
 * each case: for Astra it is a gacha with nothing to sell, for enemies it is
 * a player who cannot tell a charger from a drifter until it is on top of
 * them.
 *
 * So a drawer takes a *variant* — a handful of small numbers it maps onto
 * whatever it has to count. The variant is derived from the entity's id, so
 * it belongs to the character rather than to load order, it survives a
 * reordered roster, and a new entry gets a distinct look the moment it is
 * named.
 */

import { TAU } from '../core/Math2.js';

/** FNV-1a. Small, stable, and independent of where the id sits in an array. */
export function hashId(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Eight knobs. `a`/`b`/`c` are small integers; the rest are continuous.
 * `phase` matters more than it looks: without it, two of the same form on
 * screen animate in lockstep and read as one sprite drawn twice.
 */
export function variantFor(id) {
  const h = hashId(id);
  const byte = (shift) => (h >>> shift) & 0xff;
  const span = (shift, lo, hi) => lo + (byte(shift) / 255) * (hi - lo);
  return {
    a: byte(0) % 4,
    b: byte(6) % 3,
    c: byte(12) % 5,
    bulk: span(18, 0.9, 1.12),
    rate: span(24, 0.85, 1.2),
    tilt: span(3, -0.15, 0.15),
    phase: span(9, 0, TAU),
    flip: byte(15) & 1 ? 1 : -1,
  };
}

/** The look a form has with no character attached — used by fallback keys. */
export const NEUTRAL = { a: 1, b: 1, c: 2, bulk: 1, rate: 1, tilt: 0, phase: 0, flip: 1 };

/**
 * A hash alone is not enough.
 *
 * Hashing twenty-one ids onto a handful of small integers collides: the first
 * pass gave two amber Constructs the same face count and two pale Blooms the
 * same petal count, and on a collection card those are one character twice.
 *
 * So the knob driving the *primary* count is handed out by position within the
 * form group instead of by hash. Distinctness becomes a guarantee rather than
 * a probability. Groups are sorted by id, so the order does not move when a
 * roster is reordered — only when a new entry sorts before an existing one,
 * and then only within that one form.
 */
export function spreadWithinForm(index) {
  return {
    c: index % 5,
    a: (index * 3 + 1) % 4,
    bulk: 0.9 + (index % 4) * 0.055,
  };
}

/**
 * Build `id → variant` for a roster, combining the hash with the guaranteed
 * spread. `formOf` says which group an entry belongs to; `art` on the entry
 * overrides any knob by hand.
 */
export function variantsFor(roster, formOf, artOf = (e) => e.art) {
  const groups = new Map();
  for (const e of roster) {
    const f = formOf(e);
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push(e);
  }
  for (const g of groups.values()) g.sort((x, y) => String(x.id).localeCompare(String(y.id)));

  const out = new Map();
  for (const e of roster) {
    const index = groups.get(formOf(e)).indexOf(e);
    out.set(e.id, { ...variantFor(e.id), ...spreadWithinForm(index), ...(artOf(e) ?? {}) });
  }
  return out;
}
