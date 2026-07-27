/**
 * AssetRegistry.js — the sprite abstraction layer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 *  Nothing in the game ever draws a shape directly. Entities ask for a
 *  *sprite key* — `'astra/ember/idle'`, `'enemy/drone/hurt'`, `'fx/nova'` —
 *  and the registry decides how that key becomes pixels:
 *
 *    1. If a texture atlas is loaded and contains the key → blit the frame.
 *    2. Otherwise → run the registered procedural vector drawer.
 *
 *  Both paths honour the same contract: same anchor, same nominal size, same
 *  animation timing, same tint. So the day real sprite sheets land, you drop
 *  a PNG + JSON into `assets/sprites/`, call `Assets.loadAtlas(...)`, and the
 *  game renders artwork instead of vectors. Zero gameplay code changes.
 *
 *  That is why every `define()` below carries `w`, `h`, `anchor`, `fps` and
 *  `frames` even though the procedural drawer doesn't strictly need them:
 *  those fields are the contract the future atlas must satisfy.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} SpriteDef
 * @property {number} w              nominal width in virtual units
 * @property {number} h              nominal height in virtual units
 * @property {{x:number,y:number}} anchor  0..1 pivot, default centre
 * @property {number} [frames]       frame count for animated keys
 * @property {number} [fps]          playback rate
 * @property {boolean} [loop]
 * @property {(ctx: CanvasRenderingContext2D, s: DrawState) => void} [draw]
 *           procedural fallback. Draws in LOCAL space: origin at the anchor,
 *           +y down, nominal size w×h. Never touches globalAlpha/transform
 *           outside its own save/restore.
 */

/**
 * @typedef {Object} DrawState
 * @property {number} t      seconds since this sprite instance started
 * @property {number} frame  current frame index
 * @property {number} w
 * @property {number} h
 * @property {string} tint   primary colour (rarity / element / team)
 * @property {string} tint2  secondary colour
 * @property {number} flash  0..1 white hit-flash
 * @property {number} charge 0..1 generic "powering up" value
 * @property {any} [data]    entity-specific extras
 */

const DEFAULT_ANCHOR = { x: 0.5, y: 0.5 };

class Registry {
  constructor() {
    /** @type {Map<string, SpriteDef>} */
    this.defs = new Map();
    /** @type {Map<string, AtlasFrame>} */
    this.frames = new Map();
    /** @type {Map<string, HTMLImageElement|ImageBitmap>} */
    this.images = new Map();
    /** Tinted-atlas scratch canvases, keyed by colour. */
    this._tintCache = new Map();
    /** Animation specs waiting for frames from a sheet not loaded yet. */
    this._pendingAnims = new Map();
    this.missing = new Set();
    /** Flip to false to force procedural rendering even with an atlas loaded. */
    this.useAtlas = true;
    this.stats = { atlasDraws: 0, proceduralDraws: 0, misses: 0 };
  }

  /* ------------------------------------------------------------ define */

  /**
   * Register a sprite key.
   * @param {string} key
   * @param {SpriteDef} def
   */
  define(key, def) {
    this.defs.set(key, {
      w: def.w ?? 32,
      h: def.h ?? 32,
      anchor: def.anchor ?? DEFAULT_ANCHOR,
      frames: def.frames ?? 1,
      fps: def.fps ?? 12,
      loop: def.loop !== false,
      draw: def.draw ?? null,
      ...def,
    });
    return this;
  }

  /** Bulk define: `{ 'a/b': def, 'a/c': def }`. */
  defineAll(map) {
    for (const k in map) this.define(k, map[k]);
    return this;
  }

  /** Register the same drawer under several keys (idle/hurt/dead share art). */
  alias(from, ...to) {
    const d = this.defs.get(from);
    if (!d) return this;
    for (const k of to) this.defs.set(k, d);
    return this;
  }

  has(key) { return this.defs.has(key) || this.frames.has(key); }

  meta(key) {
    return this.defs.get(key) ?? this.frames.get(key)?.def ?? null;
  }

  /* ------------------------------------------------------------ atlas */

