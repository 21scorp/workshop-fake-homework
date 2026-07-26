/**
 * astra.js — procedural art for the collectible Astra.
 *
 * Seven silhouettes, each instantly readable at 40px on a phone. Colour comes
 * from the entity (`s.tint` = element, `s.tint2` = accent), so one drawer serves
 * every Astra that shares a form — which is exactly how a real sprite sheet
 * would be organised too.
 *
 * Sprite key convention:  astra/<form>/<state>   state ∈ idle | cast | hurt
 */

import Assets from '../core/AssetRegistry.js';
import { TAU } from '../core/Math2.js';
import { hexA, mixHex } from '../core/Renderer.js';
import {
  halo, orb, crystal, flame, ring, satellites, tail, eye, flashOverlay,
} from './shapes.js';

const BASE = { w: 72, h: 72, anchor: { x: 0.5, y: 0.5 }, frames: 8, fps: 10 };

/* ------------------------------------------------------------------
   ORB — serene, floating sphere with orbital rings. The "starter" look.
   ------------------------------------------------------------------ */
function drawOrb(ctx, s) {
  const t = s.t;
  const breathe = 1 + Math.sin(t * 2.1) * 0.045;
  const r = s.w * 0.28 * breathe;

  halo(ctx, r * 3.1, s.tint, 0.4 + s.charge * 0.35);

  // Outer rings — two, counter-rotating, tilted.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ring(ctx, r * 1.85, r * 0.62, hexA(s.tint2, 0.75), t * 0.9, Math.max(1.2, r * 0.1));
  ring(ctx, r * 1.5, r * 0.5, hexA(s.tint, 0.6), -t * 1.35 + 1.2, Math.max(1, r * 0.08));
  ctx.restore();

  orb(ctx, r, s.tint);

  // Inner core, pulsing out of phase with the body.
  const core = r * (0.34 + Math.sin(t * 3.7) * 0.06 + s.charge * 0.25);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(0, 0, core, 0, TAU);
  ctx.fillStyle = mixHex(s.tint2, '#ffffff', 0.55);
  ctx.fill();
  ctx.restore();

  satellites(ctx, r * 2.15, 3, s.tint2, t * 1.7, Math.max(1.4, r * 0.13));
  flashOverlay(ctx, r * 1.1, s.flash);
}

/* ------------------------------------------------------------------
   BLADE — aggressive faceted shard, spins up when casting.
   ------------------------------------------------------------------ */
function drawBlade(ctx, s) {
  const t = s.t;
  const r = s.w * 0.3;
  const spin = t * (0.6 + s.charge * 6);

  halo(ctx, r * 2.7, s.tint, 0.36 + s.charge * 0.4);

  // Three stacked shards at different scales = depth without a Z buffer.
  for (let i = 2; i >= 0; i--) {
    ctx.save();
    ctx.rotate(spin * (1 - i * 0.28) + i * 0.7);
    ctx.globalAlpha *= i === 0 ? 1 : 0.42;
    crystal(ctx, r * (1 - i * 0.2), 6, i === 0 ? s.tint : s.tint2, 0, 0.55);
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.rotate(spin);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.2, 0);
  ctx.lineTo(0, r * 0.55); ctx.lineTo(-r * 0.2, 0);
  ctx.closePath();
  ctx.fillStyle = mixHex(s.tint2, '#ffffff', 0.7);
  ctx.fill();
  ctx.restore();

  flashOverlay(ctx, r, s.flash);
}

/* ------------------------------------------------------------------
   WISP — a living flame with a drifting tail. Softest silhouette.
   ------------------------------------------------------------------ */
function drawWisp(ctx, s) {
  const t = s.t;
  const w = s.w * 0.2, h = s.h * 0.32;
  const wob = Math.sin(t * 4.3);

  halo(ctx, s.w * 0.6, s.tint, 0.42);

  ctx.save();
  ctx.translate(0, s.h * 0.12);
  ctx.globalAlpha *= 0.7;
  tail(ctx, s.h * 0.5, 6, s.tint, t * 3.4, Math.max(2, s.w * 0.08));
  ctx.restore();

  ctx.save();
  ctx.rotate(wob * 0.06);
  ctx.translate(0, -s.h * 0.04);
  flame(ctx, w * (1 + wob * 0.06), h, s.tint, wob);

  // Inner flame, brighter and smaller.
  ctx.globalCompositeOperation = 'lighter';
  flame(ctx, w * 0.5, h * 0.62, mixHex(s.tint2, '#ffffff', 0.6), -wob);
  ctx.restore();

  // Two spark eyes give it a face without drawing one.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#ffffff';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * w * 0.34, -h * 0.18, Math.max(1, s.w * 0.026), 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  flashOverlay(ctx, s.w * 0.3, s.flash);
}

