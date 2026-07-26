/**
 * Audio.js — fully procedural sound. No audio files, ever.
 *
 * Every SFX is synthesised on demand from oscillators and noise buffers, and the
 * music is a live generative sequencer that reacts to what's happening on screen
 * (intensity ramps with the wave, drops out on death, builds during a gacha pull).
 *
 * Why bother instead of shipping .mp3s?
 *   • zero bytes of audio to download — the whole game stays instant to load
 *   • pitch/timbre can be modulated per event (combo pitch-stacking is free)
 *   • the music can genuinely follow gameplay instead of looping obliviously
 *
 * When real audio assets land, `Sfx.play()` stays the public API — swap the
 * implementation behind it, exactly like the sprite registry.
 */

import { bus, EV } from './Events.js';
import { clamp } from './Math2.js';
import { save } from './Save.js';

/* ============================================================
   CONTEXT + BUSES
   ============================================================ */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuf = null;
    this.muted = false;
    this._unlockBound = false;
    this._voiceCount = 0;
    this._lastPlay = new Map();
  }

  /** Browsers require a gesture. We attach once and tear down after success. */
  bindUnlock() {
    if (this._unlockBound) return;
    this._unlockBound = true;
    const unlock = () => {
      this.init();
      if (this.ctx?.state === 'suspended') this.ctx.resume();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.visibilityState === 'hidden') this.ctx.suspend?.();
      else this.ctx.resume?.();
    });
  }

  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.warn('[audio] WebAudio unavailable'); return null; }

    this.ctx = new AC({ latencyHint: 'interactive' });

    // master → compressor → destination. The compressor is what stops 30
    // simultaneous impact sounds from clipping into mush.
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.18;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();

    // A short reverb-ish send makes everything sound like it's in a big space.
    this.verb = this.ctx.createConvolver();
    this.verb.buffer = makeImpulse(this.ctx, 1.9, 3.2);
    this.verbGain = this.ctx.createGain();
    this.verbGain.gain.value = 0.22;

    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.verbGain);
    this.musicBus.connect(this.verbGain);
    this.verbGain.connect(this.verb);
    this.verb.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    this.noiseBuf = makeNoise(this.ctx, 2.0);
    this.ready = true;
    this.applySettings();
    return this.ctx;
  }

  applySettings() {
    if (!this.ready) return;
    const s = save.profile.settings;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.muted ? 0 : s.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.muted ? 0 : s.music, t, 0.15);
  }

  setMuted(m) { this.muted = m; this.applySettings(); }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Throttle identical sounds fired in the same frame burst. */
  gate(key, minGap = 0.028) {
    const t = this.now;
    const last = this._lastPlay.get(key) ?? -1;
    if (t - last < minGap) return false;
    this._lastPlay.set(key, t);
    return true;
  }
}

export const engine = new AudioEngine();

/* ------------------------------------------------------------------ buffers */

function makeNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Cheap synthetic impulse response: exponentially-decaying stereo noise. */
function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/* ------------------------------------------------------------------ voices */

function env(ctx, node, t, { a = 0.005, d = 0.1, s = 0, r = 0.1, peak = 1, sustainTime = 0 }) {
  const g = node.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  if (s > 0) {
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak * s), t + a + d);
    g.setValueAtTime(Math.max(0.0002, peak * s), t + a + d + sustainTime);
    g.exponentialRampToValueAtTime(0.0001, t + a + d + sustainTime + r);
    return a + d + sustainTime + r;
  }
  g.exponentialRampToValueAtTime(0.0001, t + a + d);
  return a + d;
}

function osc(ctx, type, freq, t) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  return o;
}

function noiseSrc(ctx, t, rate = 1) {
  const s = ctx.createBufferSource();
  s.buffer = engine.noiseBuf;
  s.playbackRate.value = rate;
  s.loop = true;
  return s;
}

/* ============================================================
   SFX LIBRARY
   ============================================================ */

