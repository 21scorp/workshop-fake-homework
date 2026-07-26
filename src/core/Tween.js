/**
 * Tween.js — tiny tween + timeline system for gameplay values.
 *
 * DOM/UI animation stays in CSS. This is for canvas-side values: a boss telegraph
 * ramp, the gacha beam widening, a card sliding in. Everything is dt-driven so it
 * survives pausing and slow-motion for free.
 */

import { Ease, clamp01 } from './Math2.js';

export class Tween {
  constructor(target, props, duration, opts = {}) {
    this.target = target;
    this.props = props;
    this.duration = Math.max(1e-6, duration);
    this.ease = typeof opts.ease === 'function' ? opts.ease : (Ease[opts.ease] ?? Ease.outCubic);
    this.delay = opts.delay ?? 0;
    this.onUpdate = opts.onUpdate ?? null;
    this.onComplete = opts.onComplete ?? null;
    this.loop = opts.loop ?? 0;          // -1 = forever
    this.yoyo = opts.yoyo ?? false;
    this.ignoreTimeScale = opts.ignoreTimeScale ?? false;

    this.elapsed = 0;
    this.done = false;
    this._from = null;
    this._dir = 1;
    this._loops = 0;
  }

  _capture() {
    this._from = {};
    for (const k in this.props) this._from[k] = this.target[k] ?? 0;
  }

  update(dt) {
    if (this.done) return true;
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return false;
      dt = -this.delay;
      this.delay = 0;
    }
    if (!this._from) this._capture();

    this.elapsed += dt;
    let t = clamp01(this.elapsed / this.duration);
    const e = this.ease(this._dir === 1 ? t : 1 - t);

    for (const k in this.props) {
      this.target[k] = this._from[k] + (this.props[k] - this._from[k]) * e;
    }
    this.onUpdate?.(e, this.target);

    if (t >= 1) {
      if (this.yoyo && this._dir === 1) {
        this._dir = -1;
        this.elapsed = 0;
        return false;
      }
      if (this.loop === -1 || this._loops < this.loop) {
        this._loops++;
        this._dir = 1;
        this.elapsed = 0;
        return false;
      }
      this.done = true;
      this.onComplete?.(this.target);
      return true;
    }
    return false;
  }

  kill() { this.done = true; }
}

/**
 * A timeline: sequential steps, each either a tween, a wait, or a callback.
 * The gacha reveal is one long timeline; so is the boss intro.
 */
export class Timeline {
  constructor() {
    /** @type {Array<{kind:string, [k:string]:any}>} */
    this.steps = [];
    this.i = 0;
    this.done = false;
    this._wait = 0;
    this._parallel = null;
    this.timeScale = 1;
  }

  to(target, props, duration, opts) {
    this.steps.push({ kind: 'tween', tween: new Tween(target, props, duration, opts) });
    return this;
  }

  wait(seconds) {
    this.steps.push({ kind: 'wait', seconds });
    return this;
  }

  call(fn) {
    this.steps.push({ kind: 'call', fn });
    return this;
  }

  /** Run several tweens/timelines at once; advance when all finish. */
  all(...items) {
    this.steps.push({ kind: 'all', items });
    return this;
  }

  /** Repeat everything queued so far, forever. */
  repeat() {
    this.steps.push({ kind: 'repeat' });
    return this;
  }

  update(dt) {
    if (this.done) return true;
    dt *= this.timeScale;
    let guard = 0;
    while (dt > 0 && !this.done && guard++ < 64) {
      const step = this.steps[this.i];
      if (!step) { this.done = true; break; }

      switch (step.kind) {
        case 'wait': {
          this._wait += dt;
          if (this._wait >= step.seconds) {
            dt = this._wait - step.seconds;
            this._wait = 0;
            this.i++;
          } else return false;
          break;
        }
        case 'call': {
          step.fn();
          this.i++;
          break;
        }
        case 'tween': {
          const fin = step.tween.update(dt);
          if (fin) { this.i++; dt = 0; } else return false;
          break;
        }
        case 'all': {
          let allDone = true;
          for (const it of step.items) {
            if (!it.done) allDone = it.update(dt) && allDone;
          }
          if (allDone) { this.i++; dt = 0; } else return false;
          break;
        }
        case 'repeat': {
          this.i = 0;
          for (const s of this.steps) if (s.kind === 'tween') { s.tween.elapsed = 0; s.tween.done = false; s.tween._from = null; }
          dt = 0;
          break;
        }
        default: this.i++;
      }
    }
    return this.done;
  }

  kill() { this.done = true; }
  get progress() { return this.steps.length ? this.i / this.steps.length : 1; }
}

/** Owns and ticks a bag of tweens/timelines. One per scene. */
export class Tweens {
  constructor() { this.list = []; }

  add(t) { this.list.push(t); return t; }

  to(target, props, duration, opts) {
    return this.add(new Tween(target, props, duration, opts));
  }

  timeline() { return this.add(new Timeline()); }

  /** Fire a callback after `seconds` of scene time. */
  after(seconds, fn) {
    return this.add(new Timeline().wait(seconds).call(fn));
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].update(dt)) this.list.splice(i, 1);
    }
  }

  killAll() { this.list.length = 0; }
  get count() { return this.list.length; }
}