/* ------------------------------------------------------------------
   BEAST — compact predator silhouette: body, horns, glowing eye.
   ------------------------------------------------------------------ */
function drawBeast(ctx, s) {
  const t = s.t;
  const r = s.w * 0.26;
  const bob = Math.sin(t * 3.1) * r * 0.06;

  halo(ctx, r * 2.6, s.tint, 0.32);
  ctx.save();
  ctx.translate(0, bob);

  // Haunches: two overlapping rounded masses read as a crouching body.
  ctx.beginPath();
  ctx.ellipse(r * 0.28, r * 0.3, r * 0.78, r * 0.62, -0.25, 0, TAU);
  ctx.fillStyle = mixHex(s.tint, '#0a0f24', 0.42);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(-r * 0.16, 0, r * 0.86, r * 0.7, 0.12, 0, TAU);
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, mixHex(s.tint, '#ffffff', 0.35));
  g.addColorStop(1, mixHex(s.tint, '#0a0f24', 0.5));
  ctx.fillStyle = g;
  ctx.fill();

  // Horns.
  ctx.strokeStyle = mixHex(s.tint2, '#ffffff', 0.4);
  ctx.lineWidth = Math.max(1.4, r * 0.14);
  ctx.lineCap = 'round';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.5, -r * 0.42);
    ctx.quadraticCurveTo(sx * r * 1.0, -r * 0.95, sx * r * 0.72, -r * 1.3);
    ctx.stroke();
  }

  // Single eye, tracking a slow arc.
  ctx.save();
  ctx.translate(-r * 0.25, -r * 0.12);
  eye(ctx, r * 0.3, s.tint2, Math.sin(t * 0.9) * 0.8, 0.55);
  ctx.restore();

  // Tail flick.
  ctx.save();
  ctx.translate(r * 0.85, r * 0.22);
  ctx.rotate(-0.5 + Math.sin(t * 2.6) * 0.35);
  tail(ctx, r * 1.3, 4, s.tint2, t * 2, Math.max(1.6, r * 0.14));
  ctx.restore();

  ctx.restore();
  flashOverlay(ctx, r * 1.2, s.flash);
}

/* ------------------------------------------------------------------
   CONSTRUCT — hard-surface machine. Panels, vents, a scanning lens.
   ------------------------------------------------------------------ */
function drawConstruct(ctx, s) {
  const t = s.t;
  const r = s.w * 0.28;

  halo(ctx, r * 2.4, s.tint, 0.3 + s.charge * 0.3);

  // Floating shoulder pods.
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * r * 1.05, Math.sin(t * 2 + sx) * r * 0.1);
    ctx.rotate(sx * 0.3);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-r * 0.22, -r * 0.34, r * 0.44, r * 0.68, r * 0.12);
    else ctx.rect(-r * 0.22, -r * 0.34, r * 0.44, r * 0.68);
    ctx.fillStyle = mixHex(s.tint, '#0a0f24', 0.35);
    ctx.fill();
    ctx.strokeStyle = hexA(s.tint2, 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Core chassis: hexagon with a bevel.
  ctx.save();
  ctx.rotate(Math.sin(t * 0.8) * 0.05);
  crystal(ctx, r, 6, s.tint, Math.PI / 6, 0.94);

  // Panel seams.
  ctx.globalAlpha *= 0.5;
  ctx.strokeStyle = '#05060f';
  ctx.lineWidth = Math.max(0.8, r * 0.05);
  for (let i = 0; i < 3; i++) {
    const y = -r * 0.4 + i * r * 0.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, y);
    ctx.lineTo(r * 0.62, y);
    ctx.stroke();
  }
  ctx.globalAlpha /= 0.5;

  // Scanning lens.
  const scan = (Math.sin(t * 1.6) + 1) / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.52, r * 0.14, 0, 0, TAU);
  ctx.fillStyle = hexA(s.tint2, 0.35 + scan * 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.35 + scan * r * 0.7, 0, r * 0.11, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.restore();

  flashOverlay(ctx, r * 1.1, s.flash);
}

/* ------------------------------------------------------------------
   BLOOM — organic, petals that open when charging. Support archetype.
   ------------------------------------------------------------------ */
function drawBloom(ctx, s) {
  const t = s.t;
  const r = s.w * 0.28;
  const open = 0.55 + Math.sin(t * 1.7) * 0.12 + s.charge * 0.45;

  halo(ctx, r * 2.8, s.tint, 0.34);

  const petals = 6;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU + t * 0.35;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -r * 0.5 * open);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.42, r * 0.3, r * 0.62, 0, 0, TAU);
    const g = ctx.createLinearGradient(0, -r, 0, r * 0.2);
    g.addColorStop(0, mixHex(s.tint2, '#ffffff', 0.55));
    g.addColorStop(1, mixHex(s.tint, '#160a2e', 0.35));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = hexA('#ffffff', 0.2);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  orb(ctx, r * 0.46, mixHex(s.tint2, '#ffffff', 0.25), { spec: true });

  // Pollen motes.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const a = t * 1.1 + (i / 5) * TAU;
    const rr = r * (1.2 + Math.sin(t * 2 + i) * 0.25);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.75, Math.max(0.8, r * 0.06), 0, TAU);
    ctx.fillStyle = hexA(s.tint2, 0.8);
    ctx.fill();
  }
  ctx.restore();

  flashOverlay(ctx, r * 1.2, s.flash);
}

