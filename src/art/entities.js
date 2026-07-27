/**
 * entities.js — procedural art for the Vessel, enemies, bullets and pickups.
 *
 * Readability rule for every enemy silhouette: at 32px on a phone, in motion,
 * you must be able to tell (a) is it dangerous to touch, (b) does it shoot,
 * (c) how much health does it have — from shape and colour alone.
 *
 *   • round + soft   → harmless-ish chaff
 *   • angular + spiky→ contact damage
 *   • has an eye     → it shoots at you
 *   • plated ring    → armoured, takes a while
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  THE RULE WAS BEING BROKEN
 * ─────────────────────────────────────────────────────────────────────────
 *  Twelve archetypes were sharing six drawers. A Lancer, which pauses and
 *  then dashes straight at you, looked exactly like a Swarm, which drifts. A
 *  Turret looked like a Shooter with different numbers. That is not a
 *  cosmetic problem — it is the player being denied the information the
 *  encounter is built on, and every death to it feels cheap.
 *
 *  Each archetype now has its own key and its own silhouette, built from two
 *  things: a variant (see art/variant.js) so no two share a shape, and a set
 *  of *role marks* derived from the archetype's own definition. A gun in the
 *  data puts a barrel on the sprite; a charge AI puts a lance on it; a split
 *  puts a seam on it. The art cannot drift from the behaviour, because the
 *  behaviour is what draws it.
 */

import Assets from '../core/AssetRegistry.js';
import { TAU } from '../core/Math2.js';
import { hexA, mixHex } from '../core/Renderer.js';
import {
  halo, orb, crystal, plate, eye, chevron, flashOverlay, ring, satellites,
} from './shapes.js';
import { NEUTRAL, variantsFor } from './variant.js';

/* ============================================================
   PLAYER VESSEL
   ============================================================ */

function drawVessel(ctx, s) {
  const t = s.t;
  const r = s.w * 0.3;
  const tilt = (s.data?.tilt ?? 0);
  const thrust = s.data?.thrust ?? 0;
  const shield = s.data?.shield ?? 0;
  const invuln = s.data?.invuln ?? 0;

  // Engine plume — behind everything, scales with movement.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const plume = r * (1.1 + thrust * 1.5 + Math.sin(t * 30) * 0.12);
  const g = ctx.createLinearGradient(0, r * 0.4, 0, r * 0.4 + plume);
  g.addColorStop(0, hexA('#a5f3fc', 0.85));
  g.addColorStop(0.4, hexA(s.tint, 0.5));
  g.addColorStop(1, hexA(s.tint, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-r * 0.34, r * 0.35);
  ctx.lineTo(r * 0.34, r * 0.35);
  ctx.lineTo(r * 0.12, r * 0.4 + plume);
  ctx.lineTo(-r * 0.12, r * 0.4 + plume);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  halo(ctx, r * 2.4, s.tint, 0.35 + invuln * 0.3);

  ctx.save();
  ctx.rotate(tilt * 0.32);

  // Hull: an arrowhead with a cut-out spine.
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.15);
  ctx.lineTo(r * 0.78, r * 0.5);
  ctx.lineTo(r * 0.3, r * 0.32);
  ctx.lineTo(0, r * 0.62);
  ctx.lineTo(-r * 0.3, r * 0.32);
  ctx.lineTo(-r * 0.78, r * 0.5);
  ctx.closePath();
  // Hull palette comes from the equipped skin; the shape never changes, so a
  // finish can't blur the silhouette the game is read by.
  const hull = s.data?.hull ?? ['#e2e8f0', '#94a3b8', '#334155'];
  const trim = s.data?.trim ?? '#f8fafc';
  const hg = ctx.createLinearGradient(-r, -r, r, r);
  hg.addColorStop(0, hull[0]);
  hg.addColorStop(0.45, hull[1]);
  hg.addColorStop(1, hull[2]);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = hexA(trim, 0.55);
  ctx.lineWidth = Math.max(0.8, r * 0.05);
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Canopy — the one saturated element, so the eye locks to it.
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.3, r * 0.22, r * 0.42, 0, 0, TAU);
  const cg = ctx.createLinearGradient(0, -r * 0.7, 0, r * 0.1);
  cg.addColorStop(0, mixHex(s.tint, '#ffffff', 0.6));
  cg.addColorStop(1, mixHex(s.tint, '#0a0f24', 0.4));
  ctx.fillStyle = cg;
  ctx.fill();

  // Wing accent stripes.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(s.tint, 0.9);
  ctx.lineWidth = Math.max(1, r * 0.08);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.32, r * 0.05);
    ctx.lineTo(sx * r * 0.62, r * 0.42);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // Shield bubble.
  if (shield > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sr = r * (1.75 + Math.sin(t * 4) * 0.05);
    const sg = ctx.createRadialGradient(0, 0, sr * 0.72, 0, 0, sr);
    sg.addColorStop(0, hexA('#67e8f9', 0));
    sg.addColorStop(0.8, hexA('#67e8f9', 0.22 * shield));
    sg.addColorStop(1, hexA('#a5f3fc', 0.55 * shield));
    ctx.beginPath();
    ctx.arc(0, 0, sr, 0, TAU);
    ctx.fillStyle = sg;
    ctx.fill();
    // Hex facets on the shield.
    ctx.globalAlpha *= 0.35 * shield;
    ctx.strokeStyle = '#a5f3fc';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * sr * 0.4, Math.sin(a) * sr * 0.4);
      ctx.lineTo(Math.cos(a) * sr, Math.sin(a) * sr);
      ctx.stroke();
    }
    ctx.restore();
  }

  // I-frames: white outline pulse.
  if (invuln > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.5 + Math.sin(t * 26) * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, TAU);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  flashOverlay(ctx, r * 1.2, s.flash);
}

