/**
 * starpass.js — the season pass.
 *
 * Thirty tiers, two tracks. The free track is the point: it is generous enough
 * that a player who never spends a cent still has a reason to chase tiers, and
 * the premium track is an upgrade on something already worth doing rather than
 * the only thing worth doing. A pass whose free track is a token gesture just
 * teaches people to ignore the pass.
 *
 * Season XP comes from playing. There is no way to buy tiers — that turns the
 * pass from a reason to play into a reason to pay to *not* play, which is a
 * strange thing to sell.
 */

export const SEASON = {
  id: 's1',
  name: 'Seizoen 1 — Sterrenval',
  /** Season length in days; the UI shows the countdown. */
  days: 42,
  /** Season XP required per tier (flat: a tier should always feel the same). */
  xpPerTier: 900,
  tiers: 30,
};

/** Reward for a tier. `free` is always present; `premium` may be null. */
function tier(n) {
  const big = n % 10 === 0;
  const mid = n % 5 === 0;

  const free = big
    ? { shards: 25 }
    : mid
      ? { stardust: 700, cores: 4 }
      : n % 2
        ? { stardust: 350 }
        : { echoes: 12 };

  const premium = big
    ? { shards: 70, cores: 15 }
    : mid
      ? { shards: 30, echoes: 40 }
      : n % 3 === 0
        ? { stardust: 900 }
        : { shards: 12 };

  return { n, free, premium, big, mid };
}

export const TIERS = Array.from({ length: SEASON.tiers }, (_, i) => tier(i + 1));

/** Headline items shown on the pass card. Cosmetic-only by design. */
export const HIGHLIGHTS = [
  { at: 10, track: 'free', label: 'Vessel-skin: Sintel' },
  { at: 20, track: 'premium', label: 'Vessel-skin: Prisma' },
  { at: 30, track: 'premium', label: 'Titel: Sterrenvaller' },
];

/** How much season XP a finished run is worth. */
export function seasonXpForRun(result) {
  const wave = result.wave ?? 1;
  const kills = result.kills ?? 0;
  const boss = result.bossesKilled ?? 0;
  // Front-loaded like the currency payout: starting runs is the habit we want.
  return Math.round(60 + wave * 26 + Math.min(kills, 250) * 0.9 + boss * 120);
}

export const MAX_XP = SEASON.tiers * SEASON.xpPerTier;