const LIB = {

  /* ---- weapons ---- */

  shoot(ctx, out, t, o = {}) {
    const pitch = o.pitch ?? 1;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4200 * pitch, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.09);
    f.Q.value = 6;

    const s = osc(ctx, 'sawtooth', 780 * pitch, t);
    s.frequency.exponentialRampToValueAtTime(210 * pitch, t + 0.085);
    const dur = env(ctx, g, t, { a: 0.002, d: 0.085, peak: 0.16 });

    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  },

  laser(ctx, out, t, o = {}) {
    const p = o.pitch ?? 1;
    const g = ctx.createGain();
    const s = osc(ctx, 'square', 1400 * p, t);
    s.frequency.exponentialRampToValueAtTime(340 * p, t + 0.14);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800 * p; f.Q.value = 3;
    const dur = env(ctx, g, t, { a: 0.003, d: 0.14, peak: 0.13 });
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  },

  /* ---- impacts ---- */

  hit(ctx, out, t, o = {}) {
    const p = o.pitch ?? 1;
    const g = ctx.createGain();
    const n = noiseSrc(ctx, t, 1.6);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2600 * p, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.06);
    f.Q.value = 1.4;
    const dur = env(ctx, g, t, { a: 0.001, d: 0.07, peak: 0.13 });
    n.connect(f); f.connect(g); g.connect(out);
    n.start(t); n.stop(t + dur + 0.02);
  },

  explode(ctx, out, t, o = {}) {
    const size = o.size ?? 1;
    const g = ctx.createGain();
    const n = noiseSrc(ctx, t, 0.8);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.42 * size);
    const dur = env(ctx, g, t, { a: 0.004, d: 0.42 * size, peak: 0.3 * size });

    const sub = osc(ctx, 'sine', 140 * (1 / size), t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 0.32 * size);
    const sg = ctx.createGain();
    env(ctx, sg, t, { a: 0.003, d: 0.34 * size, peak: 0.34 * size });

    n.connect(f); f.connect(g); g.connect(out);
    sub.connect(sg); sg.connect(out);
    n.start(t); n.stop(t + dur + 0.05);
    sub.start(t); sub.stop(t + dur + 0.05);
  },

  /* ---- pickups / progression ---- */

  pickup(ctx, out, t, o = {}) {
    // Pitch climbs with the combo — the sound of a streak is a rising scale.
    const step = clamp(o.step ?? 0, 0, 24);
    const base = 620 * Math.pow(2, step / 12);
    const g = ctx.createGain();
    const s = osc(ctx, 'triangle', base, t);
    s.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.06);
    const dur = env(ctx, g, t, { a: 0.002, d: 0.09, peak: 0.09 });
    s.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  },

  coin(ctx, out, t) {
    const g = ctx.createGain();
    const s = osc(ctx, 'square', 988, t);
    s.frequency.setValueAtTime(988, t);
    s.frequency.setValueAtTime(1319, t + 0.055);
    const dur = env(ctx, g, t, { a: 0.002, d: 0.16, peak: 0.09 });
    s.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  },

  levelup(ctx, out, t) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const tt = t + i * 0.062;
      const g = ctx.createGain();
      const s = osc(ctx, 'triangle', f, tt);
      const s2 = osc(ctx, 'sine', f * 2, tt);
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      const dur = env(ctx, g, tt, { a: 0.004, d: 0.34, peak: 0.14 });
      s.connect(g); s2.connect(g2); g2.connect(g); g.connect(out);
      s.start(tt); s.stop(tt + dur + 0.05);
      s2.start(tt); s2.stop(tt + dur + 0.05);
    });
  },

  /* ---- player state ---- */

  hurt(ctx, out, t) {
    const g = ctx.createGain();
    const s = osc(ctx, 'sawtooth', 220, t);
    s.frequency.exponentialRampToValueAtTime(64, t + 0.26);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1100;
    const dur = env(ctx, g, t, { a: 0.002, d: 0.3, peak: 0.26 });
    const n = noiseSrc(ctx, t, 0.6);
    const ng = ctx.createGain();
    env(ctx, ng, t, { a: 0.001, d: 0.11, peak: 0.14 });
    s.connect(f); f.connect(g); g.connect(out);
    n.connect(ng); ng.connect(out);
    s.start(t); s.stop(t + dur + 0.05);
    n.start(t); n.stop(t + 0.14);
  },

  death(ctx, out, t) {
    const g = ctx.createGain();
    const s = osc(ctx, 'sawtooth', 420, t);
    s.frequency.exponentialRampToValueAtTime(30, t + 1.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    const dur = env(ctx, g, t, { a: 0.01, d: 1.5, peak: 0.3 });
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.1);
  },

  ultimate(ctx, out, t) {
    // Riser + slam. This is the frame people screenshot, so it needs weight.
    const rise = 0.55;
    const n = noiseSrc(ctx, t, 1);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.Q.value = 2.5;
    nf.frequency.setValueAtTime(300, t);
    nf.frequency.exponentialRampToValueAtTime(7000, t + rise);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.22, t + rise);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + rise + 0.35);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    n.start(t); n.stop(t + rise + 0.4);

    const slam = t + rise;
    const sub = osc(ctx, 'sine', 120, slam);
    sub.frequency.exponentialRampToValueAtTime(28, slam + 0.7);
    const sg = ctx.createGain();
    env(ctx, sg, slam, { a: 0.004, d: 0.8, peak: 0.45 });
    sub.connect(sg); sg.connect(out);
    sub.start(slam); sub.stop(slam + 0.9);

    [261.6, 392, 523.25].forEach((f, i) => {
      const o2 = osc(ctx, 'sawtooth', f, slam);
      const g2 = ctx.createGain();
      env(ctx, g2, slam, { a: 0.006, d: 0.9, peak: 0.1 });
      const bf = ctx.createBiquadFilter();
      bf.type = 'lowpass';
      bf.frequency.setValueAtTime(4000, slam);
      bf.frequency.exponentialRampToValueAtTime(400, slam + 0.8);
      o2.connect(bf); bf.connect(g2); g2.connect(out);
      o2.start(slam + i * 0.01); o2.stop(slam + 1.0);
    });
  },

  /* ---- UI ---- */

  tap(ctx, out, t) {
    const g = ctx.createGain();
    const s = osc(ctx, 'sine', 1180, t);
    s.frequency.exponentialRampToValueAtTime(760, t + 0.05);
    const dur = env(ctx, g, t, { a: 0.001, d: 0.055, peak: 0.07 });
    s.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  },

  back(ctx, out, t) {
    const g = ctx.createGain();
    const s = osc(ctx, 'sine', 620, t);
    s.frequency.exponentialRampToValueAtTime(380, t + 0.08);
    const dur = env(ctx, g, t, { a: 0.001, d: 0.09, peak: 0.06 });
    s.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  },

  confirm(ctx, out, t) {
    [660, 880].forEach((f, i) => {
      const tt = t + i * 0.06;
      const g = ctx.createGain();
      const s = osc(ctx, 'triangle', f, tt);
      const dur = env(ctx, g, tt, { a: 0.002, d: 0.18, peak: 0.1 });
      s.connect(g); g.connect(out);
      s.start(tt); s.stop(tt + dur + 0.02);
    });
  },

  error(ctx, out, t) {
    const g = ctx.createGain();
    const s = osc(ctx, 'square', 180, t);
    s.frequency.setValueAtTime(150, t + 0.08);
    const dur = env(ctx, g, t, { a: 0.002, d: 0.2, peak: 0.08 });
    s.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  },

  /* ---- gacha: the money moment ---- */

  pullCharge(ctx, out, t, o = {}) {
    const dur = o.dur ?? 1.5;
    const n = noiseSrc(ctx, t, 1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(5200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.92);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    n.connect(f); f.connect(g); g.connect(out);
    n.start(t); n.stop(t + dur + 0.2);

    // Pitched drone underneath so the build has a tonal centre.
    const d = osc(ctx, 'sawtooth', 110, t);
    d.frequency.exponentialRampToValueAtTime(220, t + dur);
    const dg = ctx.createGain();
    dg.gain.setValueAtTime(0.0001, t);
    dg.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.9);
    dg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 900;
    d.connect(df); df.connect(dg); dg.connect(out);
    d.start(t); d.stop(t + dur + 0.2);
  },

  /** Rarity 0..4. Higher rarity = longer, brighter, more voices. */
  reveal(ctx, out, t, o = {}) {
    const r = clamp(o.rarity ?? 0, 0, 4);
    const chords = [
      [261.63, 329.63],                                  // C  — common
      [293.66, 369.99, 440.0],                           // D  — rare
      [329.63, 415.3, 493.88, 622.25],                   // E  — superior
      [349.23, 440.0, 523.25, 659.25, 783.99],           // F  — stellar
      [392.0, 493.88, 587.33, 739.99, 880.0, 1174.66],   // G  — ultra
    ][r];
    const peak = [0.08, 0.1, 0.13, 0.16, 0.2][r];
    const len = [0.5, 0.7, 1.1, 1.6, 2.4][r];

    chords.forEach((f, i) => {
      const tt = t + i * (r >= 3 ? 0.045 : 0.02);
      const g = ctx.createGain();
      const s = osc(ctx, r >= 3 ? 'sawtooth' : 'triangle', f, tt);
      const bf = ctx.createBiquadFilter();
      bf.type = 'lowpass';
      bf.frequency.setValueAtTime(400, tt);
      bf.frequency.exponentialRampToValueAtTime(6000, tt + 0.18);
      const dur = env(ctx, g, tt, { a: 0.008, d: 0.2, s: 0.5, r: len, peak, sustainTime: len * 0.3 });
      s.connect(bf); bf.connect(g); g.connect(out);
      s.start(tt); s.stop(tt + dur + 0.1);
    });

    if (r >= 3) {
      const n = noiseSrc(ctx, t, 1.4);
      const nf = ctx.createBiquadFilter();
      nf.type = 'highpass'; nf.frequency.value = 5000;
      const ng = ctx.createGain();
      env(ctx, ng, t, { a: 0.01, d: 1.4, peak: 0.07 });
      n.connect(nf); nf.connect(ng); ng.connect(out);
      n.start(t); n.stop(t + 1.6);
    }
  },

  whoosh(ctx, out, t, o = {}) {
    const dur = o.dur ?? 0.32;
    const n = noiseSrc(ctx, t, 1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.6;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3400, t + dur * 0.6);
    f.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    env(ctx, g, t, { a: 0.03, d: dur, peak: 0.1 });
    n.connect(f); f.connect(g); g.connect(out);
    n.start(t); n.stop(t + dur + 0.05);
  },

  warning(ctx, out, t) {
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.24;
      const g = ctx.createGain();
      const s = osc(ctx, 'square', 440, tt);
      const dur = env(ctx, g, tt, { a: 0.005, d: 0.18, peak: 0.09 });
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 4;
      s.connect(f); f.connect(g); g.connect(out);
      s.start(tt); s.stop(tt + dur + 0.02);
    }
  },

  bossRoar(ctx, out, t) {
    const g = ctx.createGain();
    const s = osc(ctx, 'sawtooth', 70, t);
    s.frequency.setValueAtTime(70, t);
    s.frequency.linearRampToValueAtTime(48, t + 1.1);
    const lfo = osc(ctx, 'sine', 7, t);
    const lg = ctx.createGain(); lg.gain.value = 14;
    lfo.connect(lg); lg.connect(s.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700;
    const dur = env(ctx, g, t, { a: 0.08, d: 0.3, s: 0.7, r: 0.8, peak: 0.36, sustainTime: 0.5 });
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.1);
    lfo.start(t); lfo.stop(t + dur + 0.1);
  },

  tick(ctx, out, t) {
    const g = ctx.createGain();
    const s = osc(ctx, 'square', 2000, t);
    const dur = env(ctx, g, t, { a: 0.001, d: 0.02, peak: 0.05 });
    s.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.01);
  },
};