/* ============================================================
   ENEMIES
   ============================================================ */

/** DRONE — basic diamond, drifts downward. Contact damage. */
function drawDrone(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.4 * v.bulk;
  const sides = 3 + (v.c % 4);          // 3–6 sided body
  halo(ctx, r * 1.9, s.tint, 0.3);
  ctx.save();
  ctx.rotate(t * 1.1 * v.flip);
  crystal(ctx, r, sides, s.tint, 0, 0.62);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.26 * (1 + Math.sin(t * 6) * 0.14), 0, TAU);
  ctx.fillStyle = mixHex(s.tint, '#ffffff', 0.7);
  ctx.fill();
  ctx.restore();
  flashOverlay(ctx, r, s.flash);
}

/** SWARM — tiny fast triangle. Comes in tens. */
function drawSwarm(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.38 * v.bulk;
  const notch = 0.15 + (v.c / 4) * 0.5;   // how deeply the tail is cut in
  halo(ctx, r * 1.5, s.tint, 0.25);
  ctx.save();
  ctx.rotate(Math.sin(t * 9) * 0.28 * v.flip);
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(r * 0.8, -r * 0.7);
  ctx.lineTo(0, -r * (0.7 - notch));
  ctx.lineTo(-r * 0.8, -r * 0.7);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, mixHex(s.tint, '#0a0f24', 0.4));
  g.addColorStop(1, mixHex(s.tint, '#ffffff', 0.5));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  flashOverlay(ctx, r, s.flash);
}

/** TANK — armoured hexagon with rotating plates. Slow, high HP. */
function drawTank(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.42 * v.bulk;
  const plates = 3 + (v.c % 4);         // 3–6 armour segments
  const sides = 5 + (v.a % 4);
  halo(ctx, r * 1.8, s.tint, 0.28);

  ctx.save();
  ctx.rotate(t * 0.5 * v.flip);
  for (let i = 0; i < plates; i++) {
    const a0 = (i / plates) * TAU + 0.18;
    plate(ctx, r, a0, a0 + TAU / plates - 0.36, mixHex(s.tint, '#64748b', 0.35), r * 0.26);
  }
  ctx.restore();

  crystal(ctx, r * 0.66, sides, s.tint, Math.PI / sides, 0.95);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, TAU);
  ctx.fillStyle = hexA('#fca5a5', 0.6 + Math.sin(t * 3) * 0.3);
  ctx.fill();
  ctx.restore();
  flashOverlay(ctx, r, s.flash);
}

