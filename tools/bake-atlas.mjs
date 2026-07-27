/**
 * bake-atlas.mjs — turn the procedural vector art into a real texture atlas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  WHY
 * ─────────────────────────────────────────────────────────────────────────
 *  The whole renderer is built on a promise: entities ask for a sprite key,
 *  and the day real artwork lands you drop a PNG + JSON into assets/sprites/
 *  and nothing else changes. A promise nobody has ever executed is a guess.
 *
 *  This tool executes it. It boots the game headless, renders every
 *  registered key through its procedural drawer, packs the frames into an
 *  atlas, and writes exactly the JSON that AssetRegistry.loadAtlas expects.
 *  The result is a genuine sprite-backed build of the game — which means the
 *  swap path is tested, and an artist has a reference sheet with the exact
 *  frame sizes, frame counts, pivots and key names their art has to match.
 *
 *  It is a *dev tool*, not a build step. The shipped game stays procedural:
 *  vector art recolours per element, per rarity and per hull palette at
 *  runtime, and baked frames cannot. See assets/sprites/README.md.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  BLEED
 * ─────────────────────────────────────────────────────────────────────────
 *  Every drawer paints glow well outside its nominal box — that is what makes
 *  the art read as bioluminescent rather than flat. Baking into exactly w×h
 *  would slice the halo off and leave a visible rectangle. So each frame is
 *  baked into a box expanded around its anchor, and the atlas records the
 *  expanded size. The blit then covers the same pixels the procedural drawer
 *  covered, with the pivot still on the entity's real centre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  TRIM
 * ─────────────────────────────────────────────────────────────────────────
 *  Bleed makes every box 3.4× its nominal area, and most of that is empty
 *  glow falloff. So each frame is rendered on its own, cropped to its alpha
 *  bounding box, and only the crop is packed — with the pivot moved by the
 *  same amount. Same pixels on screen, a third of the download.
 *
 * Usage:
 *   node tools/bake-atlas.mjs                        # 2x, 2048px pages
 *   node tools/bake-atlas.mjs --scale 1 --page 1024
 *   node tools/bake-atlas.mjs --only pickup/,bullet/ --name pickups
 *   node tools/bake-atlas.mjs --out assets/sprites --name core --no-trim
 *
 * Env: AF_URL (default http://127.0.0.1:8080/index.html), AF_CHROME.
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/* ------------------------------------------------------------ args */

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OPT = {
  url: process.env.AF_URL ?? 'http://127.0.0.1:8080/index.html',
  scale: Number(arg('scale', 2)),
  page: Number(arg('page', 2048)),
  bleed: Number(arg('bleed', 1.85)),
  pad: Number(arg('pad', 2)),
  out: resolve(arg('out', 'assets/sprites')),
  name: arg('name', 'core'),
  tint: arg('tint', '#ffffff'),
  tint2: arg('tint2', '#cbd5e1'),
  only: (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean),
  trim: !argv.includes('--no-trim'),
  alphaFloor: Number(arg('alpha-floor', 3)),   // 0..255; below this counts as empty
};

