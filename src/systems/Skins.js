/**
 * Skins.js — which Vessel finishes a player has, and which one is on.
 *
 * Unlocks are derived, never stored. A skin is available if its condition is
 * currently true — so importing a save, buying the pass late, or unlocking an
 * achievement all take effect immediately with no reconciliation step and no
 * way for the stored list to disagree with reality.
 */

import { save } from '../core/Save.js';
import { bus, EV } from '../core/Events.js';
import { SKINS, getSkin, DEFAULT_SKIN } from '../data/skins.js';
import { progress as passProgress, hasPremium } from './Starpass.js';

export function isUnlocked(skin) {
  const u = skin.unlock;
  if (u.type === 'default') return true;
  if (u.type === 'achievement') return !!save.profile.achievements?.[u.id];
  if (u.type === 'pass') {
    const pr = passProgress();
    if (pr.tier < u.tier) return false;
    return u.track !== 'premium' || hasPremium();
  }
  return false;
}

export function unlockedSkins() {
  return SKINS.filter(isUnlocked);
}

export function currentSkinId() {
  const id = save.profile.skin ?? DEFAULT_SKIN;
  const skin = getSkin(id);
  // A skin can become unavailable (season rollover, wiped achievement) —
  // fall back rather than render something the player no longer owns.
  return isUnlocked(skin) ? skin.id : DEFAULT_SKIN;
}

export const currentSkin = () => getSkin(currentSkinId());

export function setSkin(id) {
  const skin = getSkin(id);
  if (!isUnlocked(skin)) return { ok: false, reason: 'locked' };
  save.profile.skin = skin.id;
  save.touch();
  bus.emit(EV.TOAST, { text: `Romp: ${skin.name}`, tone: 'good' });
  return { ok: true };
}

/** Count for the UI badge. */
export function skinSummary() {
  const have = unlockedSkins().length;
  return { have, total: SKINS.length };
}