/** SHOOTER — has an eye, so you know it shoots. Telegraphs by widening. */
function drawShooter(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.4 * v.bulk;
  const lids = 1 + (v.c % 2);           // one shell or two
  const aim = s.data?.aim ?? Math.PI / 2;
  const charge = s.charge;

  halo(ctx, r * 2 + charge * r * 2, s.tint, 0.3 + charge * 0.5);

  // Shell: arcs like eyelids.
  for (const sy of lids === 1 ? [1] : [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(0, sy * r * 0.42 * (1 - charge * 0.4), r * 0.98, r * 0.5, 0, 0, TAU);
    ctx.fillStyle = mixHex(s.tint, sy < 0 ? '#ffffff' : '#0a0f24', 0.35);
    ctx.fill();
  }

  ctx.save();
  ctx.rotate(aim - Math.PI / 2);
  ctx.translate(0, -r * 0.05);
  eye(ctx, r * 0.42, mixHex(s.tint, '#ffffff', 0.4), 0, 0.2);
  ctx.restore();

  if (charge > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.rotate(aim - Math.PI / 2);
    ctx.beginPath();
    ctx.arc(0, r * 0.55, r * 0.2 * charge, 0, TAU);
    ctx.fillStyle = '#fecaca';
    ctx.fill();
    ctx.restore();
  }
  flashOverlay(ctx, r, s.flash);
}

/** SPLITTER — soft blob. Dies into smaller blobs, so it looks unstable. */
function drawSplitter(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.4 * v.bulk;
  const nuclei = 2 + (v.c % 4);         // how many it looks like it holds
  halo(ctx, r * 1.9, s.tint, 0.32);

  ctx.beginPath();
  const lobes = 5 + (v.a % 4);
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * TAU;
    const wob = 1 + Math.sin(a * 3 + t * 4) * 0.13 + Math.sin(a * 5 - t * 2.6) * 0.07;
    const x = Math.cos(a) * r * wob, y = Math.sin(a) * r * wob;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, mixHex(s.tint, '#ffffff', 0.6));
  g.addColorStop(1, mixHex(s.tint, '#160a2e', 0.55));
  ctx.fillStyle = g;
  ctx.fill();

  // Internal nuclei hint at what it splits into.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < nuclei; i++) {
    const a = t * 1.4 + (i / nuclei) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, r * 0.15, 0, TAU);
    ctx.fillStyle = hexA(s.tint2, 0.8);
    ctx.fill();
  }
  ctx.restore();
  flashOverlay(ctx, r, s.flash);
}

