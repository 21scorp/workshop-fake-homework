/**
 * astra.js — procedural art for the collectible Astra.
 *
 * Eight forms, each instantly readable at 40px on a phone. Colour comes from
 * the entity (`s.tint` = element, `s.tint2` = accent).
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  ONE DRAWER PER FORM IS NOT ENOUGH
 * ─────────────────────────────────────────────────────────────────────────
 *  data/astra.js sets the rule: "if two Astra look alike in a thumbnail, one
 *  of them is wrong." Twenty-one characters over eight forms broke it — the
 *  collection screen showed three identical horned silhouettes in a row, and
 *  a gacha whose characters are interchangeable has nothing to sell.
 *
 *  So every drawer takes a *variant*: petal count, horn count, segment count,
 *  facet count, bulk, animation rate, phase. The variant is hashed from the
 *  Astra's id, so it is a property of the character rather than of load order,
 *  it is stable across sessions and share cards, and a twenty-second Astra
 *  gets a distinct look the moment someone types its name. `art: {}` on a
 *  roster entry overrides any knob by hand.
 *
 *  The phase offset is worth its own line: without it two Serpents on screen
 *  undulate in perfect lockstep, which reads as a repeated sprite rather than
 *  as two creatures.
 *
 * Sprite key convention:  astra/<id>/<state>   state ∈ idle | cast | hurt
 * The generic `astra/<form>/<state>` keys stay registered as a fallback.
 */

import Assets from '../core/AssetRegistry.js';
import { TAU } from '../core/Math2.js';
import { hexA, mixHex } from '../core/Renderer.js';
import {
  halo, orb, crystal, flame, ring, satellites, tail, eye, flashOverlay,
} from './shapes.js';
import { NEUTRAL, variantsFor } from './variant.js';

const BASE = { w: 72, h: 72, anchor: { x: 0.5, y: 0.5 }, frames: 8, fps: 10 };

/* ------------------------------------------------------------------
   ORB — serene, floating sphere with orbital rings. The "starter" look.
   ------------------------------------------------------------------ */
function drawOrb(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const breathe = 1 + Math.sin(t * 2.1) * 0.045;
  const r = s.w * 0.28 * breathe * v.bulk;
  const rings = 1 + (v.c % 3);          // 1–3 orbital rings
  const sats = 2 + v.c % 4;             // 2–5 satellites

  halo(ctx, r * 3.1, s.tint, 0.4 + s.charge * 0.35);

  // Counter-rotating tilted rings; each one smaller and slower than the last.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < rings; i++) {
    const k = 1 - i * 0.22;
    ring(ctx, r * 1.85 * k, r * 0.62 * k, hexA(i % 2 ? s.tint : s.tint2, 0.75 - i * 0.12),
      t * (0.9 + i * 0.45) * (i % 2 ? -1 : 1) * v.flip + i * 1.2,
      Math.max(1, r * (0.1 - i * 0.015)));
  }
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

  satellites(ctx, r * 2.15, sats, s.tint2, t * 1.7 * v.flip, Math.max(1.4, r * 0.13));
  flashOverlay(ctx, r * 1.1, s.flash);
}

/* ------------------------------------------------------------------
   BLADE — aggressive faceted shard, spins up when casting.
   ------------------------------------------------------------------ */
