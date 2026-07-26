/**
 * shapes.js — shared drawing primitives for the procedural sprite layer.
 *
 * The goal is that a vector "sprite" reads as *rendered art*, not as clip-art.
 * Four techniques do almost all of that work:
 *
 *   1. a radial gradient body lit from the upper-left
 *   2. a bright rim stroke on the lit edge only
 *   3. an additive outer halo (bloom)
 *   4. an inner core that pulses out of phase with the body
 *
 * Every helper draws in local space with the origin at the sprite's anchor,
 * so a drawer can compose them without bookkeeping.
 */

import { TAU } from '../core/Math2.js';
import { hexA, mixHex } from '../core/Renderer.js';

/* ------------------------------------------------------------------
   Gradient cache.

   `createRadialGradient` is not cheap, and the naive version of these
   helpers built two of them per entity per frame — with 40 enemies and
   200 bullets on screen that's ~500 allocations every 16ms, which was
   measurably the single largest cost in the frame.

   Gradients are bound to the context that created them, so the cache is
   keyed by context first (WeakMap, so offscreen sprite canvases don't
   leak) and then by colour. Everything is built at a fixed reference
   radius and scaled at draw time.
   ------------------------------------------------------------------ */

const REF = 64;
const _haloCache = new WeakMap();
const _orbCache = new WeakMap();

function cached(store, ctx, key, build) {
  let m = store.get(ctx);
  if (!m) store.set(ctx, (m = new Map()));
  let g = m.get(key);
  if (!g) {
    g = build();
    // Bound the cache: entity tints are a small fixed set, but run-time
    // colour mixing could otherwise grow this without limit.
    if (m.size > 96) m.clear();
    m.set(key, g);
  }
  return g;
}

/** Additive halo. Call before the body so the body reads as solid. */
export function halo(ctx, r, color, alpha = 0.55) {
  if (r <= 0 || alpha <= 0.004) return;
  const g = cached(_haloCache, ctx, color, () => {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, REF);
    grad.addColorStop(0, hexA(color, 1));
    grad.addColorStop(0.35, hexA(color, 0.5));
    grad.addColorStop(1, hexA(color, 0));
    return grad;
  });
  const prev = ctx.globalCompositeOperation;
  const k = r / REF;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.scale(k, k);
  ctx.fillStyle = g;
  ctx.fillRect(-REF, -REF, REF * 2, REF * 2);
  ctx.restore();
  ctx.globalCompositeOperation = prev;
}

/** Lit sphere: body gradient + rim + specular dot. */
export function orb(ctx, r, color, { rim = true, spec = true, dark = '#050814' } = {}) {
  const g = cached(_orbCache, ctx, color + dark, () => {
    const grad = ctx.createRadialGradient(-REF * 0.34, -REF * 0.4, REF * 0.08, 0, 0, REF);
    grad.addColorStop(0, mixHex(color, '#ffffff', 0.65));
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, mixHex(color, dark, 0.72));
    return grad;
  });
  const k = r / REF;
  ctx.save();
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.arc(0, 0, REF, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  if (rim) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.97, Math.PI * 0.65, Math.PI * 1.85);
    ctx.strokeStyle = hexA(mixHex(color, '#ffffff', 0.8), 0.85);
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  if (spec) {
    ctx.beginPath();
    ctx.ellipse(-r * 0.33, -r * 0.42, r * 0.22, r * 0.15, -0.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fill();
  }
}

/** Faceted crystal — n-sided, with alternating light/dark facets. */
export function crystal(ctx, r, sides, color, rot = 0, sharpness = 0.62) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * sharpness : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  // Facets: triangles from centre to each edge, shaded by their normal.
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const light = 0.5 - (mx * 0.7 + my * 0.9) / (r * 2.2);  // upper-left key light
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.closePath();
    ctx.fillStyle = light > 0.5
      ? mixHex(color, '#ffffff', (light - 0.5) * 1.3)
      : mixHex(color, '#0a0f24', (0.5 - light) * 1.5);
    ctx.fill();
  }
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.strokeStyle = hexA(mixHex(color, '#ffffff', 0.7), 0.7);
  ctx.lineWidth = Math.max(0.8, r * 0.055);
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Teardrop / flame silhouette pointing up. */
export function flame(ctx, w, h, color, wobble = 0) {
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.bezierCurveTo(w * (0.62 + wobble * 0.1), -h * 0.42, w, h * 0.12, 0, h);
  ctx.bezierCurveTo(-w, h * 0.12, -w * (0.62 - wobble * 0.1), -h * 0.42, 0, -h);
  const g = ctx.createLinearGradient(0, -h, 0, h);
  g.addColorStop(0, mixHex(color, '#ffffff', 0.75));
  g.addColorStop(0.45, color);
  g.addColorStop(1, mixHex(color, '#160a2e', 0.6));
  ctx.fillStyle = g;
  ctx.fill();
}