/** WEAVER — a ring that orbits and lays hazard trails. */
function drawWeaver(ctx, s, v = NEUTRAL) {
  const t = s.t * v.rate + v.phase;
  const r = s.w * 0.4 * v.bulk;
  const sats = 2 + (v.c % 5);           // 2–6 orbiting motes
  halo(ctx, r * 2, s.tint, 0.3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ring(ctx, r, r, hexA(s.tint, 0.9), t * 2.2 * v.flip, Math.max(2, r * 0.2), 0.9);
  ring(ctx, r * 0.6, r * 0.6, hexA(s.tint2, 0.8), -t * 3.1 * v.flip, Math.max(1.4, r * 0.14), 1.4);
  ctx.restore();
  satellites(ctx, r * 1.15, sats, s.tint2, t * 2.6 * v.flip, Math.max(1.6, r * 0.16));
  flashOverlay(ctx, r, s.flash);
}

/**
 * LOOM — a spinning frame that spools thread between its arms.
 *
 * The other three bosses are round: a shielded core, a maw, a star. This one
 * is a cross, because its whole fight is about a rotating spoke sweeping the
 * arena — the silhouette has to say "this thing turns" before the first shot
 * does.
 */
function drawBossLoom(ctx, s) {
  const t = s.t;
  const r = s.w * 0.42;
  const phase = s.data?.phase ?? 0;
  const spin = t * (0.5 + phase * 0.3);
  const arms = 4;

  halo(ctx, r * 2.7, s.tint, 0.4);

  // Arms. They lengthen with each phase, so the reach reads before it hits.
  ctx.save();
  ctx.rotate(spin);
  const reach = r * (1.35 + phase * 0.2);
  for (let i = 0; i < arms; i++) {
    ctx.save();
    ctx.rotate((i / arms) * TAU);
    ctx.beginPath();
    ctx.moveTo(-r * 0.16, 0);
    ctx.lineTo(0, -reach);
    ctx.lineTo(r * 0.16, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -reach, 0, 0);
    g.addColorStop(0, mixHex(s.tint2, '#ffffff', 0.5));
    g.addColorStop(1, mixHex(s.tint, '#04160f', 0.5));
    ctx.fillStyle = g;
    ctx.fill();
    // Spool tip.
    ctx.beginPath();
    ctx.arc(0, -reach, r * 0.14, 0, TAU);
    ctx.fillStyle = hexA(s.tint2, 0.9);
    ctx.fill();
    ctx.restore();
  }

  // Thread strung between neighbouring tips — the lattice it is weaving.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(s.tint2, 0.35 + s.charge * 0.5);
  ctx.lineWidth = Math.max(1, r * 0.045);
  ctx.beginPath();
  for (let i = 0; i < arms; i++) {
    const a0 = (i / arms) * TAU - Math.PI / 2;
    const a1 = ((i + 1) / arms) * TAU - Math.PI / 2;
    ctx.moveTo(Math.cos(a0) * reach, Math.sin(a0) * reach);
    ctx.lineTo(Math.cos(a1) * reach, Math.sin(a1) * reach);
  }
  ctx.stroke();
  ctx.restore();

  // Hub.
  ctx.save();
  ctx.rotate(-spin * 0.6);
  crystal(ctx, r * 0.62, 4, s.tint, Math.PI / 4, 0.9);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const core = r * (0.2 + s.charge * 0.3 + Math.sin(t * 4) * 0.03);
  ctx.beginPath();
  ctx.arc(0, 0, core, 0, TAU);
  ctx.fillStyle = mixHex(s.tint2, '#ffffff', 0.6);
  ctx.fill();
  ctx.restore();

  flashOverlay(ctx, r * 1.1, s.flash * 0.6);
}

/* ------------------------------------------------------------------
   ROLE MARKS
   ------------------------------------------------------------------
   Drawn on top of the base form, in the accent colour so they stay legible
   against every enemy palette. Each one is a promise about behaviour:

     barrel  → this thing shoots, and that is the direction
     lance   → this thing will stop, wind up, and dash at you
     seam    → killing this makes more of them
     fins    → this thing circles instead of closing in

   Keep them large and few. A mark that needs a second look is not a mark.
   ------------------------------------------------------------------ */

function markBarrel(ctx, s, r) {
  const aim = s.data?.aim ?? Math.PI / 2;
  ctx.save();
  ctx.rotate(aim - Math.PI / 2);
  const len = r * (0.72 + s.charge * 0.3);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-r * 0.16, r * 0.28, r * 0.32, len * 0.7, r * 0.08);
  else ctx.rect(-r * 0.16, r * 0.28, r * 0.32, len * 0.7);
  ctx.fillStyle = mixHex(s.tint, '#0a0f24', 0.45);
  ctx.fill();
  ctx.strokeStyle = hexA(s.tint2, 0.75);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();
  // Aperture: brightens as the shot charges, so the wind-up is visible.
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(0, r * 0.28 + len * 0.7, r * (0.11 + s.charge * 0.13), 0, TAU);
  ctx.fillStyle = hexA(s.tint2, 0.5 + s.charge * 0.5);
  ctx.fill();
  ctx.restore();
}

