/**
 * Share.js — the viral layer.
 *
 * Two mechanisms, both serverless:
 *
 *  1. **Seed links** — `?s=CODE` reproduces an identical run. Post the code in
 *     a video, anyone can fight the exact same fight and compare. This is the
 *     duet/stitch primitive.
 *
 *  2. **Share cards** — a 1080×1920 PNG rendered on canvas, sized for an
 *     Instagram Story / TikTok upload. Uses the same procedural art as the game
 *     so the card always matches what the player just saw.
 */

import Assets from '../core/AssetRegistry.js';
import { getAstra, astraSprite } from '../data/astra.js';
import { RARITY_INFO, ELEMENT } from '../data/constants.js';
import { grouped, timeStr } from '../core/Math2.js';
import { hexA, mixHex } from '../core/Renderer.js';
import { save } from '../core/Save.js';
import { bus, EV } from '../core/Events.js';

const CARD_W = 1080;
const CARD_H = 1920;

/* ============================================================
   LINKS
   ============================================================ */

export function seedUrl(seed) {
  const u = new URL(window.location.href);
  u.hash = '';
  u.search = seed ? `?s=${encodeURIComponent(seed)}` : '';
  return u.toString();
}

export function readSeedFromUrl() {
  try {
    const u = new URL(window.location.href);
    const s = u.searchParams.get('s');
    return s ? s.toUpperCase().slice(0, 12) : null;
  } catch { return null; }
}

/** Strip the seed from the address bar after we've consumed it. */
export function clearSeedFromUrl() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('s')) return;
    u.searchParams.delete('s');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  } catch { /* non-fatal */ }
}

/* ============================================================
   NATIVE SHARE
   ============================================================ */

/**
 * Share a run. Uses the Web Share API when available (which is what actually
 * opens the Instagram/TikTok share sheet on mobile), and falls back to
 * clipboard on desktop.
 */
export async function shareRun({ seed, score, wave, astraId, blob } = {}) {
  const astra = getAstra(astraId);
  const lines = [
    score ? `${grouped(score)} punten in ASTRAFALL` : 'Ik speel ASTRAFALL',
    wave ? `Golf ${wave}${astra ? ` · ${astra.name}` : ''}` : null,
    seed ? `Seed: ${seed} — durf jij?` : null,
  ].filter(Boolean);

  const data = {
    title: 'ASTRAFALL',
    text: lines.join('\n'),
    url: seedUrl(seed),
  };

  if (blob && navigator.canShare?.({ files: [new File([blob], 'astrafall.png', { type: 'image/png' })] })) {
    data.files = [new File([blob], 'astrafall.png', { type: 'image/png' })];
  }

  if (navigator.share) {
    try {
      await navigator.share(data);
      return { ok: true, via: 'native' };
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    }
  }

  try {
    await navigator.clipboard.writeText(`${data.text}\n${data.url}`);
    bus.emit(EV.TOAST, { text: 'Link gekopieerd!', tone: 'good' });
    return { ok: true, via: 'clipboard' };
  } catch {
    bus.emit(EV.TOAST, { text: seedUrl(seed), tone: 'info', ttl: 5000 });
    return { ok: false, reason: 'no_clipboard' };
  }
}

export function downloadBlob(blob, filename = 'astrafall.png') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ============================================================
   SHARE CARD
   ============================================================ */

/**
 * Render a vertical share card.
 * @param {object} run  run result
 * @returns {Promise<{canvas: HTMLCanvasElement, blob: Blob}>}
 */