  /**
   * Load a texture atlas.
   *
   * Expected JSON shape (a superset of the common TexturePacker "hash" format,
   * so most tools export straight into it):
   *
   * {
   *   "image": "core.png",
   *   "scale": 1,
   *   "frames": {
   *     "astra/ember/idle/0": { "frame": {"x":0,"y":0,"w":64,"h":64},
   *                             "pivot": {"x":0.5,"y":0.5} },
   *     "astra/ember/idle/1": { ... }
   *   },
   *   "animations": {
   *     "astra/ember/idle": { "frames": ["astra/ember/idle/0", "..."],
   *                           "fps": 12, "loop": true, "w": 64, "h": 64 }
   *   }
   * }
   *
   * Single-frame keys can live directly in `frames` with no animation entry.
   */
  async loadAtlas(jsonUrl) {
    const base = jsonUrl.slice(0, jsonUrl.lastIndexOf('/') + 1);
    let data;
    try {
      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      console.warn(`[assets] atlas "${jsonUrl}" not loaded — staying procedural.`, err.message);
      return false;
    }

    const imgUrl = base + (data.image || data.meta?.image);
    const img = await loadImage(imgUrl).catch((e) => {
      console.warn(`[assets] atlas image "${imgUrl}" failed`, e);
      return null;
    });
    if (!img) return false;
    this.images.set(imgUrl, img);

    const src = data.frames || {};
    const atlasScale = data.scale || data.meta?.scale || 1;
    // A sheet baked as a white master says so, and every frame on it then
    // takes the entity's runtime colour by multiply. Without this the atlas
    // path silently drops `tint` and the whole game renders white — which is
    // exactly what the first real bake did.
    const tintMode = data.tintMode || data.meta?.tintMode || null;

    // Individual frames.
    for (const key in src) {
      const f = src[key];
      const r = f.frame || f;
      this.frames.set(key, {
        img, sx: r.x, sy: r.y, sw: r.w, sh: r.h,
        anchor: f.pivot || f.anchor || DEFAULT_ANCHOR,
        scale: atlasScale,
        tintMode: f.tintMode ?? tintMode,
        def: { w: r.w / atlasScale, h: r.h / atlasScale, frames: 1, fps: 1, loop: false },
      });
    }

    // Animation keys: a key that resolves to an ordered list of frames.
    //
    // A long animation can outgrow a single page, so its frames may be spread
    // over several sheets. Resolving eagerly would give each sheet a partial
    // list and let the last one loaded win — a six-frame idle that plays two.
    // Specs are therefore parked and re-resolved after every atlas, and only
    // become a key once every frame they name actually exists.
    const anims = data.animations || {};
    for (const key in anims) {
      this._pendingAnims.set(key, { ...anims[key], tintMode: anims[key].tintMode ?? tintMode });
    }
    this._resolveAnims();

    console.info(`[assets] atlas loaded: ${Object.keys(src).length} frames, ` +
                 `${Object.keys(anims).length} animations from ${jsonUrl}`);
    return true;
  }

  _resolveAnims() {
    for (const [key, a] of this._pendingAnims) {
      const names = a.frames || [];
      if (!names.length) { this._pendingAnims.delete(key); continue; }
      const list = names.map((n) => this.frames.get(n));
      if (list.some((f) => !f)) continue;         // a later sheet still owes us frames
      const first = list[0];
      this.frames.set(key, {
        ...first,
        list,
        anchor: a.pivot || first.anchor,
        tintMode: a.tintMode ?? first.tintMode,
        def: {
          w: a.w ?? first.def.w, h: a.h ?? first.def.h,
          frames: list.length, fps: a.fps ?? 12, loop: a.loop !== false,
          anchor: a.pivot || first.anchor,
        },
      });
      this._pendingAnims.delete(key);
    }
  }

  /** Animations whose frames never arrived — a truncated or half-copied set. */
  unresolvedAnimations() { return [...this._pendingAnims.keys()]; }

  /* ------------------------------------------------------------ draw */

  /**
   * Draw a sprite key at (x, y) in virtual units.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key
   * @param {number} x
   * @param {number} y
   * @param {Object} [o]
   * @param {number} [o.rot]     radians
   * @param {number} [o.scale]   uniform scale
   * @param {number} [o.sx]      x scale (overrides scale)
   * @param {number} [o.sy]      y scale
   * @param {number} [o.alpha]
   * @param {number} [o.t]       animation time in seconds
   * @param {number} [o.frame]   explicit frame index (overrides t)
   * @param {string} [o.tint]
   * @param {string} [o.tint2]
   * @param {number} [o.flash]   0..1 white flash
   * @param {number} [o.charge]  0..1
   * @param {boolean} [o.flipX]
   * @param {string} [o.blend]   e.g. 'lighter'
   * @param {any} [o.data]
   */
  draw(ctx, key, x, y, o = {}) {
    const alpha = o.alpha ?? 1;
    if (alpha <= 0.001) return;

    const atlas = this.useAtlas ? this.frames.get(key) : null;
    const def = this.defs.get(key) || atlas?.def;

    if (!atlas && (!def || !def.draw)) {
      if (!this.missing.has(key)) {
        this.missing.add(key);
        this.stats.misses++;
        console.warn(`[assets] no sprite for "${key}" — drawing placeholder`);
      }
      drawPlaceholder(ctx, x, y, o);
      return;
    }

    const sx = o.sx ?? o.scale ?? 1;
    const sy = o.sy ?? o.scale ?? 1;
    const w = def.w, h = def.h;
    const anchor = def.anchor ?? DEFAULT_ANCHOR;

    ctx.save();
    if (o.blend) ctx.globalCompositeOperation = o.blend;
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (sx !== 1 || sy !== 1 || o.flipX) ctx.scale(o.flipX ? -sx : sx, sy);

    const frame = o.frame ?? frameAt(def, o.t ?? 0);

    if (atlas) {
      this.stats.atlasDraws++;
      const f = atlas.list ? atlas.list[Math.min(frame, atlas.list.length - 1)] : atlas;
      const dw = f.sw / (f.scale || 1);
      const dh = f.sh / (f.scale || 1);
      const dx = -dw * anchor.x;
      const dy = -dh * anchor.y;
      const mode = o.tintMode ?? f.tintMode ?? atlas.tintMode;
      if (o.tint && mode) {
        ctx.drawImage(this._tinted(f, o.tint, mode), dx, dy, dw, dh);
      } else {
        ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, dx, dy, dw, dh);
      }
      if (o.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= o.flash;
        ctx.drawImage(this._tinted(f, '#ffffff', 'flat'), dx, dy, dw, dh);
      }
    } else {
      this.stats.proceduralDraws++;
      // Procedural drawers work in local space with the anchor at the origin.
      ctx.translate(-w * (anchor.x - 0.5), -h * (anchor.y - 0.5));
      _state.t = o.t ?? 0;
      _state.frame = frame;
      _state.w = w; _state.h = h;
      _state.tint = o.tint ?? '#ffffff';
      _state.tint2 = o.tint2 ?? _state.tint;
      _state.flash = o.flash ?? 0;
      _state.charge = o.charge ?? 0;
      _state.data = o.data;
      def.draw(ctx, _state);
    }

