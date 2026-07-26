/**
 * shop.js — store catalogue and the payment abstraction.
 *
 * NOTHING here charges money today. Every SKU routes through `PaymentProvider`,
 * and the only provider wired up is `MockProvider`, which simulates a purchase
 * flow locally and grants the entitlement. Swapping in Stripe / RevenueCat /
 * App Store IAP later means implementing one interface with three methods —
 * the UI, the entitlement store and the grant logic all stay exactly as they are.
 *
 * Monetisation principles baked into this catalogue:
 *  • No SKU sells power that can't also be earned. Money buys *time*.
 *  • Prices shown with real per-unit value so nothing is a hidden markup.
 *  • The battle pass has a free track that is genuinely worth playing.
 *  • No timers you can pay to skip, because that's a tax on impatience, not a
 *    product.
 */

import { save } from '../core/Save.js';
import { grantAll } from '../systems/Economy.js';
import { bus, EV } from '../core/Events.js';

/* ============================================================
   CATALOGUE
   ============================================================ */

/**
 * @typedef {Object} Sku
 * @property {string} id
 * @property {string} name
 * @property {string} [tagline]
 * @property {'currency'|'bundle'|'pass'|'permanent'} kind
 * @property {number} priceCents
 * @property {string} currency  ISO code for display
 * @property {Object} grants    currency bag
 * @property {boolean} [oneTime]
 * @property {number} [bonusPct]
 * @property {string} [badge]
 */

/** @type {Sku[]} */
export const SKUS = [
  {
    id: 'starter_bundle',
    kind: 'bundle',
    name: 'Startpakket',
    tagline: 'Eén keer per account. Beste waarde die er is.',
    priceCents: 299, currency: 'EUR',
    grants: { shards: 300, stardust: 5000, echoes: 60 },
    extra: 'Gegarandeerd 1× Stellar Astra',
    oneTime: true,
    badge: 'BESTE START',
    accent: '#fbbf24',
  },
  {
    id: 'shards_s',
    kind: 'currency',
    name: '80 Nova Shards',
    priceCents: 199, currency: 'EUR',
    grants: { shards: 80 },
    accent: '#ff5cf0',
  },
  {
    id: 'shards_m',
    kind: 'currency',
    name: '420 Nova Shards',
    priceCents: 899, currency: 'EUR',
    grants: { shards: 420 },
    bonusPct: 5,
    accent: '#ff5cf0',
  },
  {
    id: 'shards_l',
    kind: 'currency',
    name: '980 Nova Shards',
    priceCents: 1999, currency: 'EUR',
    grants: { shards: 980 },
    bonusPct: 22,
    badge: 'POPULAIR',
    accent: '#ff5cf0',
  },
  {
    id: 'shards_xl',
    kind: 'currency',
    name: '2.600 Nova Shards',
    priceCents: 4999, currency: 'EUR',
    grants: { shards: 2600 },
    bonusPct: 30,
    accent: '#ff5cf0',
  },
  {
    id: 'dust_pack',
    kind: 'currency',
    name: '12.000 Stardust',
    priceCents: 499, currency: 'EUR',
    grants: { stardust: 12000 },
    accent: '#22d3ee',
  },
  {
    id: 'starpass_season',
    kind: 'pass',
    name: 'Starpass — Seizoen 1',
    tagline: '30 tiers. Gratis track blijft altijd beschikbaar.',
    priceCents: 999, currency: 'EUR',
    grants: { shards: 120, stardust: 4000 },
    extra: 'Ontgrendelt de premium track + exclusieve Vessel-skin',
    badge: 'SEIZOEN',
    accent: '#a855f7',
  },
  {
    id: 'remove_ads',
    kind: 'permanent',
    name: 'Advertentievrij',
    tagline: 'Geen onderbrekingen. Ooit.',
    priceCents: 399, currency: 'EUR',
    grants: { stardust: 1000 },
    extra: '+10% Stardust uit elke run, permanent',
    oneTime: true,
    accent: '#34d399',
  },
];

export const getSku = (id) => SKUS.find((s) => s.id === id) ?? null;

export function priceLabel(sku) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: sku.currency })
    .format(sku.priceCents / 100);
}

/** Shards per euro — shown so the "best value" claim is checkable. */
export function valuePerEuro(sku) {
  const shards = sku.grants.shards ?? 0;
  if (!shards) return null;
  return shards / (sku.priceCents / 100);
}

export const owned = (id) => !!save.profile.entitlements[id];

/* ============================================================
   PAYMENT ABSTRACTION
   ============================================================ */

/**
 * The interface every real provider must satisfy.
 * @abstract
 */
export class PaymentProvider {
  /** @returns {Promise<boolean>} */
  async available() { return false; }
  /**
   * Begin a purchase.
   * @param {Sku} sku
   * @returns {Promise<{ok: boolean, receipt?: object, reason?: string}>}
   */
  async purchase(sku) { throw new Error('not implemented'); }
  /** Re-apply purchases made on another device. */
  async restore() { return { ok: true, ids: [] }; }
}

/**
 * Local stand-in. Simulates latency and a confirmation step, then grants.
 * Everything a real provider would do — except take money.
 */