/** Rotating orbital ring, drawn as a squashed ellipse with a gap. */
export function ring(ctx, rx, ry, color, rot = 0, width = 2, gap = 0.7) {
  ctx.save();
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, gap * 0.5, TAU - gap * 0.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/** Small orbiting satellites. */
export function satellites(ctx, r, n, color, phase, size = 3) {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.4;
    const depth = (Math.sin(a) + 1) / 2;    // behind → in front
    ctx.beginPath();
    ctx.arc(x, y, size * (0.6 + depth * 0.6), 0, TAU);
    ctx.fillStyle = hexA(color, 0.35 + depth * 0.65);
    ctx.fill();
  }
}

/** Segmented tail that trails behind an implied direction. */
export function tail(ctx, len, segs, color, wave, thick = 6) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const x = Math.sin(wave + t * 3.2) * len * 0.24 * t;
    const y = len * t;
    ctx.lineTo(x, y);
  }
  const g = ctx.createLinearGradient(0, 0, 0, len);
  g.addColorStop(0, hexA(color, 0.9));
  g.addColorStop(1, hexA(color, 0));
  ctx.strokeStyle = g;
  ctx.lineWidth = thick;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Armour plate arc — used on tanky enemies to read as "shielded". */
export function plate(ctx, r, from, to, color, thickness) {
  ctx.beginPath();
  ctx.arc(0, 0, r, from, to);
  ctx.arc(0, 0, r - thickness, to, from, true);
  ctx.closePath();
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, mixHex(color, '#ffffff', 0.4));
  g.addColorStop(1, mixHex(color, '#0a0f24', 0.45));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = hexA('#ffffff', 0.25);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Menacing eye. One shape, enormous amount of character. */
export function eye(ctx, r, color, look = 0, angry = 0) {
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * (1 - angry * 0.35), 0, 0, TAU);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(Math.cos(look) * r * 0.28, Math.sin(look) * r * 0.2, r * 0.46, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(Math.cos(look) * r * 0.28, Math.sin(look) * r * 0.2, r * 0.2, 0, TAU);
  ctx.fillStyle = '#05060f';
  ctx.fill();
  if (angry > 0) {
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, -r * 0.75);
    ctx.lineTo(r * 1.05, -r * 0.2);
    ctx.lineTo(r * 1.05, -r * 0.85);
    ctx.closePath();
    ctx.fillStyle = '#05060f';
    ctx.globalAlpha *= angry;
    ctx.fill();
    ctx.globalAlpha /= angry;
  }
}

/** Contact shadow — the cheapest way to stop things floating. */
export function groundShadow(ctx, r, y, alpha = 0.35) {
  ctx.beginPath();
  ctx.ellipse(0, y, r, r * 0.28, 0, 0, TAU);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fill();
}

/** White hit-flash overlay for the whole local shape. */
export function flashOverlay(ctx, r, amount) {
  if (amount <= 0.01) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= amount;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.globalAlpha /= amount;
  ctx.globalCompositeOperation = prev;
}

/** Chevron / arrow used for directional enemies. */
export function chevron(ctx, w, h, color, thickness = 0.3) {
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.lineTo(w * thickness, -h / 2);
  ctx.lineTo(0, h / 2 - h * thickness * 1.2);
  ctx.lineTo(-w * thickness, -h / 2);
  ctx.lineTo(-w / 2, -h / 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, mixHex(color, '#ffffff', 0.5));
  g.addColorStop(1, mixHex(color, '#0a0f24', 0.4));
  ctx.fillStyle = g;
  ctx.fill();
}
