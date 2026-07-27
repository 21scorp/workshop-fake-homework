/**
 * Rank.js — a letter for the run.
 *
 * A score is a number you have to compare to something. A rank is a verdict
 * you can say out loud, and that is what travels: "I got S" is a caption,
 * "984.210" is a screenshot. It also gives every run a target that is closer
 * than the next personal best — the D player is chasing C, not the leaderboard.
 *
 * Ranks are derived from the score alone, on purpose. Score already folds in
 * wave depth, combo and kills; adding those again would double-count them and
 * make the letter impossible to reason about while you are playing.
 *
 * The thresholds come from measured runs rather than taste: a bot playing
 * competently for 150 seconds lands around 230.000 (B), and a strong run with
 * an invested profile reaches wave 17 for roughly 980.000 (S). D and C are set
 * so that a first run ends on C, not on the bottom rung — the first verdict a
 * new player sees should not be an insult.
 */

export const RANKS = [
  { key: 'D',  at: 0,       color: '#94a3b8', label: 'Gevallen' },
  { key: 'C',  at: 20000,   color: '#67e8f9', label: 'Standgehouden' },
  { key: 'B',  at: 90000,   color: '#a78bfa', label: 'Sterk' },
  { key: 'A',  at: 240000,  color: '#fbbf24', label: 'Uitzonderlijk' },
  { key: 'S',  at: 550000,  color: '#fb7185', label: 'Meesterlijk' },
  { key: 'S+', at: 1100000, color: '#ff5cf0', label: 'Legendarisch' },
];

/**
 * @param {number} score
 * @returns {{key:string,color:string,label:string,next:object|null,toNext:number,pct:number}}
 */
export function rankFor(score = 0) {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (score >= RANKS[k].at) i = k;
  const cur = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  const span = next ? next.at - cur.at : 1;
  return {
    ...cur,
    next,
    toNext: next ? Math.max(0, next.at - score) : 0,
    pct: next ? Math.min(1, (score - cur.at) / span) : 1,
  };
}

/** True when this run is the best the profile has ever recorded. */
export function isPersonalBest(score, bestBefore) {
  return score > 0 && score >= bestBefore;
}