function markLance(ctx, s, r) {
  const aim = s.data?.aim ?? Math.PI / 2;
  const out = 1 + s.charge * 0.55;      // extends while it winds up
  ctx.save();
  ctx.rotate(aim - Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, r * 2.1 * out);
  ctx.lineTo(r * 0.34, r * 0.15);
  ctx.lineTo(-r * 0.34, r * 0.15);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, r * 2.1 * out, 0, 0);
  g.addColorStop(0, mixHex(s.tint2, '#ffffff', 0.75));
  g.addColorStop(1, hexA(s.tint, 0.35));
  ctx.fillStyle = g;
  ctx.fill();
  // Swept-back wings: reads as "aimed", not just "pointy".
  ctx.strokeStyle = hexA(s.tint2, 0.7);
  ctx.lineWidth = Math.max(1.2, r * 0.1);
  ctx.lineCap = 'round';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.28, -r * 0.1);
    ctx.lineTo(sx * r * 0.82, -r * 0.72);
    ctx.stroke();
  }
  ctx.restore();
}

function markSeam(ctx, s, r) {
  ctx.save();
  ctx.rotate(Math.sin(s.t * 1.3) * 0.25);
  // A crack, not a hairline: it has to survive a 32px enemy on a bright
  // background, because it is the only warning that killing this makes more.
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(-r, 0, r, 0);
  g.addColorStop(0, 'transparent');
  g.addColorStop(0.5, mixHex(s.tint2, '#ffffff', 0.6));
  g.addColorStop(1, 'transparent');
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(2, r * 0.2);
  ctx.beginPath();
  ctx.moveTo(-r * 1.05, 0);
  ctx.lineTo(r * 1.05, 0);
  ctx.stroke();
  // Two pips on the seam: "this comes apart here".
  ctx.fillStyle = hexA('#ffffff', 0.85);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * r * 0.55, 0, Math.max(1, r * 0.1), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function markFins(ctx, s, r) {
  ctx.save();
  ctx.fillStyle = hexA(s.tint2, 0.8);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.85, -r * 0.28);
    ctx.lineTo(sx * r * 1.5, 0);
    ctx.lineTo(sx * r * 0.85, r * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const MARKS = { barrel: markBarrel, lance: markLance, seam: markSeam, fins: markFins };

/**
 * Which marks an archetype earns — read straight off its own definition so
 * the sprite can never claim a behaviour the enemy does not have.
 */
export function marksFor(def) {
  const out = [];
  if (def.gun) out.push('barrel');
  if (def.ai === 'charge') out.push('lance');
  if (def.splitInto) out.push('seam');
  if (def.ai === 'orbit') out.push('fins');
  return out;
}

/** ELITE — any enemy can be promoted: gold crown ring + bigger halo. */
function drawEliteAura(ctx, s) {
  const t = s.t;
  const r = s.w * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  halo(ctx, r * 2.2, '#fbbf24', 0.4);
  ctx.rotate(-t * 1.2);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.1 + i * 0.12), i * 1.4, i * 1.4 + 1.6);
    ctx.strokeStyle = hexA('#fde68a', 0.75 - i * 0.2);
    ctx.lineWidth = Math.max(1.4, r * 0.07);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================================================
   BOSSES
   ============================================================ */

/** WARDEN — armoured core with rotating shield segments and a big eye. */
function drawBossWarden(ctx, s) {
  const t = s.t;
  const r = s.w * 0.42;
  const phase = s.data?.phase ?? 0;
  const enraged = phase >= 2;

  halo(ctx, r * 2.6, enraged ? '#f43f5e' : s.tint, 0.42);

  // Outer shield ring — segments open as phases progress.
  ctx.save();
  ctx.rotate(t * (0.32 + phase * 0.22));
  const segs = 6;
  const gap = 0.16 + phase * 0.16;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * TAU + gap;
    plate(ctx, r * 1.5, a0, a0 + TAU / segs - gap * 2,
          mixHex(s.tint, enraged ? '#f43f5e' : '#475569', 0.4), r * 0.3);
  }
  ctx.restore();

  // Core.
  ctx.save();
  ctx.rotate(-t * 0.5);
  crystal(ctx, r, 8, s.tint, 0, 0.88);
  ctx.restore();

  ctx.save();
  ctx.translate(0, 0);
  eye(ctx, r * 0.5, enraged ? '#fca5a5' : mixHex(s.tint2, '#ffffff', 0.4),
      Math.sin(t * 0.8) * 0.9, 0.3 + phase * 0.25);
  ctx.restore();

  if (s.charge > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.6 + s.charge * 1.4), 0, TAU);
    ctx.strokeStyle = hexA('#fca5a5', s.charge);
    ctx.lineWidth = 3 + s.charge * 8;
    ctx.stroke();
    ctx.restore();
  }
  flashOverlay(ctx, r * 1.1, s.flash * 0.6);
}

