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
 */

import Assets from '../core/AssetRegistry.js';
import { TAU } from '../core/Math2.js';
import { hexA, mixHex } from '../core/Renderer.js';
import {
  halo, orb, crystal, plate, eye, chevron, flashOverlay, ring, satellites,
} from './shapes.js';

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
  const hg = ctx.createLinearGradient(-r, -r, r, r);
  hg.addColorStop(0, '#e2e8f0');
  hg.addColorStop(0.45, '#94a3b8');
  hg.addColorStop(1, '#334155');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = hexA('#f8fafc', 0.55);
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
function drawDrone(ctx, s) {
  const t = s.t;
  const r = s.w * 0.4;
  halo(ctx, r * 1.9, s.tint, 0.3);
  ctx.save();
  ctx.rotate(t * 1.1);
  crystal(ctx, r, 4, s.tint, 0, 0.62);
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
function drawSwarm(ctx, s) {
  const t = s.t;
  const r = s.w * 0.38;
  halo(ctx, r * 1.5, s.tint, 0.25);
  ctx.save();
  ctx.rotate(Math.sin(t * 9) * 0.28);
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(r * 0.8, -r * 0.7);
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
function drawTank(ctx, s) {
  const t = s.t;
  const r = s.w * 0.42;
  halo(ctx, r * 1.8, s.tint, 0.28);

  ctx.save();
  ctx.rotate(t * 0.5);
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * TAU + 0.18;
    plate(ctx, r, a0, a0 + TAU / 4 - 0.36, mixHex(s.tint, '#64748b', 0.35), r * 0.26);
  }
  ctx.restore();

  crystal(ctx, r * 0.66, 6, s.tint, Math.PI / 6, 0.95);
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
function drawShooter(ctx, s) {
  const t = s.t;
  const r = s.w * 0.4;
  const aim = s.data?.aim ?? Math.PI / 2;
  const charge = s.charge;

  halo(ctx, r * 2 + charge * r * 2, s.tint, 0.3 + charge * 0.5);

  // Shell: two arcs like eyelids.
  for (const sy of [-1, 1]) {
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
function drawSplitter(ctx, s) {
  const t = s.t;
  const r = s.w * 0.4;
  halo(ctx, r * 1.9, s.tint, 0.32);

  ctx.beginPath();
  const lobes = 7;
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
  for (let i = 0; i < 3; i++) {
    const a = t * 1.4 + (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, r * 0.15, 0, TAU);
    ctx.fillStyle = hexA(s.tint2, 0.8);
    ctx.fill();
  }
  ctx.restore();
  flashOverlay(ctx, r, s.flash);
}

/** WEAVER — a ring that orbits and lays hazard trails. */
function drawWeaver(ctx, s) {
  const t = s.t;
  const r = s.w * 0.4;
  halo(ctx, r * 2, s.tint, 0.3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ring(ctx, r, r, hexA(s.tint, 0.9), t * 2.2, Math.max(2, r * 0.2), 0.9);
  ring(ctx, r * 0.6, r * 0.6, hexA(s.tint2, 0.8), -t * 3.1, Math.max(1.4, r * 0.14), 1.4);
  ctx.restore();
  satellites(ctx, r * 1.15, 4, s.tint2, t * 2.6, Math.max(1.6, r * 0.16));
  flashOverlay(ctx, r, s.flash);
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
  flashOverlay(ctx, r * 1.5, s.flash);
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

  flashOverlay(ctx, r * 1.4, s.flash);
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
  flashOverlay(ctx, r * 1.2, s.flash);
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

function drawBulletEnemy(ctx, s) {
  const r = s.w * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  halo(ctx, r * 3, s.tint, 0.6);
  ctx.rotate(s.t * 8);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 ? r * 0.45 : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = s.tint;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.35, 0, TAU);
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

export function registerEntityArt() {
  Assets
    .define('vessel/idle', { w: 68, h: 68, frames: 1, draw: drawVessel })
    .alias('vessel/idle', 'vessel/hurt', 'vessel/boost')

    .define('enemy/drone',    { w: 44, h: 44, frames: 6, fps: 12, draw: drawDrone })
    .define('enemy/swarm',    { w: 26, h: 26, frames: 6, fps: 16, draw: drawSwarm })
    .define('enemy/tank',     { w: 74, h: 74, frames: 6, fps: 8,  draw: drawTank })
    .define('enemy/shooter',  { w: 52, h: 52, frames: 6, fps: 10, draw: drawShooter })
    .define('enemy/splitter', { w: 56, h: 56, frames: 8, fps: 12, draw: drawSplitter })
    .define('enemy/weaver',   { w: 50, h: 50, frames: 8, fps: 14, draw: drawWeaver })
    .define('enemy/elite',    { w: 80, h: 80, frames: 8, fps: 12, draw: drawEliteAura })

    .define('boss/warden',   { w: 200, h: 200, frames: 8, fps: 10, draw: drawBossWarden })
    .define('boss/devourer', { w: 210, h: 210, frames: 8, fps: 10, draw: drawBossDevourer })
    .define('boss/nova',     { w: 190, h: 190, frames: 8, fps: 12, draw: drawBossNova })

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
