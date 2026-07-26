/**
 * Renderer.js — canvas2d surface with a virtual coordinate system.
 *
 * The whole game is authored against a 720-wide virtual viewport. Height flexes
 * with the device aspect (clamped), so a tall phone sees more sky and a short
 * one sees less — nothing ever stretches. On desktop the surface is letterboxed
 * into a phone-shaped box, because that is the shape the game is *for*.
 *
 * Everything downstream (entities, particles, UI anchors) works in virtual
 * units. Only this file knows about device pixels.
 */

import { clamp, TAU } from './Math2.js';

export const VIRTUAL_W = 720;
const MIN_H = 1120;   // widest we allow (aspect 1.56)
const MAX_H = 1560;   // tallest we allow (aspect 2.17)

export class Renderer {
  /** @param {HTMLCanvasElement} canvas @param {HTMLElement} stage */
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    /** Virtual viewport, in design units. */
    this.view = { w: VIRTUAL_W, h: 1280 };
    /** Device pixels per virtual unit. */
    this.scale = 1;
    this.dpr = 1;
    /** CSS pixel size of the drawing box. */
    this.cssW = 0;
    this.cssH = 0;
    /** CSS pixel offset of the box inside the window (for pointer mapping). */
    this.offX = 0;
    this.offY = 0;

    /** Camera shake / offset, applied in begin(). */
    this.camX = 0;
    this.camY = 0;
    this.camRot = 0;
    this.camZoom = 1;

    /** Quality tier: 1 = full, 0.75 = reduced particles, 0.5 = potato. */
    this.quality = 1;

    this._gradCache = new Map();
    this.resize();
  }

  /* ---------------------------------------------------------- sizing */

  resize() {
    const cw = Math.max(1, window.innerWidth);
    const ch = Math.max(1, window.innerHeight);

    // Virtual height tracks the device aspect, clamped to a playable band.
    const wantH = VIRTUAL_W * (ch / cw);
    this.view.h = Math.round(clamp(wantH, MIN_H, MAX_H));
    this.view.w = VIRTUAL_W;

    // Fit the virtual box inside the window without distortion.
    const fit = Math.min(cw / this.view.w, ch / this.view.h);
    this.cssW = Math.floor(this.view.w * fit);
    this.cssH = Math.floor(this.view.h * fit);
    this.offX = Math.floor((cw - this.cssW) / 2);
    this.offY = Math.floor((ch - this.cssH) / 2);

    // Cap DPR: a 3x retina phone rendering 720×1560×3 is 10M pixels of fill.
    this.dpr = clamp(window.devicePixelRatio || 1, 1, this.quality >= 1 ? 2.25 : 1.5);
    this.scale = fit * this.dpr;

    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);
    this.canvas.style.width = this.cssW + 'px';
    this.canvas.style.height = this.cssH + 'px';
    this.canvas.style.left = this.offX + 'px';
    this.canvas.style.top = this.offY + 'px';

    // Publish the box so DOM UI can sit exactly on top of the canvas.
    const s = this.stage?.style;
    if (s) {
      s.setProperty('--stage-w', this.cssW + 'px');
      s.setProperty('--stage-h', this.cssH + 'px');
      s.setProperty('--stage-x', this.offX + 'px');
      s.setProperty('--stage-y', this.offY + 'px');
      s.setProperty('--vunit', (this.cssW / VIRTUAL_W).toFixed(5));
    }

    this._gradCache.clear();
  }

  /** Window CSS px → virtual units. */
  toVirtual(clientX, clientY, out = { x: 0, y: 0 }) {
    const k = this.view.w / (this.cssW || 1);
    out.x = (clientX - this.offX) * k;
    out.y = (clientY - this.offY) * k;
    return out;
  }

  /* ---------------------------------------------------------- frame */

  begin(clearColor = '#05060f') {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = clearColor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    if (this.camZoom !== 1 || this.camRot !== 0) {
      const cx = this.view.w / 2, cy = this.view.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate(this.camRot);
      ctx.scale(this.camZoom, this.camZoom);
      ctx.translate(-cx, -cy);
    }
    if (this.camX || this.camY) ctx.translate(this.camX, this.camY);
  }

  end() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------------------------------------------------------- helpers */

  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }

  circle(x, y, r, fill) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.01, r), 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    return c;
  }

  ring(x, y, r, width, stroke) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.01, r), 0, TAU);
    c.lineWidth = width;
    c.strokeStyle = stroke;
    c.stroke();
  }

  arc(x, y, r, from, to, width, stroke, cap = 'round') {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.01, r), from, to);
    c.lineWidth = width;
    c.lineCap = cap;
    c.strokeStyle = stroke;
    c.stroke();
    c.lineCap = 'butt';
  }

  rect(x, y, w, h, fill) {
    const c = this.ctx;
    c.fillStyle = fill;
    c.fillRect(x, y, w, h);
  }

  roundRect(x, y, w, h, r, fill, stroke, lw = 1) {
    const c = this.ctx;
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, rr);
    else {
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    }
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
  }

  line(x1, y1, x2, y2, width, stroke, cap = 'round') {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.lineWidth = width;
    c.lineCap = cap;
    c.strokeStyle = stroke;
    c.stroke();
    c.lineCap = 'butt';
  }

  /** Regular n-gon / star. `inner` < 1 makes it a star. */
  poly(x, y, r, sides, rot = 0, fill, inner = 1) {
    const c = this.ctx;
    c.beginPath();
    const steps = inner < 1 ? sides * 2 : sides;
    for (let i = 0; i < steps; i++) {
      const rr = inner < 1 && i % 2 ? r * inner : r;
      const a = rot + (i / steps) * TAU - Math.PI / 2;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    return c;
  }

  /**
   * Radial glow. Cached per (color, radius-bucket) because building gradients
   * every frame for every particle is the single easiest way to tank the fps.
   */
  glow(x, y, r, color, alpha = 1) {
    if (r <= 0 || alpha <= 0) return;
    const c = this.ctx;
    const key = color + '|' + (Math.round(r / 8) * 8);
    let g = this._gradCache.get(key);
    if (!g) {
      const rr = Math.max(1, Math.round(r / 8) * 8);
      g = c.createRadialGradient(0, 0, 0, 0, 0, rr);
      g.addColorStop(0, color);
      g.addColorStop(0.4, hexA(color, 0.42));
      g.addColorStop(1, hexA(color, 0));
      this._gradCache.set(key, { grad: g, r: rr });
      g = this._gradCache.get(key);
    }
    c.save();
    c.globalAlpha *= alpha;
    c.globalCompositeOperation = 'lighter';
    c.translate(x, y);
    c.scale(r / g.r, r / g.r);
    c.fillStyle = g.grad;
    c.fillRect(-g.r, -g.r, g.r * 2, g.r * 2);
    c.restore();
  }

  /** Vertical linear gradient, cached by color pair + height bucket. */
  vGrad(x, y0, y1, c0, c1) {
    const key = `v${c0}|${c1}|${Math.round(y0)}|${Math.round(y1)}`;
    let g = this._gradCache.get(key);
    if (!g) {
      g = this.ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      this._gradCache.set(key, g);
    }
    return g;
  }

  text(str, x, y, {
    size = 24, weight = 700, color = '#fff', align = 'center', baseline = 'middle',
    font = 'Inter, system-ui, sans-serif', alpha = 1, letterSpacing = 0,
    stroke = null, strokeWidth = 4, shadow = null, shadowBlur = 12,
  } = {}) {
    const c = this.ctx;
    c.save();
    c.globalAlpha *= alpha;
    c.font = `${weight} ${size}px ${font}`;
    c.textAlign = align;
    c.textBaseline = baseline;
    if (letterSpacing && 'letterSpacing' in c) c.letterSpacing = `${letterSpacing}px`;
    if (shadow) { c.shadowColor = shadow; c.shadowBlur = shadowBlur; }
    if (stroke) { c.lineWidth = strokeWidth; c.strokeStyle = stroke; c.lineJoin = 'round'; c.strokeText(str, x, y); }
    c.fillStyle = color;
    c.fillText(str, x, y);
    c.restore();
  }

  measure(str, size = 24, weight = 700, font = 'Inter, system-ui, sans-serif') {
    const c = this.ctx;
    c.font = `${weight} ${size}px ${font}`;
    return c.measureText(str).width;
  }

  /** Additive blend scope. */
  additive(fn) {
    const c = this.ctx;
    const prev = c.globalCompositeOperation;
    c.globalCompositeOperation = 'lighter';
    fn(c);
    c.globalCompositeOperation = prev;
  }
}