/** DEVOURER — a maw. Radial teeth that open before a big attack. */
function drawBossDevourer(ctx, s) {
  const t = s.t;
  const r = s.w * 0.44;
  const open = 0.25 + s.charge * 0.75 + Math.sin(t * 1.4) * 0.06;

  halo(ctx, r * 2.8, s.tint, 0.4);

  ctx.beginPath();
  ctx.arc(0, 0, r * 1.25, 0, TAU);
  ctx.fillStyle = mixHex(s.tint, '#05060f', 0.6);
  ctx.fill();

  const teeth = 12;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU + t * 0.2;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -r * (0.6 + open * 0.45));
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.42);
    ctx.lineTo(r * 0.16, r * 0.2);
    ctx.lineTo(-r * 0.16, r * 0.2);
    ctx.closePath();
    ctx.fillStyle = mixHex('#e2e8f0', s.tint, 0.2);
    ctx.fill();
    ctx.restore();
  }

  // Throat — gets brighter the more it charges.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const tg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.8);
  tg.addColorStop(0, hexA('#ffffff', 0.3 + s.charge * 0.7));
  tg.addColorStop(0.5, hexA(s.tint2, 0.5 + s.charge * 0.5));
  tg.addColorStop(1, 'transparent');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, TAU);
  ctx.fill();
  ctx.restore();

  flashOverlay(ctx, r * 1.05, s.flash * 0.6);
}

/** NOVA — a collapsing star. Rings contract before it detonates. */
function drawBossNova(ctx, s) {
  const t = s.t;
  const r = s.w * 0.4;
  halo(ctx, r * 3, '#fbbf24', 0.45 + s.charge * 0.4);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const k = ((t * 0.55 + i / 4) % 1);
    const rr = r * (2.4 - k * 1.5) * (1 - s.charge * 0.35);
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, TAU);
    ctx.strokeStyle = hexA(i % 2 ? '#fde68a' : s.tint, (1 - k) * 0.7);
    ctx.lineWidth = 2 + (1 - k) * 5;
    ctx.stroke();
  }
  ctx.restore();

  orb(ctx, r * (0.85 + s.charge * 0.2), mixHex(s.tint, '#fff7ed', 0.3));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.rotate(t * 0.7);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * r * 3.4, Math.sin(a) * r * 3.4);
    g.addColorStop(0, hexA('#fde68a', 0.5));
    g.addColorStop(1, 'transparent');
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 3.4, Math.sin(a) * r * 3.4);
    ctx.stroke();
  }
  ctx.restore();
  flashOverlay(ctx, r * 1.0, s.flash * 0.6);
}

/* ============================================================
   PROJECTILES
   ============================================================ */

function drawBulletBasic(ctx, s) {
  const r = s.w * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  halo(ctx, r * 3.2, s.tint, 0.6);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.62, r * 1.35, 0, 0, TAU);
  ctx.fillStyle = s.tint;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.15, r * 0.3, r * 0.75, 0, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

function drawBulletShard(ctx, s) {
  const r = s.w * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  halo(ctx, r * 2.6, s.tint, 0.5);
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.5);
  ctx.lineTo(r * 0.62, r * 0.7);
  ctx.lineTo(0, r * 0.3);
  ctx.lineTo(-r * 0.62, r * 0.7);
  ctx.closePath();
  ctx.fillStyle = mixHex(s.tint, '#ffffff', 0.4);
  ctx.fill();
  ctx.restore();
}

function drawBulletOrb(ctx, s) {
  const r = s.w * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  halo(ctx, r * 3.4, s.tint, 0.65);
  ctx.beginPath();
  ctx.arc(0, 0, r * (0.85 + Math.sin(s.t * 18) * 0.08), 0, TAU);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, s.tint);
  g.addColorStop(1, hexA(s.tint, 0.1));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/**
 * Enemy shot.
 *
 * The one thing on screen the player must never fail to see, including against
 * a bright nebula or their own muzzle flash. So it gets a dark outline *under*
 * the additive body — contrast that survives any background — and a white core
 * big enough to read at 12px in a re-encoded video.
 */