function findChrome() {
  if (process.env.AF_CHROME) return process.env.AF_CHROME;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers',
                 join(process.env.HOME ?? '', '.cache/ms-playwright')].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith('chromium')) continue;
      for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
                         'chrome-win/chrome.exe', 'chrome-linux/headless_shell']) {
        const p = join(root, dir, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/* ------------------------------------------------------------ boot */

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 412, height: 892 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.goto(OPT.url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => globalThis.ASTRAFALL?.Assets?.defs?.size > 0, { timeout: 20000 });

console.log(`atlas bake — ${OPT.url}`);
console.log(`  scale ${OPT.scale}x · pages ${OPT.page}px · bleed ${OPT.bleed} · pad ${OPT.pad}px`);

/* ------------------------------------------------------------ bake */

const pages = await page.evaluate(async (O) => {
  const A = globalThis.ASTRAFALL.Assets;

  /* ---- 1. render every frame on its own, then crop it to its ink ---- */
  const jobs = [];
  const skipped = [];
  for (const [key, def] of A.defs) {
    if (!def.draw) { skipped.push(key); continue; }   // atlas-only key, nothing to bake
    if (O.only.length && !O.only.some((p) => key.startsWith(p))) continue;
    const frames = Math.max(1, def.frames || 1);
    const anchor = def.anchor ?? { x: 0.5, y: 0.5 };
    // Expand around the anchor so the halo survives and the pivot stays put.
    const padL = def.w * anchor.x * (O.bleed - 1);
    const padT = def.h * anchor.y * (O.bleed - 1);
    const bw = def.w * O.bleed;
    const bh = def.h * O.bleed;
    const boxW = Math.ceil(bw * O.scale);
    const boxH = Math.ceil(bh * O.scale);
    const originX = (padL + def.w * anchor.x);       // anchor inside the padded box
    const originY = (padT + def.h * anchor.y);

    for (let f = 0; f < frames; f++) {
      const cv = document.createElement('canvas');
      cv.width = boxW; cv.height = boxH;
      const c = cv.getContext('2d');
      c.scale(O.scale, O.scale);
      A.draw(c, key, originX, originY, {
        frame: f, t: frames > 1 ? f / (def.fps || 12) : 0,
        tint: O.tint, tint2: O.tint2, charge: 0, flash: 0,
      });

      // Alpha bounding box. An all-transparent frame still needs one pixel,
      // otherwise the loader gets a zero-sized source rect.
      let x0 = 0, y0 = 0, x1 = boxW, y1 = boxH;
      if (O.trim) {
        const d = c.getImageData(0, 0, boxW, boxH).data;
        x0 = boxW; y0 = boxH; x1 = -1; y1 = -1;
        for (let y = 0; y < boxH; y++) {
          for (let x = 0; x < boxW; x++) {
            if (d[(y * boxW + x) * 4 + 3] > O.alphaFloor) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < x0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
        x1 += 1; y1 += 1;
      }
      const tw = x1 - x0, th = y1 - y0;

      jobs.push({
        key, frame: f, name: frames > 1 ? `${key}/${f}` : key,
        canvas: cv, cropX: x0, cropY: y0, w: tw, h: th,
        // Pivot as a fraction of the *trimmed* rect — this is what keeps the
        // sprite sitting exactly where the vector version sat.
        pivot: { x: (originX * O.scale - x0) / tw, y: (originY * O.scale - y0) / th },
        // Nominal size the loader should render the trimmed rect at.
        boxW: tw / O.scale, boxH: th / O.scale,
        animOf: frames > 1 ? key : null,
        fps: def.fps || 12, loop: def.loop !== false, frames,
      });
    }
  }

  /* ---- 2. shelf packer: tallest first, rows filled left to right ----
     Frames are placed one key at a time and a key never straddles two pages.
     The loader keys animations by name, so a split animation would have each
     page register a partial list and the last one loaded would win — you get
     a four-frame idle that plays two frames. Keeping a key whole makes that
     impossible by construction. */
  const sheets = [];
  const place = (j, sheet) => {
    for (const row of sheet.rows) {
      if (row.x + j.w + O.pad <= O.page && j.h <= row.h) {
        j.x = row.x; j.y = row.y; j.sheet = sheet.i;
        row.x += j.w + O.pad;
        return true;
      }
    }
    const top = sheet.rows.length ? sheet.rows[sheet.rows.length - 1] : null;
    const y = top ? top.y + top.h + O.pad : O.pad;
    if (y + j.h + O.pad > O.page) return false;
    sheet.rows.push({ x: O.pad + j.w + O.pad, y, h: j.h });
    j.x = O.pad; j.y = y; j.sheet = sheet.i;
    return true;
  };

  const byKey = new Map();
  for (const j of jobs) {
    if (j.w + O.pad * 2 > O.page || j.h + O.pad * 2 > O.page) {
      throw new Error(`frame "${j.name}" (${j.w}×${j.h}) does not fit a ${O.page}px page`);
    }
    (byKey.get(j.key) ?? byKey.set(j.key, []).get(j.key)).push(j);
  }
  const groups = [...byKey.values()];
  groups.forEach((g) => g.sort((a, b) => b.h - a.h || b.w - a.w));
  groups.sort((a, b) => b[0].h - a[0].h);

  for (const group of groups) {
    let placed = false;
    for (const s of sheets) {
      const snapshot = s.rows.map((r) => ({ ...r }));
      if (group.every((j) => place(j, s))) { placed = true; break; }
      s.rows = snapshot;                        // partial fit: roll the page back
    }
    if (!placed) {
      // A boss animation can outgrow a whole page on its own. The loader
      // stitches an animation back together across sheets, so spilling is
      // safe — it just costs an extra page.
      for (const j of group) {
        let s = sheets[sheets.length - 1];
        if (!s || !place(j, s)) {
          s = { i: sheets.length, rows: [] };
          sheets.push(s);
          place(j, s);
        }
      }
    }
  }
  jobs.sort((a, b) => a.name.localeCompare(b.name));

  /* ---- 3. blit the crops onto the pages, sized to what they actually use ---- */
  const out = [];
  for (const s of sheets) {
    const mine = jobs.filter((j) => j.sheet === s.i);
    // No point shipping 2048² when the last page is a quarter full.
    const need = Math.max(...mine.map((j) => Math.max(j.x + j.w, j.y + j.h))) + O.pad;
    const side = Math.min(O.page, Math.pow(2, Math.ceil(Math.log2(need))));
    const cv = document.createElement('canvas');
    cv.width = side; cv.height = side;
    const ctx = cv.getContext('2d');
    for (const j of mine) {
      ctx.drawImage(j.canvas, j.cropX, j.cropY, j.w, j.h, j.x, j.y, j.w, j.h);
      delete j.canvas;   // not serialisable, and not needed past this point
    }
    out.push({ i: s.i, side, png: cv.toDataURL('image/png'), frames: mine });
  }
  return { pages: out, total: jobs.length, defs: A.defs.size, skipped };
}, OPT);

await browser.close();

/* ------------------------------------------------------------ write */

mkdirSync(OPT.out, { recursive: true });
const written = [];

for (const p of pages.pages) {
  const suffix = pages.pages.length > 1 ? `-${p.i}` : '';
  const imageName = `${OPT.name}${suffix}.png`;
  const jsonName = `${OPT.name}${suffix}.json`;

  writeFileSync(join(OPT.out, imageName), Buffer.from(p.png.split(',')[1], 'base64'));

  const frames = {};
  const animations = {};
  for (const j of p.frames) {
    frames[j.name] = {
      frame: { x: j.x, y: j.y, w: j.w, h: j.h },
      pivot: j.pivot,
    };
    if (j.animOf) {
      // Always the *complete* frame list, even when this page only holds some
      // of them. The loader parks an animation until every name it lists
      // exists, so declaring the whole thing is what lets a split animation
      // reassemble instead of silently playing short.
      animations[j.animOf] ??= {
        frames: Array.from({ length: j.frames }, (_, i) => `${j.animOf}/${i}`),
        fps: j.fps, loop: j.loop,
        w: +j.boxW.toFixed(2), h: +j.boxH.toFixed(2), pivot: j.pivot,
      };
    }
  }

  writeFileSync(join(OPT.out, jsonName), JSON.stringify({
    image: imageName,
    scale: OPT.scale,
    // Baked from a white master, so the runtime colour has to be multiplied
    // back in. Drop this and every enemy, element and rarity renders white.
    tintMode: OPT.tint.toLowerCase() === '#ffffff' ? 'multiply' : null,
    meta: {
      generator: 'tools/bake-atlas.mjs',
      note: 'Baked from the procedural drawers in src/art/. Reference art, not final art.',
      size: { w: p.side, h: p.side },
      bleed: OPT.bleed,
      trimmed: OPT.trim,
      tint: OPT.tint,
    },
    frames,
    animations,
  }, null, 1) + '\n');

  written.push({
    jsonName, imageName, side: p.side,
    frames: p.frames.length, anims: Object.keys(animations).length,
    bytes: statSync(join(OPT.out, imageName)).size,
  });
}

console.log(`  ${pages.defs} keys → ${pages.total} frames on ${written.length} page(s)`);
for (const w of written) {
  console.log(`  ${w.imageName}  ${w.side}²  ${w.frames} frames, ${w.anims} animations` +
              `  ${(w.bytes / 1024).toFixed(0)} KB  → ${w.jsonName}`);
}
console.log(`  totaal ${(written.reduce((s, w) => s + w.bytes, 0) / 1048576).toFixed(2)} MB`);
console.log(`\nTo run the game on these sprites, list them in assets/sprites/atlases.json:`);
console.log(`  "atlases": [${written.map((w) => `"${w.jsonName}"`).join(', ')}]`);