export class MockProvider extends PaymentProvider {
  async available() { return true; }

  async purchase(sku) {
    bus.emit(EV.TOAST, { text: 'Betaling simuleren…', tone: 'info', ttl: 900 });
    await new Promise((r) => setTimeout(r, 750));
    return {
      ok: true,
      receipt: {
        provider: 'mock',
        sku: sku.id,
        at: Date.now(),
        token: 'mock_' + Math.random().toString(36).slice(2),
      },
    };
  }

  async restore() {
    return { ok: true, ids: Object.keys(save.profile.entitlements) };
  }
}

let provider = new MockProvider();

/** Swap in a real provider at boot when one exists. */
export function setPaymentProvider(p) { provider = p; }
export function getPaymentProvider() { return provider; }

/* ============================================================
   PURCHASE FLOW
   ============================================================ */

/**
 * Buy a SKU. Validates, calls the provider, records the receipt, grants.
 * @returns {Promise<{ok:boolean, reason?:string, grants?:object}>}
 */
export async function buy(skuId) {
  const sku = getSku(skuId);
  if (!sku) return { ok: false, reason: 'unknown_sku' };
  if (sku.oneTime && owned(sku.id)) return { ok: false, reason: 'already_owned' };

  const res = await provider.purchase(sku).catch((e) => ({ ok: false, reason: e.message }));
  if (!res.ok) {
    bus.emit(EV.TOAST, { text: 'Aankoop geannuleerd', tone: 'bad' });
    return { ok: false, reason: res.reason ?? 'cancelled' };
  }

  save.profile.entitlements[sku.id] = {
    at: Date.now(),
    receipt: res.receipt,
    count: (save.profile.entitlements[sku.id]?.count ?? 0) + 1,
  };

  const bag = { ...sku.grants };
  // First-purchase bonus: doubles the currency the first time only.
  const first = !save.profile.flags.firstPurchase;
  if (first && sku.kind === 'currency') {
    for (const k in bag) bag[k] *= 2;
    save.profile.flags.firstPurchase = true;
  }

  grantAll(bag, 'purchase');
  save.touch();

  bus.emit(EV.PURCHASE, { sku, bag, first });
  bus.emit(EV.TOAST, { text: `${sku.name} ontvangen!`, tone: 'gold', ttl: 2400 });
  return { ok: true, grants: bag, firstBonus: first };
}

export async function restorePurchases() {
  const res = await provider.restore();
  if (res.ok && res.ids.length) {
    bus.emit(EV.TOAST, { text: `${res.ids.length} aankopen hersteld`, tone: 'good' });
  } else {
    bus.emit(EV.TOAST, { text: 'Geen aankopen gevonden', tone: 'info' });
  }
  return res;
}

/* ============================================================
   META UPGRADES — bought with Cores, the fully earnable track
   ============================================================ */

export const META_UPGRADES = [
  { id: 'hp',     name: 'Rompversterking', icon: '❤', max: 5, cost: (l) => 8 + l * 12,  desc: (l) => `+${l + 1} start-HP` },
  { id: 'power',  name: 'Kernversterker',  icon: '⚡', max: 10, cost: (l) => 6 + l * 8,  desc: (l) => `+${(l + 1) * 5}% schade` },
  { id: 'rate',   name: 'Koeling',         icon: '⟫', max: 10, cost: (l) => 6 + l * 8,  desc: (l) => `+${(l + 1) * 4}% vuursnelheid` },
  { id: 'magnet', name: 'Trekstraal',      icon: '⊙', max: 6, cost: (l) => 5 + l * 7,   desc: (l) => `+${(l + 1) * 15}% oppakbereik` },
  { id: 'xp',     name: 'Prismalens',      icon: '◈', max: 8, cost: (l) => 7 + l * 9,   desc: (l) => `+${(l + 1) * 6}% Prism-waarde` },
  { id: 'ult',    name: 'Condensator',     icon: '◉', max: 6, cost: (l) => 9 + l * 11,  desc: (l) => `Ultimate laadt ${(l + 1) * 8}% sneller` },
  { id: 'luck',   name: 'Gelukssteen',     icon: '❖', max: 6, cost: (l) => 12 + l * 14, desc: (l) => `+${(l + 1) * 5}% zeldzame kaarten` },
];

export function upgradeLevel(id) { return save.profile.meta.upgrades[id] ?? 0; }

export function buyUpgrade(id) {
  const up = META_UPGRADES.find((u) => u.id === id);
  if (!up) return { ok: false };
  const lvl = upgradeLevel(id);
  if (lvl >= up.max) return { ok: false, reason: 'max' };
  const cost = up.cost(lvl);
  if ((save.profile.currency.cores ?? 0) < cost) return { ok: false, reason: 'cores', need: cost };
  save.profile.currency.cores -= cost;
  save.profile.meta.upgrades[id] = lvl + 1;
  save.touch();
  bus.emit(EV.CURRENCY, { kind: 'cores', amount: -cost, total: save.profile.currency.cores, reason: 'upgrade' });
  return { ok: true, level: lvl + 1 };
}