/* ------------------------------------------------------------------
   SERPENT — segmented ribbon that undulates. Reads as fast and slippery.
   ------------------------------------------------------------------ */
function drawSerpent(ctx, s) {
  const t = s.t;
  const r = s.w * 0.1;
  const segs = 7;

  halo(ctx, s.w * 0.55, s.tint, 0.34);

  const pts = [];
  for (let i = 0; i < segs; i++) {
    const k = i / (segs - 1);
    pts.push([
      Math.sin(t * 3.2 - k * 2.4) * s.w * 0.2 * (0.35 + k * 0.65),
      -s.h * 0.26 + k * s.h * 0.52,
    ]);
  }

  // Body: back to front so the head sits on top.
  for (let i = segs - 1; i >= 0; i--) {
    const k = i / (segs - 1);
    const rr = r * (1.35 - k * 0.75);
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], rr, 0, TAU);
    ctx.fillStyle = i === 0
      ? mixHex(s.tint, '#ffffff', 0.35)
      : mixHex(s.tint, '#0a0f24', k * 0.55);
    ctx.fill();
    if (i % 2 === 0) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], rr * 0.45, 0, TAU);
      ctx.fillStyle = hexA(s.tint2, 0.85);
      ctx.fill();
    }
  }

  // Head detail.
  ctx.save();
  ctx.translate(pts[0][0], pts[0][1]);
  ctx.globalCompositeOperation = 'lighter';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * r * 0.5, -r * 0.2, Math.max(0.9, r * 0.24), 0, TAU);
    ctx.fillStyle = mixHex(s.tint2, '#ffffff', 0.6);
    ctx.fill();
  }
  ctx.restore();

  flashOverlay(ctx, s.w * 0.22, s.flash);
}

/* ------------------------------------------------------------------
   PRISM — the UR form. Refracting polyhedron with chromatic separation.
   ------------------------------------------------------------------ */
function drawPrism(ctx, s) {
  const t = s.t;
  const r = s.w * 0.3;

  // Chromatic aberration: draw the same shape three times, offset by hue.
  const CHROMA = [['#ff2fd0', -1.6], ['#22d3ee', 0], ['#fbbf24', 1.6]];
  halo(ctx, r * 3.2, '#c084fc', 0.42);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [col, off] of CHROMA) {
    ctx.save();
    ctx.translate(Math.cos(t * 2.2) * off, Math.sin(t * 2.6) * off);
    ctx.rotate(t * 0.55);
    ctx.globalAlpha *= 0.72;
    crystal(ctx, r, 3, col, 0, 1);
    ctx.rotate(Math.PI);
    crystal(ctx, r * 0.82, 3, col, 0, 1);
    ctx.restore();
  }
  ctx.restore();

  // Refracted light spokes.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.rotate(-t * 0.9);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * r * 3, Math.sin(a) * r * 3);
    g.addColorStop(0, `hsl(${(i * 60 + t * 60) % 360} 100% 70% / 0.55)`);
    g.addColorStop(1, 'transparent');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 3, Math.sin(a) * r * 3);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3 * (1 + Math.sin(t * 5) * 0.15), 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  flashOverlay(ctx, r, s.flash);
}

/* ------------------------------------------------------------------ */

export const ASTRA_FORMS = {
  orb: drawOrb,
  blade: drawBlade,
  wisp: drawWisp,
  beast: drawBeast,
  construct: drawConstruct,
  bloom: drawBloom,
  serpent: drawSerpent,
  prism: drawPrism,
};

export function registerAstraArt() {
  for (const form in ASTRA_FORMS) {
    const draw = ASTRA_FORMS[form];
    // idle / cast / hurt share geometry today; when real sprites land they will
    // be three separate animations under these exact keys.
    Assets.define(`astra/${form}/idle`, { ...BASE, draw });
    Assets.define(`astra/${form}/cast`, { ...BASE, frames: 6, fps: 14, draw });
    Assets.define(`astra/${form}/hurt`, { ...BASE, frames: 2, fps: 12, loop: false, draw });
    // Portrait variant: same drawer, bigger nominal box for collection cards.
    Assets.define(`astra/${form}/portrait`, { ...BASE, w: 200, h: 200, frames: 1, draw });
  }
}
