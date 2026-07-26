/**
 * Math2.js — the small maths every entity needs.
 * Kept allocation-free where it matters (hot loop runs at 60fps with 400+ entities).
 */

export const TAU = Math.PI * 2;
export const PI = Math.PI;
export const HALF_PI = Math.PI / 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a1, b1, a2, b2) => lerp(a2, b2, clamp01(invLerp(a1, b1, v)));
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** Frame-rate independent exponential smoothing. `speed` ≈ 1/e-folds per second. */
export const damp = (a, b, speed, dt) => lerp(a, b, 1 - Math.exp(-speed * dt));

/** Move `a` toward `b` by at most `maxDelta`. */
export function approach(a, b, maxDelta) {
  const d = b - a;
  if (Math.abs(d) <= maxDelta) return b;
  return a + sign(d) * maxDelta;
}

export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

/** Shortest signed difference between two angles, in (-π, π]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > PI) d -= TAU;
  if (d < -PI) d += TAU;
  return d;
}
export const lerpAngle = (a, b, t) => a + angleDelta(a, b) * t;

/** Circle-vs-circle. */
export const circleHit = (ax, ay, ar, bx, by, br) => dist2(ax, ay, bx, by) <= (ar + br) * (ar + br);

/** Point in axis-aligned rect. */
export const pointInRect = (px, py, x, y, w, h) => px >= x && px <= x + w && py >= y && py <= y + h;

/** Segment vs circle — used for fast bullets so they can't tunnel. */
export function segmentCircleHit(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return dist2(x1, y1, cx, cy) <= r * r;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
  t = clamp01(t);
  const px = x1 + dx * t, py = y1 + dy * t;
  return dist2(px, py, cx, cy) <= r * r;
}

/* ------------------------------------------------------------------
   Easing — the vocabulary of the whole game's feel.
   ------------------------------------------------------------------ */

export const Ease = {
  linear: (t) => t,

  inQuad:    (t) => t * t,
  outQuad:   (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

  inCubic:    (t) => t * t * t,
  outCubic:   (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),

  inQuart:  (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),

  outQuint: (t) => 1 - Math.pow(1 - t, 5),

  inExpo:  (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 :
    t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,

  outCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  inCirc:  (t) => 1 - Math.sqrt(1 - t * t),

  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack:  (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outBackHard: (t) => Ease.outBack(t, 2.9),

  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c = TAU / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
  },
  outElasticSoft: (t) => {
    if (t === 0 || t === 1) return t;
    const c = TAU / 4.5;
    return Math.pow(2, -8 * t) * Math.sin((t * 8 - 0.75) * c) + 1;
  },

  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },

  /** 0 → 1 → 0. For flashes and pops. */
  pulse: (t) => Math.sin(clamp01(t) * PI),
  /** Sharp attack, slow release. Impact curve. */
  impact: (t) => (t <= 0 ? 0 : Math.pow(1 - t, 2.2) * Math.sin(t * 22) * (1 - t) + (1 - Math.pow(1 - t, 3))),
};

/* ------------------------------------------------------------------
   Formatting — numbers are UI, and UI is the product.
   ------------------------------------------------------------------ */

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac'];

/** 15230 → "15.2K". Keeps HUD width stable. */
export function abbrev(n, decimals = 1) {
  n = Number(n) || 0;
  const neg = n < 0; n = Math.abs(n);
  if (n < 1000) return (neg ? '-' : '') + Math.floor(n).toString();
  let tier = Math.floor(Math.log10(n) / 3);
  tier = clamp(tier, 0, SUFFIX.length - 1);
  const scaled = n / Math.pow(1000, tier);
  const s = scaled < 10 ? scaled.toFixed(decimals) : scaled.toFixed(0);
  return (neg ? '-' : '') + s.replace(/\.0$/, '') + SUFFIX[tier];
}

/** 1234567 → "1.234.567" (nl grouping). */
export function grouped(n) {
  return Math.floor(Number(n) || 0).toLocaleString('nl-NL');
}

/** Seconds → "1:04.2" */
export function timeStr(seconds, showTenths = true) {
  seconds = Math.max(0, seconds || 0);
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const ss = showTenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
  return `${m}:${ss}`;
}

/** ms → "2u 14m" for countdowns. */
export function durationStr(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}u ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export const pct = (v, decimals = 1) => `${(v * 100).toFixed(decimals).replace(/\.0$/, '')}%`;
