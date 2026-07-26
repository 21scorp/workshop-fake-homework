/**
 * Input.js — pointer input for a one-thumb game.
 *
 * The design rule: the player's thumb must never cover the thing it controls.
 * So dragging is *relative* — grab anywhere, the Vessel moves by the delta you
 * drag, amplified. That also means you can re-grip mid-run without teleporting.
 */

import { bus, EV } from './Events.js';

export class Input {
  /** @param {HTMLElement} el @param {import('./Renderer.js').Renderer} renderer */
  constructor(el, renderer) {
    this.el = el;
    this.r = renderer;

    /** Current pointer position in virtual units. */
    this.x = 0;
    this.y = 0;
    /** Position when the drag started. */
    this.startX = 0;
    this.startY = 0;
    /** Movement since the last frame, virtual units. */
    this.dx = 0;
    this.dy = 0;
    /** Movement since drag start. */
    this.totalX = 0;
    this.totalY = 0;

    this.down = false;
    this.justDown = false;
    this.justUp = false;
    this.holdTime = 0;
    /** Set on release when the gesture was short and small — a tap. */
    this.tapped = false;
    this.tapX = 0;
    this.tapY = 0;
    /** Flick direction on release, or null. */
    this.swipe = null;

    this.pointerId = null;
    this.enabled = true;

    this._accX = 0;
    this._accY = 0;
    this._pt = { x: 0, y: 0 };
    this._vel = { x: 0, y: 0 };
    this._history = [];

    this._bind();
  }

  _bind() {
    const opts = { passive: false };
    this.el.addEventListener('pointerdown', this._onDown = (e) => this._down(e), opts);
    window.addEventListener('pointermove', this._onMove = (e) => this._move(e), opts);
    window.addEventListener('pointerup', this._onUp = (e) => this._up(e), opts);
    window.addEventListener('pointercancel', this._onUp, opts);
    // Kill iOS rubber-band + double-tap zoom on the play surface.
    this.el.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, opts);
    this.el.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
    window.addEventListener('contextmenu', (e) => {
      if (e.target === this.el) e.preventDefault();
    });

    // Keyboard: desktop playtesting + accessibility.
    this.keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this._release(); });
  }

  _down(e) {
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.el.setPointerCapture?.(e.pointerId);
    const p = this.r.toVirtual(e.clientX, e.clientY, this._pt);
    this.x = this.startX = p.x;
    this.y = this.startY = p.y;
    this.down = true;
    this.justDown = true;
    this.holdTime = 0;
    this.totalX = this.totalY = 0;
    this._accX = this._accY = 0;
    this._history.length = 0;
  }

  _move(e) {
    if (!this.down || e.pointerId !== this.pointerId) return;
    const p = this.r.toVirtual(e.clientX, e.clientY, this._pt);
    this._accX += p.x - this.x;
    this._accY += p.y - this.y;
    this.x = p.x;
    this.y = p.y;
    this.totalX = this.x - this.startX;
    this.totalY = this.y - this.startY;
    this._history.push({ x: p.x, y: p.y, t: performance.now() });
    if (this._history.length > 8) this._history.shift();
    e.preventDefault?.();
  }

  _up(e) {
    if (e.pointerId !== this.pointerId) return;
    this._release();
  }

  _release() {
    if (!this.down) { this.pointerId = null; return; }
    const travel = Math.hypot(this.totalX, this.totalY);
    this.tapped = this.holdTime < 0.28 && travel < 26;
    this.tapX = this.x;
    this.tapY = this.y;
    this.swipe = this._detectSwipe();
    this.down = false;
    this.justUp = true;
    this.pointerId = null;
  }

  _detectSwipe() {
    if (this._history.length < 2) return null;
    const a = this._history[0];
    const b = this._history[this._history.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return null;
    const vx = (b.x - a.x) / dt;
    const vy = (b.y - a.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed < 900) return null;
    const dir = Math.abs(vx) > Math.abs(vy)
      ? (vx > 0 ? 'right' : 'left')
      : (vy > 0 ? 'down' : 'up');
    return { dir, vx, vy, speed };
  }

  /** Called once per frame, before systems read state. */
  update(dt) {
    this.dx = this._accX;
    this.dy = this._accY;
    this._accX = this._accY = 0;
    if (this.down) this.holdTime += dt;

    // Keyboard translates into the same delta channel as dragging.
    const k = this.keys;
    if (k.size) {
      const sp = 900 * dt;
      let kx = 0, ky = 0;
      if (k.has('ArrowLeft') || k.has('KeyA')) kx -= 1;
      if (k.has('ArrowRight') || k.has('KeyD')) kx += 1;
      if (k.has('ArrowUp') || k.has('KeyW')) ky -= 1;
      if (k.has('ArrowDown') || k.has('KeyS')) ky += 1;
      if (kx || ky) {
        const n = Math.hypot(kx, ky) || 1;
        this.dx += (kx / n) * sp;
        this.dy += (ky / n) * sp;
      }
    }
  }

  /** Called at the very end of the frame. */
  lateUpdate() {
    this.justDown = false;
    this.justUp = false;
    this.tapped = false;
    this.swipe = null;
  }

  keyDown(code) { return this.keys.has(code); }

  /** Hard reset — used when a scene changes under the player's thumb. */
  reset() {
    this.down = false;
    this.pointerId = null;
    this.dx = this.dy = this._accX = this._accY = 0;
    this.justDown = this.justUp = this.tapped = false;
    this.swipe = null;
    this._history.length = 0;
  }
}

/* ------------------------------------------------------------------
   Haptics — cheap, and it makes touch UI feel physical.
   ------------------------------------------------------------------ */

let hapticsEnabled = true;
export function setHaptics(on) { hapticsEnabled = !!on; }

const PATTERNS = {
  tick: 8,
  light: 12,
  medium: 22,
  heavy: 42,
  double: [18, 40, 18],
  success: [14, 50, 26],
  fail: [40, 60, 40, 60, 70],
  legendary: [12, 30, 12, 30, 12, 30, 90],
};

export function haptic(kind = 'light') {
  if (!hapticsEnabled) return;
  const p = PATTERNS[kind] ?? PATTERNS.light;
  try { navigator.vibrate?.(p); } catch { /* unsupported, fine */ }
}

bus.on(EV.HAPTIC, (kind) => haptic(kind));
