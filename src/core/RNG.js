/**
 * RNG.js — deterministic, seedable random.
 *
 * Every run in ASTRAFALL is reproducible from a seed string. That is the whole
 * basis of the Daily Seed and "beat my seed" share links: two players who type
 * the same code fight the *exact* same waves, in the same order, with the same
 * drops. No server required.
 *
 * Uses xoshiro128** — fast, tiny, and statistically solid for game use.
 */

/** FNV-1a → 4 × 32-bit state words. Any string becomes a stable seed. */
function seedWords(str) {
  let h1 = 0x9e3779b9, h2 = 0x243f6a88, h3 = 0xb7e15162, h4 = 0xdeadbeef;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x85ebca6b);
    h2 = Math.imul(h2 ^ (c + i), 0xc2b2ae35);
    h3 = Math.imul(h3 ^ (c << 3), 0x27d4eb2f);
    h4 = Math.imul(h4 ^ (c * 31), 0x165667b1);
    h1 = (h1 << 13) | (h1 >>> 19);
    h2 = (h2 << 7) | (h2 >>> 25);
    h3 = (h3 << 17) | (h3 >>> 15);
    h4 = (h4 << 11) | (h4 >>> 21);
  }
  // Avalanche so short seeds ("1", "2") diverge hard.
  const mix = (x) => {
    x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16; return x >>> 0;
  };
  const w = [mix(h1), mix(h2 ^ h1), mix(h3 ^ h2), mix(h4 ^ h3)];
  if ((w[0] | w[1] | w[2] | w[3]) === 0) w[0] = 0x1a2b3c4d; // never all-zero
  return w;
}

export class RNG {
  /** @param {string|number} [seed] */
  constructor(seed = 'astrafall') {
    this.seed = String(seed);
    const w = seedWords(this.seed);
    this.s0 = w[0]; this.s1 = w[1]; this.s2 = w[2]; this.s3 = w[3];
    this.calls = 0;
  }

  /** Raw uint32. */
  next() {
    const r = Math.imul(this.s1 * 5 >>> 0, 7) >>> 0;
    const result = (((r << 7) | (r >>> 25)) >>> 0) * 9 >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0; this.s3 ^= this.s1;
    this.s1 ^= this.s2; this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = ((this.s3 << 11) | (this.s3 >>> 21)) >>> 0;
    this.calls++;
    return result >>> 0;
  }

  /** Float in [0, 1). */
  float() { return this.next() / 4294967296; }

  /** Float in [min, max). */
  range(min, max) { return min + this.float() * (max - min); }

  /** Integer in [min, max] inclusive. */
  int(min, max) { return Math.floor(this.range(min, max + 1)); }

  /** True with probability p. */
  chance(p) { return this.float() < p; }

  /** Random sign, -1 or 1. */
  sign() { return this.float() < 0.5 ? -1 : 1; }

  /** Random element. */
  pick(arr) { return arr[Math.floor(this.float() * arr.length)]; }

  /**
   * Weighted pick. `items` is an array; `weightOf` maps item → number.
   * Returns undefined for an empty list or all-zero weights.
   */
  weighted(items, weightOf = (x) => x.weight ?? 1) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightOf(it));
    if (total <= 0) return undefined;
    let r = this.float() * total;
    for (const it of items) {
      r -= Math.max(0, weightOf(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  /** Fisher–Yates, in place, returns the same array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** N distinct elements (or fewer if the pool is smaller). */
  sample(arr, n) {
    const copy = arr.slice();
    this.shuffle(copy);
    return copy.slice(0, Math.min(n, copy.length));
  }

  /** Point on the unit circle. */
  unitVec() {
    const a = this.float() * Math.PI * 2;
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  /** Approximately-normal value via the sum of 3 uniforms. */
  gauss(mean = 0, sd = 1) {
    const u = (this.float() + this.float() + this.float()) / 3;
    return mean + (u - 0.5) * 3.4641 * sd;
  }

  /** Fork a child stream — lets subsystems draw without desyncing each other. */
  fork(tag = '') {
    return new RNG(`${this.seed}::${tag}::${this.next()}`);
  }

  /** Snapshot / restore for replay scrubbing. */
  save() { return { s0: this.s0, s1: this.s1, s2: this.s2, s3: this.s3, calls: this.calls }; }
  load(st) { this.s0 = st.s0; this.s1 = st.s1; this.s2 = st.s2; this.s3 = st.s3; this.calls = st.calls; }
}

/* ------------------------------------------------------------------
   Human-friendly seed codes.
   6 chars from an unambiguous alphabet (no 0/O, 1/I/L) so people can
   read them off a TikTok video and type them without mistakes.
   ------------------------------------------------------------------ */

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomSeedCode(len = 6) {
  let out = '';
  const buf = new Uint32Array(len);
  (globalThis.crypto ?? { getRandomValues: (b) => b.forEach((_, i) => (b[i] = (Math.random() * 4294967296) >>> 0)) })
    .getRandomValues(buf);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

/** Normalise anything a user typed into a valid seed code. */
export function normalizeSeedCode(input) {
  const up = String(input || '').toUpperCase()
    .replace(/O/g, '0').replace(/0/g, '') // strip ambiguous glyphs entirely
    .replace(/[IL]/g, '1').replace(/1/g, '')
    .replace(/[^2-9A-Z]/g, '');
  return up.slice(0, 8) || randomSeedCode();
}

/** The seed everyone in the world shares today (UTC day bucket). */
export function dailySeedCode(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const rng = new RNG(`ASTRAFALL-DAILY-${y}${m}${d}`);
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[rng.int(0, CODE_ALPHABET.length - 1)];
  return out;
}

/** Shared global stream for cosmetic, non-deterministic sparkle. */
export const cosmeticRNG = new RNG(`cosmetic-${Math.floor(Math.random() * 1e9)}`);
