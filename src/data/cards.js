/**
 * cards.js — the level-up upgrade cards.
 *
 * This is the decision that makes a run *yours*. Design constraints:
 *
 *  • Every card must be describable in one line and understandable at a glance
 *    while a boss is on screen. No conditional walls of text.
 *  • Common cards are boring on purpose — they are the baseline the exotic
 *    cards get compared against.
 *  • Exotic cards should change *how you play*, not just the numbers.
 *  • A few cards are gated behind having stacks of another card. That is what
 *    turns "pick the best" into "commit to a build".
 *
 * `apply(mods, stacks)` mutates the run's modifier bag. The run engine reads
 * that bag every frame — cards never touch entities directly.
 */

import { RARITY } from './constants.js';

/** @typedef {Object} Card */

export const CARDS = [

  /* ================= COMMON: the numbers ================= */
  {
    id: 'power', name: 'Overladen', icon: '⚡', rarity: RARITY.C, max: 8,
    tag: 'Aanval', color: '#f43f5e',
    desc: (s) => `+${18}% schade`,
    apply: (m) => { m.damageMul += 0.18; },
  },
  {
    id: 'rate', name: 'Snelvuur', icon: '⟫', rarity: RARITY.C, max: 8,
    tag: 'Aanval', color: '#fb923c',
    desc: () => '+15% vuursnelheid',
    apply: (m) => { m.fireRateMul += 0.15; },
  },
  {
    id: 'hp', name: 'Bepantsering', icon: '❤', rarity: RARITY.C, max: 5,
    tag: 'Verdediging', color: '#34d399',
    desc: () => '+1 max HP en heel 1',
    apply: (m) => { m.maxHp += 1; m.healNow += 1; },
  },
  {
    id: 'speed', name: 'Stuwing', icon: '➤', rarity: RARITY.C, max: 6,
    tag: 'Beweging', color: '#5eead4',
    desc: () => '+12% bewegingssnelheid',
    apply: (m) => { m.moveMul += 0.12; },
  },
  {
    id: 'magnet', name: 'Magnetisme', icon: '⊙', rarity: RARITY.C, max: 5,
    tag: 'Nut', color: '#a855f7',
    desc: () => '+45% oppakbereik',
    apply: (m) => { m.magnetMul += 0.45; },
  },
  {
    id: 'xp', name: 'Resonantie', icon: '◈', rarity: RARITY.C, max: 5,
    tag: 'Nut', color: '#22d3ee',
    desc: () => '+22% Prism-waarde',
    apply: (m) => { m.xpMul += 0.22; },
  },

  /* ================= RARE: shape the weapon ================= */
  {
    id: 'multishot', name: 'Splitsing', icon: '⋔', rarity: RARITY.R, max: 4,
    tag: 'Aanval', color: '#f472b6',
    desc: () => '+1 projectiel, −8% schade per stuk',
    apply: (m) => { m.projectiles += 1; m.damageMul -= 0.08; },
  },
  {
    id: 'pierce', name: 'Doorboring', icon: '⌁', rarity: RARITY.R, max: 4,
    tag: 'Aanval', color: '#38bdf8',
    desc: () => 'Kogels gaan door +1 vijand',
    apply: (m) => { m.pierce += 1; },
  },
  {
    id: 'crit', name: 'Zwakke Plek', icon: '✧', rarity: RARITY.R, max: 6,
    tag: 'Aanval', color: '#fbbf24',
    desc: () => '+9% kritieke kans',
    apply: (m) => { m.crit += 0.09; },
  },
  {
    id: 'critdmg', name: 'Genadeslag', icon: '✖', rarity: RARITY.R, max: 5,
    tag: 'Aanval', color: '#fb7185',
    desc: () => '+45% kritieke schade',
    apply: (m) => { m.critDmg += 0.45; },
  },
  {
    id: 'bulletsize', name: 'Zwaargewicht', icon: '●', rarity: RARITY.R, max: 4,
    tag: 'Aanval', color: '#fdba74',
    desc: () => '+30% kogelgrootte, +8% schade',
    apply: (m) => { m.bulletSize += 0.3; m.damageMul += 0.08; },
  },
  {
    id: 'bulletspeed', name: 'Versnelling', icon: '⇈', rarity: RARITY.R, max: 4,
    tag: 'Aanval', color: '#67e8f9',
    desc: () => '+25% kogelsnelheid en bereik',
    apply: (m) => { m.bulletSpeedMul += 0.25; },
  },
  {
    id: 'iframes', name: 'Faseverschuiving', icon: '◇', rarity: RARITY.R, max: 3,
    tag: 'Verdediging', color: '#c084fc',
    desc: () => '+40% onkwetsbaarheid na een klap',
    apply: (m) => { m.iframeMul += 0.4; },
  },
  {
    id: 'ultcharge', name: 'Geleider', icon: '◉', rarity: RARITY.R, max: 4,
    tag: 'Nut', color: '#fde047',
    desc: () => 'Ultimate laadt 25% sneller',
    apply: (m) => { m.ultChargeMul += 0.25; },
  },
  {
    id: 'luck', name: 'Fortuin', icon: '❖', rarity: RARITY.R, max: 4,
    tag: 'Nut', color: '#a3e635',
    desc: () => '+18% kans op zeldzame kaarten en drops',
    apply: (m) => { m.luck += 0.18; },
  },

  {
    id: 'scavenge', name: 'Aaseter', icon: '◇', rarity: RARITY.R, max: 3,
    tag: 'Nut', color: '#a3e635',
    desc: () => 'Prisms leven 60% langer en vliegen sneller',
    apply: (m) => { m.pickupLife += 0.6; m.magnetMul += 0.15; },
  },
  {
    id: 'gambler', name: 'Gokker', icon: '⚄', rarity: RARITY.R, max: 3,
    tag: 'Aanval', color: '#f0abfc',
    desc: () => '+30% schade, maar 15% van je schoten mist',
    apply: (m) => { m.damageMul += 0.3; m.misfire += 0.15; },
  },

  /* ================= SUPERIOR: change how you play ================= */
  {
    id: 'orbitals', name: 'Wachters', icon: '◍', rarity: RARITY.SR, max: 4,
    tag: 'Exotisch', color: '#22d3ee',
    desc: (s) => `+1 orbitaal (${s} → ${s + 1}) die vijanden raakt`,
    apply: (m) => { m.orbitals += 1; },
  },
  {
    id: 'explode', name: 'Kettingreactie', icon: '✺', rarity: RARITY.SR, max: 3,
    tag: 'Exotisch', color: '#fb923c',
    desc: () => 'Vijanden exploderen bij hun dood',
    apply: (m) => { m.explodeOnKill += 1; },
  },
  {
    id: 'chain', name: 'Boogstroom', icon: '⚡', rarity: RARITY.SR, max: 3,
    tag: 'Exotisch', color: '#fde047',
    desc: () => 'Treffers ketsen naar +1 vijand',
    apply: (m) => { m.chains += 1; },
  },
  {
    id: 'homing', name: 'Zoeker', icon: '➹', rarity: RARITY.SR, max: 2,
    tag: 'Exotisch', color: '#f0abfc',
    desc: () => 'Kogels sturen naar vijanden',
    apply: (m) => { m.homing += 1.8; },
  },
  {
    id: 'thorns', name: 'Doornen', icon: '✵', rarity: RARITY.SR, max: 3,
    tag: 'Verdediging', color: '#f43f5e',
    desc: () => 'Vijanden die je raken nemen zware schade',
    apply: (m) => { m.thorns += 40; },
  },
  {
    id: 'shieldgen', name: 'Schildgenerator', icon: '⬡', rarity: RARITY.SR, max: 3,
    tag: 'Verdediging', color: '#67e8f9',
    desc: () => 'Elke 14s een schild dat 1 klap opvangt',
    apply: (m) => { m.shieldRegen += 1; },
  },
  {
    id: 'freeze', name: 'Nulpunt', icon: '❄', rarity: RARITY.SR, max: 3,
    tag: 'Exotisch', color: '#a5f3fc',
    desc: () => 'Aura die vijanden om je heen vertraagt',
    apply: (m) => { m.freezeAura += 1; },
  },
  {
    id: 'vampiric', name: 'Levensdorst', icon: '❥', rarity: RARITY.SR, max: 2,
    tag: 'Verdediging', color: '#e11d48',
    desc: () => 'Elke 40 kills herstelt 1 HP',
    apply: (m) => { m.lifesteal += 1; },
  },
  {
    id: 'ricochet', name: 'Kaatsing', icon: '⤺', rarity: RARITY.SR, max: 2,
    tag: 'Exotisch', color: '#5eead4',
    desc: () => 'Kogels stuiteren van de randen',
    apply: (m) => { m.bounce += 2; },
  },

  {
    id: 'siphon', name: 'Sifon', icon: '◍', rarity: RARITY.SR, max: 2,
    tag: 'Exotisch', color: '#22d3ee',
    desc: () => 'Prisms geven ook Ultimate-lading',
    apply: (m) => { m.prismUlt += 1; },
  },
  {
    id: 'overheat', name: 'Oververhitting', icon: '≡', rarity: RARITY.SR, max: 2,
    tag: 'Aanval', color: '#fb923c',
    desc: () => 'Hoe langer je vuurt zonder te bewegen, hoe harder je slaat',
    apply: (m) => { m.overheat += 1; },
  },

  /* ================= STELLAR: build-defining ================= */
  {
    id: 'overdrive', name: 'OVERDRIVE', icon: '⟁', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#fbbf24',
    desc: () => '+60% vuursnelheid, maar −1 max HP',
    apply: (m) => { m.fireRateMul += 0.6; m.maxHp = Math.max(1, m.maxHp - 1); },
    requires: (st) => (st.rate ?? 0) >= 2,
  },
  {
    id: 'glasscannon', name: 'GLASKANON', icon: '◈', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#f43f5e',
    desc: () => 'Dubbele schade. Je HP wordt 1.',
    apply: (m) => { m.damageMul *= 2; m.maxHp = 1; m.forceHp = 1; },
  },
  {
    id: 'timedilation', name: 'TIJDREK', icon: '◐', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#c084fc',
    desc: () => 'Alles behalve jij beweegt 20% trager',
    apply: (m) => { m.enemyTimeScale *= 0.8; },
  },
  {
    id: 'swarmlord', name: 'ZWERMHEER', icon: '❊', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#22d3ee',
    desc: () => '+3 projectielen, −30% schade per stuk',
    apply: (m) => { m.projectiles += 3; m.damageMul -= 0.3; },
    requires: (st) => (st.multishot ?? 0) >= 2,
  },
  {
    id: 'blackhole', name: 'SINGULARITEIT', icon: '⬤', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#a855f7',
    desc: () => 'Elke 8s verschijnt een zwart gat dat alles verzwelgt',
    apply: (m) => { m.blackhole += 1; },
  },
  {
    id: 'phoenix', name: 'FEniks', icon: '✷', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#fb923c',
    desc: () => 'Eén keer per run: herrijs met 3 HP',
    apply: (m) => { m.revives += 1; },
  },
  {
    id: 'echoshot', name: 'ECHO', icon: '⟳', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#f0abfc',
    desc: () => 'Elk schot wordt 0.2s later herhaald',
    apply: (m) => { m.echo += 1; },
  },
  {
    id: 'juggernaut', name: 'STORMRAM', icon: '⬢', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#34d399',
    desc: () => '+3 max HP, maar je vuurt 25% trager',
    apply: (m) => { m.maxHp += 3; m.healNow += 3; m.fireRateMul -= 0.25; },
    requires: (st) => (st.hp ?? 0) >= 2,
  },
  {
    id: 'nova_core', name: 'NOVAKERN', icon: '✺', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#fbbf24',
    desc: () => 'Elke level-up ontketent een schermvullende schokgolf',
    apply: (m) => { m.levelNova += 1; },
    requires: (st) => (st.xp ?? 0) >= 1,
  },

  /* ================= nieuwe richtingen ================= */
  {
    id: 'longshot', name: 'Langebaan', icon: '⇢', rarity: RARITY.C, max: 4,
    tag: 'Aanval', color: '#67e8f9',
    desc: () => '+40% kogellevensduur',
    apply: (m) => { m.bulletLife += 0.4; },
  },
  {
    id: 'prismlens', name: 'Prismalens', icon: '◈', rarity: RARITY.R, max: 4,
    tag: 'Nut', color: '#22d3ee',
    desc: () => '+30% Prism-waarde',
    apply: (m) => { m.prismValue += 0.3; },
  },
  {
    id: 'retaliate', name: 'Weerslag', icon: '✺', rarity: RARITY.R, max: 3,
    tag: 'Verdediging', color: '#fb923c',
    desc: () => 'Een treffer op jou zet een schokgolf om je heen',
    apply: (m) => { m.retaliate += 1; },
  },
  {
    id: 'crescendo', name: 'Crescendo', icon: '↗', rarity: RARITY.SR, max: 3,
    tag: 'Aanval', color: '#a78bfa',
    desc: (s) => `+${5 * s}% schade per seconde ongeschonden, tot +${30 * s}%`,
    apply: (m) => { m.crescendo += 1; },
  },
  {
    id: 'overwhelm', name: 'Overmacht', icon: '❋', rarity: RARITY.SR, max: 2,
    tag: 'Aanval', color: '#f43f5e',
    desc: (s) => `+${3 * s}% schade per vijand in beeld, tot +${36 * s}%`,
    apply: (m) => { m.overwhelm += 1; },
  },
  {
    id: 'ultrefund', name: 'TERUGSLAG', icon: '⟲', rarity: RARITY.SSR, max: 1,
    tag: 'Legendarisch', color: '#fbbf24',
    desc: () => 'Je ultimate geeft 35% van zijn lading terug',
    requires: (st) => (st.ultcharge ?? 0) >= 1,
    apply: (m) => { m.ultRefund += 0.35; },
  },
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
export const getCard = (id) => BY_ID.get(id);

/** Rarity weights for the level-up draw, before luck is applied. */
export const CARD_WEIGHTS = [58, 30, 10.5, 1.5, 0];

/** A fresh, zeroed modifier bag. Every field the run engine reads. */
export function blankMods() {
  return {
    damageMul: 1,
    fireRateMul: 1,
    moveMul: 1,
    magnetMul: 1,
    xpMul: 1,
    bulletSpeedMul: 1,
    bulletSize: 1,
    projectiles: 0,
    pierce: 0,
    crit: 0,
    critDmg: 0,
    maxHp: 0,
    healNow: 0,
    forceHp: 0,
    iframeMul: 1,
    ultChargeMul: 1,
    luck: 0,
    orbitals: 0,
    explodeOnKill: 0,
    chains: 0,
    homing: 0,
    thorns: 0,
    shieldRegen: 0,
    freezeAura: 0,
    lifesteal: 0,
    bounce: 0,
    enemyTimeScale: 1,
    blackhole: 0,
    revives: 0,
    echo: 0,
    prismUlt: 0,
    overheat: 0,
    pickupLife: 0,
    misfire: 0,
    levelNova: 0,
    bulletLife: 1,
    crescendo: 0,
    retaliate: 0,
    prismValue: 1,
    overwhelm: 0,
    ultRefund: 0,
  };
}