    ctx.restore();
  }

  /**
   * A recoloured copy of an atlas frame, cached.
   *
   *   'flat'      → solid silhouette. Right for a hit flash, wrong for art:
   *                 it throws away every highlight the artist painted.
   *   'multiply'  → the frame's own luminance, pushed toward `color`. A white
   *                 master sheet recoloured this way keeps its shading, which
   *                 is the only way one baked frame can serve seven elements.
   *
   * Multiply composites over the whole rect, so the alpha has to be put back
   * with destination-in or the sprite arrives as an opaque square.
   */
  _tinted(frame, color, mode = 'flat') {
    const key = `${frame.sx},${frame.sy},${frame.sw},${frame.sh},${color},${mode}`;
    let cv = this._tintCache.get(key);
    if (cv) return cv;

    // Every distinct colour costs a canvas the size of the frame. Element
    // colours are a fixed set, but a gradient-driven tint is not — so cap it.
    if (this._tintCache.size > 512) this._tintCache.clear();

    cv = document.createElement('canvas');
    cv.width = frame.sw; cv.height = frame.sh;
    const c = cv.getContext('2d');
    c.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
    c.globalCompositeOperation = mode === 'multiply' ? 'multiply' : 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, frame.sw, frame.sh);
    if (mode === 'multiply') {
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
    }
    this._tintCache.set(key, cv);
    return cv;
  }

  /** Diagnostics for the debug overlay. */
  report() {
    return {
      defined: this.defs.size,
      atlasFrames: this.frames.size,
      missing: [...this.missing],
      unresolved: this.unresolvedAnimations(),
      mode: this.frames.size && this.useAtlas ? 'atlas+procedural' : 'procedural',
      ...this.stats,
    };
  }
}

/* Shared mutable draw-state — one object, reused every draw call. Procedural
   drawers must treat it as read-only and must not retain it. */
const _state = {
  t: 0, frame: 0, w: 0, h: 0,
  tint: '#fff', tint2: '#fff', flash: 0, charge: 0, data: null,
};

function frameAt(def, t) {
  if (!def.frames || def.frames <= 1) return 0;
  const i = Math.floor(t * (def.fps || 12));
  return def.loop ? ((i % def.frames) + def.frames) % def.frames
                  : Math.min(i, def.frames - 1);
}

function drawPlaceholder(ctx, x, y, o) {
  const s = 24 * (o.scale ?? 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(-s / 2, -s / 2, s / 2, s / 2);
  ctx.fillRect(0, 0, s / 2, s / 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, -s / 2, s / 2, s / 2);
  ctx.fillRect(-s / 2, 0, s / 2, s / 2);
  ctx.restore();
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}

/**
 * Lightweight animation playhead. Entities own one of these; it works
 * identically whether the key resolves to atlas frames or a vector drawer.
 */
export class SpriteState {
  constructor(key, { speed = 1, t = 0 } = {}) {
    this.key = key;
    this.t = t;
    this.speed = speed;
    this.done = false;
    this.onEnd = null;
  }

  play(key, { restart = true, speed = this.speed, onEnd = null } = {}) {
    if (key === this.key && !restart) return this;
    this.key = key;
    this.t = 0;
    this.speed = speed;
    this.done = false;
    this.onEnd = onEnd;
    return this;
  }

  update(dt) {
    if (this.done) return;
    this.t += dt * this.speed;
    const def = Assets.meta(this.key);
    if (def && def.frames > 1 && !def.loop) {
      const dur = def.frames / (def.fps || 12);
      if (this.t >= dur) {
        this.t = dur - 1e-4;
        this.done = true;
        this.onEnd?.();
      }
    }
  }

  draw(ctx, x, y, o = {}) {
    Assets.draw(ctx, this.key, x, y, { ...o, t: this.t });
  }
}

export const Assets = new Registry();
export default Assets;