/* ------------------------------------------------------------------
   Colour helpers — small, allocation-light, used everywhere.
   ------------------------------------------------------------------ */

const _hexCache = new Map();

/** '#22d3ee' + alpha → 'rgba(34,211,238,0.5)'. Accepts rgb()/rgba() passthrough. */
export function hexA(hex, a) {
  if (typeof hex !== 'string') return `rgba(255,255,255,${a})`;
  if (hex[0] !== '#') {
    // Already a functional colour — rewrite the alpha if we can.
    const m = hex.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(',').map((s) => s.trim());
      return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
    }
    return hex;
  }
  let rgb = _hexCache.get(hex);
  if (!rgb) {
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _hexCache.set(hex, rgb);
  }
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

export function hexRGB(hex) {
  if (hex[0] !== '#') return [255, 255, 255];
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Blend two hex colours. t=0 → a, t=1 → b.
 * Memoised on a quantised t: the faceted-crystal drawer calls this six times
 * per enemy per frame, and the visible difference between t=0.31 and t=0.32
 * is nil.
 */
const _mixCache = new Map();
export function mixHex(a, b, t) {
  const q = Math.round(t * 32);
  const key = a + b + q;
  let out = _mixCache.get(key);
  if (out) return out;
  const A = hexRGB(a), B = hexRGB(b);
  const k = q / 32;
  const r = Math.round(A[0] + (B[0] - A[0]) * k);
  const g = Math.round(A[1] + (B[1] - A[1]) * k);
  const bl = Math.round(A[2] + (B[2] - A[2]) * k);
  out = `rgb(${r},${g},${bl})`;
  if (_mixCache.size > 4096) _mixCache.clear();
  _mixCache.set(key, out);
  return out;
}

/** HSL string helper for rainbow / prism effects. */
export const hsl = (h, s = 80, l = 60, a = 1) =>
  a >= 1 ? `hsl(${h % 360} ${s}% ${l}%)` : `hsl(${h % 360} ${s}% ${l}% / ${a})`;