/* ============================================================
   PUBLIC SFX API
   ============================================================ */

export const Sfx = {
  /**
   * @param {keyof typeof LIB} name
   * @param {object} [opts]  { pitch, size, rarity, step, dur, delay, gate }
   */
  play(name, opts = {}) {
    if (!engine.ready) engine.init();
    const ctx = engine.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const fn = LIB[name];
    if (!fn) { console.warn('[audio] unknown sfx', name); return; }
    if (opts.gate !== false && !engine.gate(name, opts.gate ?? 0.02)) return;
    try {
      fn(ctx, engine.sfxBus, ctx.currentTime + (opts.delay ?? 0), opts);
    } catch (err) {
      console.warn('[audio] sfx failed', name, err);
    }
  },
  get names() { return Object.keys(LIB); },
};

bus.on(EV.SFX, (p) => (typeof p === 'string' ? Sfx.play(p) : Sfx.play(p.name, p)));

/* ============================================================
   MUSIC — generative sequencer
   ============================================================ */

/** Minor-ish scales that always sound "space-y". Degrees in semitones. */
const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  pentaMinor: [0, 3, 5, 7, 10],
};

const TRACKS = {
  menu:  { bpm: 84,  root: 50, scale: 'dorian',     layers: { pad: 1, arp: 0.7, bass: 0.5, kick: 0,   hat: 0,   lead: 0 } },
  run:   { bpm: 132, root: 45, scale: 'aeolian',    layers: { pad: 0.6, arp: 0.9, bass: 1, kick: 1,   hat: 0.8, lead: 0 } },
  boss:  { bpm: 146, root: 43, scale: 'phrygian',   layers: { pad: 0.7, arp: 1, bass: 1, kick: 1,     hat: 1,   lead: 0.8 } },
  gacha: { bpm: 100, root: 53, scale: 'pentaMinor', layers: { pad: 1, arp: 0.8, bass: 0.6, kick: 0,   hat: 0,   lead: 0.3 } },
  result:{ bpm: 92,  root: 48, scale: 'dorian',     layers: { pad: 1, arp: 0.5, bass: 0.7, kick: 0.4, hat: 0.3, lead: 0 } },
};

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class MusicEngine {
  constructor() {
    this.track = null;
    this.trackName = null;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.intensity = 0.5;
    this._targetIntensity = 0.5;
    this.bar = 0;
    this.gain = null;
    this._chordIdx = 0;
    // i - VI - III - VII, the "epic minor" progression, in scale degrees.
    this.progression = [0, 5, 2, 6];
  }

  start(name = 'menu', { fade = 1.2 } = {}) {
    if (!engine.ready) engine.init();
    if (!engine.ctx) return;
    if (this.trackName === name && this.playing) return;

    const wasPlaying = this.playing;
    this.trackName = name;
    this.track = TRACKS[name] ?? TRACKS.menu;
    this.scale = SCALES[this.track.scale];
    this.step = 0;
    this.bar = 0;
    this._chordIdx = 0;

    if (!this.gain) {
      this.gain = engine.ctx.createGain();
      this.gain.gain.value = 0.0001;
      this.gain.connect(engine.musicBus);
    }
    const t = engine.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
    this.gain.gain.exponentialRampToValueAtTime(0.85, t + (wasPlaying ? 0.4 : fade));

    this.nextTime = t + 0.08;
    if (!this.playing) {
      this.playing = true;
      this.timer = setInterval(() => this._schedule(), 25);
    }
  }

  stop({ fade = 0.8 } = {}) {
    if (!this.playing || !engine.ctx) return;
    const t = engine.ctx.currentTime;
    this.gain?.gain.cancelScheduledValues(t);
    this.gain?.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
    this.gain?.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => {
      clearInterval(this.timer);
      this.timer = null;
      this.playing = false;
      this.trackName = null;
    }, fade * 1000 + 60);
  }

  /** 0..1 — drives layer gates and note density. */
  setIntensity(v) { this._targetIntensity = clamp(v, 0, 1); }

  /** Scheduler: look 120ms ahead, queue every 16th note in that window. */
  _schedule() {
    const ctx = engine.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / this.track.bpm;
    const stepDur = spb / 4;
    const horizon = ctx.currentTime + 0.12;

    while (this.nextTime < horizon) {
      this.intensity += (this._targetIntensity - this.intensity) * 0.06;
      this._playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step % 16 === 0) {
        this.bar++;
        if (this.bar % 2 === 0) this._chordIdx = (this._chordIdx + 1) % this.progression.length;
      }
    }
  }

  _note(degree, octave = 0) {
    const sc = this.scale;
    const i = ((degree % sc.length) + sc.length) % sc.length;
    const oct = Math.floor(degree / sc.length) + octave;
    return this.track.root + sc[i] + oct * 12;
  }

  _playStep(step, t, stepDur) {
    const L = this.track.layers;
    const s16 = step % 16;
    const I = this.intensity;
    const out = this.gain;
    const ctx = engine.ctx;
    const chordRoot = this.progression[this._chordIdx];

    // ---- kick: four-on-the-floor, plus a ghost on the "and" when intense
    if (L.kick > 0 && (s16 % 4 === 0 || (I > 0.6 && s16 === 14))) {
      kickVoice(ctx, out, t, L.kick * (s16 === 14 ? 0.5 : 1));
    }

    // ---- hats: 8ths, opening to 16ths at high intensity
    if (L.hat > 0 && (s16 % 2 === 0 || (I > 0.55 && s16 % 2 === 1))) {
      hatVoice(ctx, out, t, L.hat * (s16 % 4 === 2 ? 0.7 : 0.4) * (0.6 + I * 0.6));
    }

    // ---- bass: root of the current chord, with an octave lift
    if (L.bass > 0 && (s16 % 4 === 0 || s16 === 6 || (I > 0.7 && s16 === 11))) {
      const n = this._note(chordRoot, -1);
      bassVoice(ctx, out, t, midi(n), stepDur * 3.4, L.bass * (0.5 + I * 0.4));
    }

    // ---- arp: rides the chord tones
    if (L.arp > 0 && s16 % 2 === 0) {
      const pattern = [0, 2, 4, 2, 5, 4, 2, 0];
      const deg = chordRoot + pattern[(step / 2) % pattern.length];
      const n = this._note(deg, 1);
      arpVoice(ctx, out, t, midi(n), L.arp * (0.28 + I * 0.35));
    }

    // ---- pad: one long chord per two bars
    if (L.pad > 0 && s16 === 0 && this.bar % 2 === 0) {
      const notes = [chordRoot, chordRoot + 2, chordRoot + 4].map((d) => midi(this._note(d, 0)));
      padVoice(ctx, out, t, notes, stepDur * 32, L.pad * 0.5);
    }

    // ---- lead: only when things are genuinely dire
    if (L.lead > 0 && I > 0.72 && s16 % 8 === 4) {
      const deg = chordRoot + [4, 5, 7, 4][this.bar % 4];
      leadVoice(ctx, out, t, midi(this._note(deg, 2)), stepDur * 2, L.lead * 0.3);
    }
  }
}

