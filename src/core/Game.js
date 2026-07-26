/**
 * Game.js — the loop and the scene stack.
 *
 * Fixed-timestep simulation (120 Hz) with a rendering interpolation-free draw,
 * because at 120 Hz the visual error is under a pixel and the code stays simple.
 * Time scale is separate from real time, so slow-motion, hit-stop and pausing
 * all fall out of one number.
 */

import { bus, EV } from './Events.js';
import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { clamp } from './Math2.js';

const FIXED_DT = 1 / 120;
const MAX_STEPS = 8;          // never spiral: drop time rather than freeze
const MAX_FRAME_DT = 0.25;

export class Game {
  /**
   * @param {{canvas: HTMLCanvasElement, stage: HTMLElement, uiRoot: HTMLElement}} opts
   */
  constructor({ canvas, stage, uiRoot }) {
    this.renderer = new Renderer(canvas, stage);
    this.input = new Input(canvas, this.renderer);
    this.uiRoot = uiRoot;
    this.stage = stage;

    /** @type {Scene|null} */
    this.scene = null;
    /** @type {Scene|null} */
    this.pendingScene = null;
    /** Named scene factories. */
    this.scenes = new Map();

    this.running = false;
    this.paused = false;
    this.timeScale = 1;
    this.time = 0;        // scaled scene time
    this.realTime = 0;
    this.frame = 0;

    this._acc = 0;
    this._last = 0;
    this._hitstop = 0;
    this._slowmo = { t: 0, dur: 0, scale: 1 };
    this._raf = 0;

    // fps meter
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._perfSamples = [];
    this.autoQuality = true;

    this._bindGlobal();
  }