export async function renderShareCard(run) {
  const cv = document.createElement('canvas');
  cv.width = CARD_W;
  cv.height = CARD_H;
  const ctx = cv.getContext('2d');

  const astra = getAstra(run.astraId) ?? getAstra('pip');
  const info = RARITY_INFO[astra.rarity];
  const elem = ELEMENT[astra.element];
  const accent = astra.colors.primary;

  /* ---- background ---- */
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#0a0a1f');
  bg.addColorStop(0.45, '#11082a');
  bg.addColorStop(1, '#05060f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Nebulae.
  for (const [x, y, r, c] of [
    [180, 380, 520, accent],
    [900, 1180, 620, info.color],
    [540, 1750, 480, '#a855f7'],
  ]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(c, 0.24));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Stars.
  ctx.save();
  for (let i = 0; i < 260; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 12345.6789) % 1;
    const px = Math.abs(x) * CARD_W;
    const py = Math.abs(y) * CARD_H;
    const s = 1 + (i % 4) * 0.8;
    ctx.globalAlpha = 0.2 + (i % 7) * 0.09;
    ctx.fillStyle = i % 5 === 0 ? accent : '#cbd5e1';
    ctx.fillRect(px, py, s, s);
  }
  ctx.restore();

  /* ---- header ---- */
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 74px Inter, system-ui, sans-serif';
  const tg = ctx.createLinearGradient(300, 0, 780, 0);
  tg.addColorStop(0, '#22d3ee');
  tg.addColorStop(0.5, '#a855f7');
  tg.addColorStop(1, '#fbbf24');
  ctx.fillStyle = tg;
  ctx.letterSpacing = '22px';
  ctx.fillText('ASTRAFALL', CARD_W / 2 + 11, 190);
  ctx.letterSpacing = '0px';
  ctx.restore();

  /* ---- astra art ---- */
  ctx.save();
  ctx.translate(CARD_W / 2, 560);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 360);
  halo.addColorStop(0, hexA(accent, 0.42));
  halo.addColorStop(0.5, hexA(info.color, 0.18));
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.fillRect(-360, -360, 720, 720);

  Assets.draw(ctx, astraSprite(astra, 'idle'), 0, 0, {
    t: 1.4, scale: 6.4, tint: astra.colors.primary, tint2: astra.colors.secondary,
  });
  ctx.restore();

  /* ---- name plate ---- */
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '800 30px Inter, system-ui, sans-serif';
  ctx.fillStyle = info.color;
  ctx.letterSpacing = '10px';
  ctx.fillText(`${info.name.toUpperCase()} · ${elem.name.toUpperCase()}`, CARD_W / 2 + 5, 830);
  ctx.letterSpacing = '0px';

  ctx.font = '900 90px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.shadowColor = hexA(accent, 0.85);
  ctx.shadowBlur = 40;
  ctx.fillText(astra.name.toUpperCase(), CARD_W / 2, 930);
  ctx.shadowBlur = 0;

  ctx.font = '500 34px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(astra.title, CARD_W / 2, 985);
  ctx.restore();

  /* ---- score block ---- */
  roundRect(ctx, 90, 1060, CARD_W - 180, 300, 42);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = hexA(accent, 0.35);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '700 30px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.letterSpacing = '8px';
  ctx.fillText('SCORE', CARD_W / 2 + 4, 1130);
  ctx.letterSpacing = '0px';

  ctx.font = '900 138px Inter, system-ui, sans-serif';
  const sg = ctx.createLinearGradient(0, 1150, 0, 1280);
  sg.addColorStop(0, '#fff7ed');
  sg.addColorStop(1, '#fbbf24');
  ctx.fillStyle = sg;
  ctx.shadowColor = 'rgba(251,191,36,.6)';
  ctx.shadowBlur = 50;
  ctx.fillText(grouped(run.score ?? 0), CARD_W / 2, 1272);
  ctx.restore();

  /* ---- stat row ---- */
  const stats = [
    ['GOLF', String(run.wave ?? 1)],
    ['KILLS', String(run.kills ?? 0)],
    ['COMBO', `${run.maxCombo ?? 0}×`],
    ['TIJD', timeStr(run.time ?? 0, false)],
  ];
  const cellW = (CARD_W - 180) / stats.length;
  stats.forEach(([label, value], i) => {
    const cx = 90 + cellW * i + cellW / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '900 54px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(value, cx, 1470);
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.letterSpacing = '4px';
    ctx.fillText(label, cx + 2, 1512);
    ctx.restore();
    if (i < stats.length - 1) {
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(90 + cellW * (i + 1), 1420, 2, 100);
    }
  });

  /* ---- seed callout — the actual viral hook ---- */
  if (run.seed) {
    roundRect(ctx, 140, 1580, CARD_W - 280, 168, 40);
    const seedGrad = ctx.createLinearGradient(140, 1580, CARD_W - 140, 1748);
    seedGrad.addColorStop(0, hexA('#22d3ee', 0.16));
    seedGrad.addColorStop(1, hexA('#a855f7', 0.16));
    ctx.fillStyle = seedGrad;
    ctx.fill();
    ctx.strokeStyle = hexA('#67e8f9', 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 26px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#a5f3fc';
    ctx.letterSpacing = '6px';
    ctx.fillText('SPEEL DEZELFDE RUN — SEED', CARD_W / 2 + 3, 1638);
    ctx.letterSpacing = '0px';
    ctx.font = '900 82px "SF Mono", ui-monospace, monospace';
    ctx.fillStyle = '#f0f9ff';
    ctx.shadowColor = 'rgba(103,232,249,.7)';
    ctx.shadowBlur = 30;
    ctx.fillText(run.seed, CARD_W / 2, 1718);
    ctx.restore();
  }

  /* ---- footer ---- */
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(`${save.profile.name} · Lv ${save.profile.account.level}`, CARD_W / 2, 1812);

  // Where to play it. A share card without an address is a screenshot of a
  // score; with one it's an invitation.
  const host = shareHost();
  if (host) {
    ctx.font = '700 26px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.letterSpacing = '3px';
    ctx.fillText(host, CARD_W / 2 + 2, 1858);
    ctx.letterSpacing = '0px';
  }
  ctx.restore();

  const blob = await new Promise((res) => cv.toBlob(res, 'image/png', 0.95));
  return { canvas: cv, blob };
}

/** The address people should type, or nothing when running locally. */
function shareHost() {
  try {
    const h = location.host;
    if (!h || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(h)) return null;
    return h.replace(/^www\./, '');
  } catch { return null; }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
