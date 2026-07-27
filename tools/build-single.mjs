/**
 * build-single.mjs — bundle the whole game into one HTML file.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  WHY
 * ─────────────────────────────────────────────────────────────────────────
 *  The game ships as loose ES modules on purpose: no build step, no tooling
 *  between the source and the browser. That is the right default, and it is
 *  also the one thing you cannot hand someone as a single link when there is
 *  no server to point at.
 *
 *  So this is a *delivery* build, not a development one. It changes nothing
 *  about how the game is written — esbuild resolves the same module graph the
 *  browser would, the CSS goes in verbatim, and the sprite atlas rides along
 *  as a data URI so the atlas path behaves exactly as it does on a real host.
 *  Nothing here is allowed to become a dependency of the game itself.
 *
 *  Usage:  node tools/build-single.mjs [out.html]
 */
import { build } from 'esbuild';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const OUT = process.argv[2] ?? 'dist/astrafall.html';
const CSS = ['styles/base.css', 'styles/ui.css', 'styles/screens.css'];

/* ---- 1. the module graph, as one script ---- */
const bundled = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2022'],
  write: false,
  legalComments: 'none',
});
const js = bundled.outputFiles[0].text;

/* ---- 2. the stylesheets, in link order ---- */
const css = (await Promise.all(CSS.map((f) => readFile(f, 'utf8')))).join('\n');

/* ---- 3. the atlas, if one has been baked ----
 * fetch() and <img src> both point at paths that will not exist in a single
 * file, so serve them from memory instead. Without this the game silently
 * falls back to procedural art — correct, but then this build would not be
 * testing the same code path the hosted game runs. */
const inlineJson = {};
const inlineImg = {};
if (existsSync('assets/sprites/atlases.json')) {
  const manifest = JSON.parse(await readFile('assets/sprites/atlases.json', 'utf8'));
  inlineJson['./assets/sprites/atlases.json'] = manifest;
  for (const name of manifest.atlases ?? []) {
    const path = `assets/sprites/${name}`;
    if (!existsSync(path)) continue;
    const data = JSON.parse(await readFile(path, 'utf8'));
    inlineJson[`./${path}`] = data;
    const png = `assets/sprites/${data.image || data.meta?.image}`;
    if (existsSync(png)) {
      inlineImg[`./${png}`] = `data:image/png;base64,${(await readFile(png)).toString('base64')}`;
    }
  }
}

/* The shim runs before the bundle and touches nothing else: fetch falls
 * through for every URL it does not know, and the image setter is a pure
 * rename. Both are no-ops on a normally hosted copy. */
const shim = `
const __J = ${JSON.stringify(inlineJson)};
const __I = ${JSON.stringify(inlineImg)};
const __f = window.fetch.bind(window);
window.fetch = (u, o) => (typeof u === 'string' && u in __J)
  ? Promise.resolve(new Response(JSON.stringify(__J[u]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  : __f(u, o);
// A service worker needs a file of its own; there isn't one here. Let the
// registration resolve to nothing rather than 404 into the console.
try { Object.defineProperty(navigator.serviceWorker ?? {}, 'register', { value: () => Promise.resolve(null) }); } catch (e) {}
const __d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  configurable: true,
  get() { return __d.get.call(this); },
  set(v) { __d.set.call(this, __I[v] ?? v); },
});
`;

/* ---- 4. the page ----
 * Same markup as index.html, minus the three external <link>s that have
 * nothing to point at here. */
const page = await readFile('index.html', 'utf8');
const body = page.slice(page.indexOf('<body>') + 6, page.lastIndexOf('</body>'))
  .replace(/<script type="module"[^>]*><\/script>/, '');

const html = `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#05060f">
<title>ASTRAFALL</title>
<style>${css}</style>
${body}
<script>${shim}${js}</script>
`;

await writeFile(OUT, html);
const size = (await stat(OUT)).size;
console.log(`${OUT} — ${(size / 1024).toFixed(0)} KB `
  + `(js ${(js.length / 1024).toFixed(0)}, css ${(css.length / 1024).toFixed(0)}, `
  + `${Object.keys(inlineImg).length} atlas image(s))`);