  _bindGlobal() {
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        this.renderer.resize();
        this.scene?.resize?.(this.renderer);
        bus.emit(EV.RESIZE, this.renderer.view);
      }, 80);
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.renderer.resize();
        this.scene?.resize?.(this.renderer);
        bus.emit(EV.RESIZE, this.renderer.view);
      }, 220);
    });
    document.addEventListener('visibilitychange', () => {
      const hidden = document.visibilityState === 'hidden';
      bus.emit(EV.VISIBILITY, !hidden);
      if (hidden) this.pause('visibility');
      else { this._last = performance.now(); this.resume('visibility'); }
    });

    bus.on(EV.HITSTOP, (s) => this.hitstop(typeof s === 'number' ? s : s?.seconds ?? 0.06));
  }

  /* ---------------------------------------------------------- scenes */

  register(name, factory) { this.scenes.set(name, factory); return this; }

  /**
   * Swap scenes. The switch happens at the top of the next frame so a scene
   * can call this from inside its own update without tearing.
   */
  go(name, params = {}) {
    const factory = this.scenes.get(name);
    if (!factory) { console.error(`[game] no scene "${name}"`); return; }
    this.pendingScene = { name, factory, params };
  }

  _applyPending() {
    if (!this.pendingScene) return;
    const { name, factory, params } = this.pendingScene;
    this.pendingScene = null;

    if (this.scene) {
      bus.emit(EV.SCENE_EXIT, this.scene.name);
      try { this.scene.exit?.(); } catch (e) { console.error('[game] scene exit threw', e); }
    }
    this.input.reset();
    this.uiRoot.replaceChildren();

    const scene = factory(this);
    scene.name = name;
    scene.game = this;
    this.scene = scene;
    this.time = 0;
    this.timeScale = 1;
    this._hitstop = 0;
    this._slowmo.t = 0;

    document.body.dataset.scene = name;
    try { scene.enter?.(params); } catch (e) { console.error('[game] scene enter threw', e); }
    bus.emit(EV.SCENE_ENTER, name);
  }

  /* ---------------------------------------------------------- time fx */

  /** Freeze simulation for a beat — the single best "that hurt" cue. */
  hitstop(seconds = 0.06) {
    this._hitstop = Math.max(this._hitstop, seconds);
  }

  /** Ramp time down and back. `scale` is the floor. */
  slowmo(scale = 0.25, duration = 0.5) {
    this._slowmo.scale = scale;
    this._slowmo.dur = duration;
    this._slowmo.t = duration;
  }

  pause(reason = 'user') {
    if (this.paused) return;
    this.paused = true;
    bus.emit(EV.PAUSE, reason);
  }

  resume(reason = 'user') {
    if (!this.paused) return;
    this.paused = false;
    this._last = performance.now();
    bus.emit(EV.RESUME, reason);
  }

  /* ---------------------------------------------------------- loop */

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      this._frame(now);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _frame(now) {
    const t0 = now;
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > MAX_FRAME_DT) dt = FIXED_DT;   // tab was backgrounded — skip, don't catch up
    this.realTime += dt;

    // fps meter
    this._fpsAcc += dt;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
      if (this.autoQuality) this._adaptQuality();
    }

    this._applyPending();
    if (!this.scene) return;

    // Effective time scale: hitstop wins, then slow-motion, then base.
    let scale = this.paused ? 0 : this.timeScale;
    if (this._hitstop > 0) {
      this._hitstop -= dt;
      scale = 0;
    } else if (this._slowmo.t > 0) {
      this._slowmo.t -= dt;
      const k = 1 - this._slowmo.t / this._slowmo.dur;   // 0 → 1 over the window
      const eased = this._slowmo.scale + (1 - this._slowmo.scale) * (k * k);
      scale *= clamp(eased, 0.02, 1);
    }

    // Input always runs on real time so menus stay responsive while paused.
    this.input.update(dt);

    const sdt = dt * scale;
    this._acc += sdt;
    let steps = 0;
    while (this._acc >= FIXED_DT && steps < MAX_STEPS) {
      this._acc -= FIXED_DT;
      this.time += FIXED_DT;
      try { this.scene.update?.(FIXED_DT, this); }
      catch (e) { console.error('[game] update threw', e); this._acc = 0; break; }
      steps++;
    }
    if (steps >= MAX_STEPS) this._acc = 0;

    // Some things want unscaled time even during hitstop (UI, screen fx).
    try { this.scene.realUpdate?.(dt, this); } catch (e) { console.error('[game] realUpdate threw', e); }

    try {
      this.renderer.begin(this.scene.clearColor ?? '#05060f');
      this.scene.draw?.(this.renderer, this);
      this.renderer.end();
    } catch (e) {
      console.error('[game] draw threw', e);
    }

    this.input.lateUpdate();
    this.frame++;

    const cost = performance.now() - t0;
    this._perfSamples.push(cost);
    if (this._perfSamples.length > 120) this._perfSamples.shift();
  }

  /** Drop visual load if the device can't hold 50fps. Never raises past 1. */
  _adaptQuality() {
    const r = this.renderer;
    if (this.fps < 44 && r.quality > 0.5) {
      r.quality = r.quality > 0.75 ? 0.75 : 0.5;
      r.resize();
      console.info(`[perf] quality → ${r.quality} (fps ${this.fps.toFixed(0)})`);
    } else if (this.fps > 58 && r.quality < 1 && this.realTime > 12) {
      r.quality = Math.min(1, r.quality + 0.25);
      r.resize();
    }
  }

  get avgFrameCost() {
    if (!this._perfSamples.length) return 0;
    return this._perfSamples.reduce((a, b) => a + b, 0) / this._perfSamples.length;
  }
}

/**
 * Scene base class. Everything is optional; override what you need.
 * @abstract
 */
export class Scene {
  constructor(game) {
    this.game = game;
    this.name = 'scene';
    this.clearColor = '#05060f';
  }
  /** @param {object} params */
  enter(params) {}
  exit() {}
  /** Fixed-step, time-scaled. Gameplay lives here. */
  update(dt, game) {}
  /** Variable-step real time. Screen FX and UI polish live here. */
  realUpdate(dt, game) {}
  /** @param {Renderer} r */
  draw(r, game) {}
  resize(r) {}

  /** Convenience: mount a DOM element into the UI overlay. */
  mount(el) { this.game.uiRoot.appendChild(el); return el; }
}