function drawBulletEnemy(ctx, s) {
  const r = s.w * 0.5;
  const star = (rr, inner) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const k = i % 2 ? rr * inner : rr;
      const x = Math.cos(a) * k, y = Math.sin(a) * k;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  ctx.save();
  ctx.rotate(s.t * 8);
  // Dark backing, drawn normally so it reads on light backdrops too.
  star(r * 1.28, 0.45);
  ctx.fillStyle = 'rgba(3,4,12,.75)';
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  halo(ctx, r * 3, s.tint, 0.6);
  star(r, 0.45);
  ctx.fillStyle = s.tint;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.46, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

function drawBulletLaser(ctx, s) {
  const len = s.data?.len ?? 200;
  const w = s.w;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(-w * 2, 0, w * 2, 0);
  g.addColorStop(0, hexA(s.tint, 0));
  g.addColorStop(0.5, '#ffffff');
  g.addColorStop(1, hexA(s.tint, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-w * 2, -len, w * 4, len);
  ctx.fillStyle = hexA(s.tint, 0.55);
  ctx.fillRect(-w * 4, -len, w * 8, len);
  ctx.restore();
}

/* ============================================================
   PICKUPS
   ============================================================ */

function drawPrismPickup(ctx, s) {
  const t = s.t;
  const r = s.w * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  halo(ctx, r * 3, s.tint, 0.55);
  ctx.rotate(t * 2.4);
  crystal(ctx, r * (0.9 + Math.sin(t * 5) * 0.1), 3, s.tint, 0, 1);
  ctx.restore();
}

function drawHeartPickup(ctx, s) {
  const t = s.t;
  const r = s.w * 0.5 * (1 + Math.sin(t * 5) * 0.08);
  halo(ctx, r * 2.6, '#fb7185', 0.5);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, r * 0.85);
  ctx.bezierCurveTo(-r * 1.5, -r * 0.15, -r * 0.55, -r * 1.15, 0, -r * 0.35);
  ctx.bezierCurveTo(r * 0.55, -r * 1.15, r * 1.5, -r * 0.15, 0, r * 0.85);
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#fecdd3');
  g.addColorStop(1, '#e11d48');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function drawMagnetPickup(ctx, s) {
  const t = s.t;
  const r = s.w * 0.5;
  halo(ctx, r * 2.6, '#c084fc', 0.5);
  ctx.save();
  ctx.rotate(Math.sin(t * 3) * 0.25);
  ctx.lineWidth = r * 0.42;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#a855f7';
  ctx.beginPath();
  ctx.arc(0, r * 0.15, r * 0.6, Math.PI, 0);
  ctx.stroke();
  ctx.strokeStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, r * 0.15); ctx.lineTo(-r * 0.6, r * 0.62);
  ctx.moveTo(r * 0.6, r * 0.15); ctx.lineTo(r * 0.6, r * 0.62);
  ctx.stroke();
  ctx.restore();
}

function drawBombPickup(ctx, s) {
  const t = s.t;
  const r = s.w * 0.5;
  halo(ctx, r * 2.8, '#fbbf24', 0.55);
  ctx.save();
  ctx.rotate(t * 1.4);
  crystal(ctx, r, 6, '#f59e0b', 0, 0.9);
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34 * (1 + Math.sin(t * 9) * 0.2), 0, TAU);
  ctx.fillStyle = '#fff7ed';
  ctx.fill();
  ctx.restore();
}

function drawCoinPickup(ctx, s) {
  const t = s.t;
  const r = s.w * 0.5;
  const flip = Math.abs(Math.cos(t * 2.6));
  halo(ctx, r * 2.4, '#fbbf24', 0.45);
  ctx.save();
  ctx.scale(Math.max(0.12, flip), 1);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#fef3c7');
  g.addColorStop(0.5, '#fbbf24');
  g.addColorStop(1, '#b45309');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.strokeStyle = hexA('#fff7ed', 0.6);
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  ctx.restore();
}