function drawBlade(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.3 * v.bulk;
  const spin = t * (0.6 + s.charge * 6) * v.flip;
  const facets = 3 + v.c;               // 3–7 sided shard
  const shards = 2 + (v.a % 3);         // 2–4 stacked copies

  halo(ctx, r * 2.7, s.tint, 0.36 + s.charge * 0.4);

  // Stacked shards at different scales = depth without a Z buffer.
  for (let i = shards - 1; i >= 0; i--) {
    ctx.save();
    ctx.rotate(spin * (1 - i * 0.28) + i * 0.7);
    ctx.globalAlpha *= i === 0 ? 1 : 0.42;
    crystal(ctx, r * (1 - i * 0.2), facets, i === 0 ? s.tint : s.tint2, 0, 0.55);
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
function drawWisp(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const w = s.w * 0.2 * v.bulk, h = s.h * 0.32 * v.bulk;
  const wob = Math.sin(t * 4.3);
  const segs = 4 + v.c;                 // 4–8 tail beads
  const eyes = 2 + (v.b % 2);           // 2 or 3 sparks

  halo(ctx, s.w * 0.6, s.tint, 0.42);

  ctx.save();
  ctx.translate(0, s.h * 0.12);
  ctx.globalAlpha *= 0.7;
  tail(ctx, s.h * 0.5, segs, s.tint, t * 3.4 * v.flip, Math.max(2, s.w * 0.08));
  ctx.restore();

  ctx.save();
  ctx.rotate(wob * 0.06 + v.tilt);
  ctx.translate(0, -s.h * 0.04);
  flame(ctx, w * (1 + wob * 0.06), h, s.tint, wob);

  // Inner flame, brighter and smaller.
  ctx.globalCompositeOperation = 'lighter';
  flame(ctx, w * 0.5, h * 0.62, mixHex(s.tint2, '#ffffff', 0.6), -wob);
  ctx.restore();

  // Spark eyes give it a face without drawing one. Three read as stranger
  // than two, which is the whole point of varying it.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < eyes; i++) {
    const k = eyes === 1 ? 0 : (i / (eyes - 1)) * 2 - 1;
    ctx.beginPath();
    ctx.arc(k * w * 0.34, -h * 0.18 - Math.abs(k) * h * 0.04,
      Math.max(1, s.w * 0.026), 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  flashOverlay(ctx, s.w * 0.3, s.flash);
}

/* ------------------------------------------------------------------
   BEAST — compact predator silhouette: body, horns, glowing eye.
   ------------------------------------------------------------------ */
function drawBeast(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.26 * v.bulk;
  const bob = Math.sin(t * 3.1) * r * 0.06;
  const hornPairs = 1 + (v.a % 3);      // 1–3 pairs
  const curl = 0.7 + (v.c / 4) * 0.9;   // how far the horns sweep back
  const eyes = 1 + (v.b % 3);           // 1–3 eyes — the strongest identity cue

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

  // Horns. Each pair is shorter and set further back than the one before it,
  // so a three-pair beast reads as a crown rather than as clutter.
  ctx.strokeStyle = mixHex(s.tint2, '#ffffff', 0.4);
  ctx.lineWidth = Math.max(1.4, r * 0.14);
  ctx.lineCap = 'round';
  for (let p = 0; p < hornPairs; p++) {
    const k = 1 - p * 0.24;
    const back = p * r * 0.22;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * (r * 0.5 + back), -r * 0.42);
      ctx.quadraticCurveTo(sx * r * curl * 1.35, -r * 0.95 * k,
        sx * (r * 0.72 + back * 0.6), -r * 1.3 * k);
      ctx.stroke();
    }
  }

  // Eyes, tracking a slow arc together.
  const look = Math.sin(t * 0.9) * 0.8;
  for (let i = 0; i < eyes; i++) {
    const k = eyes === 1 ? 0 : (i / (eyes - 1)) * 2 - 1;
    ctx.save();
    ctx.translate(-r * 0.25 + k * r * 0.3, -r * 0.12 + Math.abs(k) * r * 0.16);
    eye(ctx, r * (0.3 - Math.abs(k) * 0.08), s.tint2, look, 0.55);
    ctx.restore();
  }

  // Tail flick.
  ctx.save();
  ctx.translate(r * 0.85, r * 0.22);
  ctx.rotate(-0.5 + Math.sin(t * 2.6) * 0.35);
  tail(ctx, r * 1.3, 3 + (v.c % 4), s.tint2, t * 2, Math.max(1.6, r * 0.14));
  ctx.restore();

  ctx.restore();
  flashOverlay(ctx, r * 1.2, s.flash);
}

/* ------------------------------------------------------------------
   CONSTRUCT — hard-surface machine. Panels, vents, a scanning lens.
   ------------------------------------------------------------------ */
function drawConstruct(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.28 * v.bulk;
  const sides = 4 + (v.c % 5);          // 4–8 sided chassis: a square reads
                                        // nothing like an octagon at 40px
  const podRows = 1 + (v.a % 2);        // one or two pairs of pods
  const seams = 2 + (v.b % 3);          // 2–4 panel lines

  halo(ctx, r * 2.4, s.tint, 0.3 + s.charge * 0.3);

  // Floating shoulder pods.
  for (let row = 0; row < podRows; row++) {
    const oy = (row - (podRows - 1) / 2) * r * 0.72;
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(sx * r * 1.05, oy + Math.sin(t * 2 + sx + row) * r * 0.1);
      ctx.rotate(sx * 0.3);
      const ph = r * (0.34 - row * 0.08);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-r * 0.22, -ph, r * 0.44, ph * 2, r * 0.12);
      else ctx.rect(-r * 0.22, -ph, r * 0.44, ph * 2);
      ctx.fillStyle = mixHex(s.tint, '#0a0f24', 0.35);
      ctx.fill();
      ctx.strokeStyle = hexA(s.tint2, 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Core chassis: bevelled polygon.
  ctx.save();
  ctx.rotate(Math.sin(t * 0.8) * 0.05 + v.tilt * 0.5);
  crystal(ctx, r, sides, s.tint, Math.PI / sides, 0.94);

  // Panel seams.
  ctx.globalAlpha *= 0.5;
  ctx.strokeStyle = '#05060f';
  ctx.lineWidth = Math.max(0.8, r * 0.05);
  for (let i = 0; i < seams; i++) {
    const y = -r * 0.45 + ((i + 0.5) / seams) * r * 0.9;
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
function drawBloom(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.28 * v.bulk;
  const open = 0.55 + Math.sin(t * 1.7) * 0.12 + s.charge * 0.45;
  const petals = 4 + v.c * 1.5 | 0;     // 4–10 petals
  const layers = 1 + (v.a % 2);         // a second, smaller whorl behind

  halo(ctx, r * 2.8, s.tint, 0.34);

  for (let L = layers - 1; L >= 0; L--) {
    const scale = 1 - L * 0.34;
    const n = L === 0 ? petals : Math.max(3, petals - 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 0.35 * v.flip + L * 0.5;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, -r * 0.5 * open * scale);
      ctx.globalAlpha *= L === 0 ? 1 : 0.6;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.42 * scale, r * 0.3 * scale, r * 0.62 * scale, 0, 0, TAU);
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
  }

  orb(ctx, r * 0.46, mixHex(s.tint2, '#ffffff', 0.25), { spec: true });

  // Pollen motes.
  const motes = 4 + (v.b % 4);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < motes; i++) {
    const a = t * 1.1 + (i / motes) * TAU;
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
function drawSerpent(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.1 * v.bulk;
  const segs = 4 + v.c * 1.5 | 0;       // 4–10 body beads
  const amp = 0.14 + (v.a / 3) * 0.12;  // how wide it undulates

  halo(ctx, s.w * 0.55, s.tint, 0.34);

  const pts = [];
  for (let i = 0; i < segs; i++) {
    const k = i / (segs - 1);
    pts.push([
      Math.sin(t * 3.2 - k * 2.4) * s.w * amp * v.flip * (0.35 + k * 0.65),
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
function drawPrism(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.3 * v.bulk;
  const facets = 3 + (v.c % 3);         // 3–5 sided polyhedron
  const spokes = 5 + (v.a % 4);         // 5–8 light spokes

  // Chromatic aberration: draw the same shape three times, offset by hue.
  const CHROMA = [['#ff2fd0', -1.6], ['#22d3ee', 0], ['#fbbf24', 1.6]];
  halo(ctx, r * 3.2, '#c084fc', 0.42);

  // Solid body first, in normal blending. Three additive copies alone sum to
  // white wherever they overlap, and the overlap is the entire middle of the
  // shape — at portrait and banner size KAIROS came out as a white blob with
  // fringes. Lowering the alpha only moved the size at which it blew out.
  // A real body plus *fringes* keeps the facets at every scale.
  ctx.save();
  ctx.rotate(t * 0.55 * v.flip);
  crystal(ctx, r, facets, '#7c3aed', 0, 1);
  ctx.rotate(Math.PI);
  crystal(ctx, r * 0.82, facets, '#a855f7', 0, 0.9);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [col, off] of CHROMA) {
    ctx.save();
    ctx.translate(Math.cos(t * 2.2) * off * 3.4, Math.sin(t * 2.6) * off * 3.4);
    ctx.rotate(t * 0.55 * v.flip);
    ctx.globalAlpha *= 0.3;
    crystal(ctx, r, facets, col, 0, 1);
    ctx.restore();
  }
  ctx.restore();

  // Refracted light spokes.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.rotate(-t * 0.9 * v.flip);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
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
  ctx.globalAlpha *= 0.6;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16 * (1 + Math.sin(t * 5) * 0.15), 0, TAU);
  ctx.fillStyle = '#f5d0fe';
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

/** The four keys every Astra (and every form fallback) registers. */
function defineStates(prefix, draw) {
  // idle / cast / hurt share geometry today; when real sprites land they will
  // be three separate animations under these exact keys.
  Assets.define(`${prefix}/idle`, { ...BASE, draw });
  Assets.define(`${prefix}/cast`, { ...BASE, frames: 6, fps: 14, draw });
  Assets.define(`${prefix}/hurt`, { ...BASE, frames: 2, fps: 12, loop: false, draw });
  // Portrait variant: same drawer, bigger nominal box for collection cards.
  Assets.define(`${prefix}/portrait`, { ...BASE, w: 200, h: 200, frames: 1, draw });
}

/**
 * @param {Array} roster  data/astra.js ASTRA. Each entry gets its own keys.
 */
export function registerAstraArt(roster = []) {
  // Form keys first: the neutral look, and what anything that only knows a
  // form (an editor, a placeholder, an unregistered character) falls back to.
  for (const form in ASTRA_FORMS) {
    const draw = ASTRA_FORMS[form];
    defineStates(`astra/${form}`, (ctx, s) => draw(ctx, s, NEUTRAL));
  }

  // Then one set per character, so no two Astra share a silhouette.
  const variants = variantsFor(roster, (a) => a.form);
  for (const a of roster) {
    const draw = ASTRA_FORMS[a.form];
    if (!draw) {
      console.warn(`[assets] Astra "${a.id}" has unknown form "${a.form}"`);
      continue;
    }
    const v = variants.get(a.id);
    defineStates(`astra/${a.id}`, (ctx, s) => draw(ctx, s, v));
  }
}