function kickVoice(ctx, out, t, amp) {
  const g = ctx.createGain();
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.55 * amp, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + 0.32);
}

function hatVoice(ctx, out, t, amp) {
  const n = ctx.createBufferSource();
  n.buffer = engine.noiseBuf;
  n.playbackRate.value = 2.6;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 8200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.1 * amp, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(f); f.connect(g); g.connect(out);
  n.start(t); n.stop(t + 0.07);
}

function bassVoice(ctx, out, t, freq, dur, amp) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq, t);
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(freq / 2, t);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 8;
  f.frequency.setValueAtTime(280, t);
  f.frequency.exponentialRampToValueAtTime(120, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3 * amp, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const sg = ctx.createGain(); sg.gain.value = 0.5;
  o.connect(f); f.connect(g);
  sub.connect(sg); sg.connect(g);
  g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
  sub.start(t); sub.stop(t + dur + 0.05);
}

function arpVoice(ctx, out, t, freq, amp) {
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(freq, t);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 4;
  f.frequency.setValueAtTime(3600, t);
  f.frequency.exponentialRampToValueAtTime(900, t + 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14 * amp, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(f); f.connect(g); g.connect(out);
  o.start(t); o.stop(t + 0.24);
}

function padVoice(ctx, out, t, freqs, dur, amp) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16 * amp, t + dur * 0.28);
  g.gain.setValueAtTime(0.16 * amp, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = 0.6;
  f.connect(g); g.connect(out);
  for (const fr of freqs) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.detune.value = det;
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
}

function leadVoice(ctx, out, t, freq, dur, amp) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq, t);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 9;
  f.frequency.setValueAtTime(1200, t);
  f.frequency.exponentialRampToValueAtTime(4800, t + dur * 0.5);
  f.frequency.exponentialRampToValueAtTime(800, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2 * amp, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

export const Music = new MusicEngine();

bus.on(EV.MUSIC, (p) => {
  if (typeof p === 'string') Music.start(p);
  else if (p?.stop) Music.stop(p);
  else if (p?.intensity !== undefined) Music.setIntensity(p.intensity);
  else if (p?.track) Music.start(p.track, p);
});