/* ============================================================
   REGISTRATION
   ============================================================ */

/** The six base bodies, and the nominal box each one is authored at. */
export const ENEMY_FORMS = {
  drone:    { draw: drawDrone,    w: 44, h: 44, frames: 6, fps: 12 },
  swarm:    { draw: drawSwarm,    w: 26, h: 26, frames: 6, fps: 16 },
  tank:     { draw: drawTank,     w: 74, h: 74, frames: 6, fps: 8 },
  shooter:  { draw: drawShooter,  w: 52, h: 52, frames: 6, fps: 10 },
  splitter: { draw: drawSplitter, w: 56, h: 56, frames: 8, fps: 12 },
  weaver:   { draw: drawWeaver,   w: 50, h: 50, frames: 8, fps: 14 },
};

/**
 * @param {Object} [enemyDefs]  data/enemies.js ENEMY, keyed by id. Each
 *   archetype gets its own key, its own silhouette and the role marks its
 *   own definition earns it.
 */
export function registerEntityArt(enemyDefs = {}) {
  for (const form in ENEMY_FORMS) {
    const { draw, ...box } = ENEMY_FORMS[form];
    Assets.define(`enemy/${form}`, { ...box, draw: (ctx, s) => draw(ctx, s, NEUTRAL) });
  }

  const list = Object.values(enemyDefs);
  const variants = variantsFor(list, (d) => d.form ?? 'drone');
  for (const def of list) {
    const form = ENEMY_FORMS[def.form];
    if (!form) {
      console.warn(`[assets] enemy "${def.id}" has unknown form "${def.form}"`);
      continue;
    }
    const { draw, ...box } = form;
    const v = variants.get(def.id);
    const marks = marksFor(def).map((m) => MARKS[m]);
    Assets.define(`enemy/${def.id}`, {
      ...box,
      draw(ctx, s) {
        draw(ctx, s, v);
        // Marks last, so the promise about behaviour is never painted over.
        const r = s.w * 0.4 * v.bulk;
        for (const mark of marks) mark(ctx, s, r);
      },
    });
  }

  Assets
    .define('vessel/idle', { w: 68, h: 68, frames: 1, draw: drawVessel })
    .alias('vessel/idle', 'vessel/hurt', 'vessel/boost')

    .define('enemy/elite',    { w: 80, h: 80, frames: 8, fps: 12, draw: drawEliteAura })

    .define('boss/warden',   { w: 200, h: 200, frames: 8, fps: 10, draw: drawBossWarden })
    .define('boss/devourer', { w: 210, h: 210, frames: 8, fps: 10, draw: drawBossDevourer })
    .define('boss/nova',     { w: 190, h: 190, frames: 8, fps: 12, draw: drawBossNova })
    .define('boss/loom',     { w: 205, h: 205, frames: 8, fps: 10, draw: drawBossLoom })

    .define('bullet/basic', { w: 12, h: 12, frames: 1, draw: drawBulletBasic })
    .define('bullet/shard', { w: 14, h: 14, frames: 1, draw: drawBulletShard })
    .define('bullet/orb',   { w: 20, h: 20, frames: 4, fps: 18, draw: drawBulletOrb })
    .define('bullet/enemy', { w: 16, h: 16, frames: 4, fps: 18, draw: drawBulletEnemy })
    .define('bullet/laser', { w: 8,  h: 8,  frames: 1, draw: drawBulletLaser })

    .define('pickup/prism',  { w: 18, h: 18, frames: 6, fps: 14, draw: drawPrismPickup })
    .define('pickup/heart',  { w: 26, h: 26, frames: 6, fps: 10, draw: drawHeartPickup })
    .define('pickup/magnet', { w: 26, h: 26, frames: 6, fps: 10, draw: drawMagnetPickup })
    .define('pickup/bomb',   { w: 28, h: 28, frames: 6, fps: 12, draw: drawBombPickup })
    .define('pickup/coin',   { w: 22, h: 22, frames: 8, fps: 12, draw: drawCoinPickup });
}
