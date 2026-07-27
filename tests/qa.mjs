/**
 * qa.mjs — browser QA sweep.
 *
 * Runs a real Chromium against a real server, because the things most likely
 * to break here are the things only a browser can tell you: does the layout
 * survive a 360px phone, does a five-version-old save still migrate, does the
 * game start when localStorage throws.
 *
 * Every check also fails on a console error, so a silent exception inside a
 * screen takes the suite down with it.
 *
 * Usage:  node tests/qa.mjs        (see tests/README.md)
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.AF_URL ?? 'http://127.0.0.1:8080/index.html';
const OUT = process.env.AF_SHOTS ?? null;

/** Find a Chromium: an explicit path, a Playwright cache, or the system one. */
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

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function makePage(viewport = { width: 412, height: 892 }, dsf = 2) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push('CONSOLE ' + m.text()); });
  return page;
}
const boot = async (page, url = URL) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  await page.evaluate(() => document.querySelector('.welcome .btn')?.click());
  await page.waitForTimeout(600);
};

/* ---------------- 1. viewport sizes ---------------- */
for (const [label, vp] of [
  ['klein 360x640', { width: 360, height: 640 }],
  ['groot 430x932', { width: 430, height: 932 }],
  ['tablet 768x1024', { width: 768, height: 1024 }],
  ['desktop 1440x900', { width: 1440, height: 900 }],
]) {
  const page = await makePage(vp, 1);
  await boot(page);
  const m = await page.evaluate(() => {
    const r = globalThis.ASTRAFALL.game.renderer;
    const play = document.querySelector('.play')?.getBoundingClientRect();
    const nav = document.querySelector('.nav')?.getBoundingClientRect();
    return {
      view: { ...r.view }, css: { w: r.cssW, h: r.cssH },
      playVisible: !!play && play.width > 40 && play.top >= 0,
      navBottom: nav ? Math.round(nav.bottom) : 0,
      inner: window.innerHeight,
      hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  check(`layout ${label}`, m.playVisible && !m.hOverflow && m.navBottom <= m.inner + 2, JSON.stringify(m.css));
  check(`geen fouten ${label}`, page.errs.length === 0, page.errs.join(' | '));
  if (OUT) await page.screenshot({ path: `${OUT}/qa-${vp.width}.png` });
  await page.close();
}

/* ---------------- 2. seed deeplink ---------------- */
{
  const page = await makePage();
  await page.goto(URL + '?s=TESTAB', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4200);
  const m = await page.evaluate(() => ({
    scene: document.body.dataset.scene,
    seed: globalThis.ASTRAFALL.scene?.seed,
    url: location.search,
  }));
  check('seed-deeplink start een run', m.scene === 'run' && !!m.seed, JSON.stringify(m));
  check('seed uit de adresbalk gehaald', m.url === '', m.url);
  check('geen fouten bij deeplink', page.errs.length === 0, page.errs.join(' | '));
  await page.close();
}

/* ---------------- 3. determinism ---------------- */
{
  const readWaves = async () => {
    const page = await makePage();
    await boot(page);
    const out = await page.evaluate(async () => {
      const { RNG } = await import('./src/core/RNG.js');
      const { WaveDirector } = await import('./src/game/WaveDirector.js');
      const fake = { enemies: { count: 0 }, view: { w: 720, h: 1560 }, onWaveStart() {}, onWaveClear() {}, onBossWave() {} };
      const d = new WaveDirector(fake, new RNG('run|SEEDCHECK').fork('waves'));
      return [1, 2, 3, 4].map((w) => d.planWave(w).map((o) => `${o.type}@${o.x.toFixed(3)}/${o.delay.toFixed(2)}`).join(','));
    });
    await page.close();
    return out;
  };
  const a = await readWaves();
  const b = await readWaves();
  check('zelfde seed geeft identieke golven', JSON.stringify(a) === JSON.stringify(b),
    `${a[0].slice(0, 40)}…`);
}

/* ---------------- 4. pause / resume / quit ---------------- */
{
  const page = await makePage();
  await boot(page);
  await page.click('.play');
  await page.waitForTimeout(2000);
  await page.click('.hud-pause');
  await page.waitForTimeout(500);
  const paused = await page.evaluate(() => ({ paused: globalThis.ASTRAFALL.game.paused, panel: !!document.querySelector('.pause__panel') }));
  check('pauze stopt de simulatie', paused.paused && paused.panel, JSON.stringify(paused));
  if (OUT) await page.screenshot({ path: `${OUT}/qa-pause.png` });
  await page.click('[data-act="resume"]');
  await page.waitForTimeout(400);
  check('hervatten werkt', !(await page.evaluate(() => globalThis.ASTRAFALL.game.paused)));
  await page.click('.hud-pause'); await page.waitForTimeout(400);
  await page.click('[data-act="quit"]'); await page.waitForTimeout(2500);
  check('run verlaten gaat naar resultaten', (await page.evaluate(() => document.body.dataset.screen)) === 'results');
  check('geen fouten in pauzeflow', page.errs.length === 0, page.errs.join(' | '));
  await page.close();
}

/* ---------------- 5. star-up in the collection ---------------- */
{
  const page = await makePage();
  await boot(page);
  await page.evaluate(() => {
    const s = globalThis.ASTRAFALL.save;
    s.profile.currency.echoes = 5000;
    s.profile.collection.flint = { stars: 1, dupes: 9, obtainedAt: Date.now(), uses: 0 };
    s.touch();
  });
  await page.click('.nav__item:nth-child(3)'); await page.waitForTimeout(900);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.acard')];
    cards.find((c) => c.textContent.includes('Flint'))?.click();
  });
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => globalThis.ASTRAFALL.save.profile.collection.flint.stars);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.adetail__actions .btn')].find((x) => x.textContent.includes('Ster'));
    b?.click();
  });
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => globalThis.ASTRAFALL.save.profile.collection.flint.stars);
  check('ster verhogen werkt', after === before + 1, `${before} → ${after}`);
  check('geen fouten in collectie', page.errs.length === 0, page.errs.join(' | '));
  await page.close();
}

/* ---------------- 6. shop purchase (mock provider) ---------------- */
{
  const page = await makePage();
  await boot(page);
  await page.click('.nav__item:nth-child(4)'); await page.waitForTimeout(600);
  await page.click('.tabs .tab:nth-child(2)'); await page.waitForTimeout(700);
  const shardsBefore = await page.evaluate(() => globalThis.ASTRAFALL.save.profile.currency.shards);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.sku .btn')][1];
    b?.click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('.buyc .btn')?.click());
  await page.waitForTimeout(1800);
  const shardsAfter = await page.evaluate(() => globalThis.ASTRAFALL.save.profile.currency.shards);
  check('mock-aankoop kent valuta toe', shardsAfter > shardsBefore, `${shardsBefore} → ${shardsAfter}`);
  check('geen fouten in winkel', page.errs.length === 0, page.errs.join(' | '));
  await page.close();
}

/* ---------------- 7. settings: export / import / reset ---------------- */
{
  const page = await makePage();
  await boot(page);
  await page.evaluate(() => { globalThis.ASTRAFALL.save.profile.currency.cores = 4242; globalThis.ASTRAFALL.save.touch(); });
  const code = await page.evaluate(() => globalThis.ASTRAFALL.save.export());
  const ok = await page.evaluate((c) => {
    const s = globalThis.ASTRAFALL.save;
    s.reset();
    const before = s.profile.currency.cores;
    const imported = s.import(c);
    return { imported, before, after: s.profile.currency.cores };
  }, code);
  check('export/import herstelt het profiel', ok.imported && ok.after === 4242, JSON.stringify(ok));
  check('ongeldige importcode wordt geweigerd',
    !(await page.evaluate(() => globalThis.ASTRAFALL.save.import('niet-base64!!!'))));
  await page.close();
}

/* ---------------- 7b. a new player can actually pull ----------------
 * The summon screen used to open on the Shards banner, so the first thing a
 * brand-new player ever saw of the gacha was a greyed-out ten-pull and a link
 * to the shop. Assert the opening banner is one their starting balance covers. */
{
  const page = await makePage();
  await boot(page);
  await page.click('.nav__item:nth-child(2)');
  await page.waitForTimeout(1100);
  const m = await page.evaluate(() => {
    const on = [...document.querySelectorAll('.stab')].findIndex((b) => b.dataset.on === '1');
    const btns = [...document.querySelectorAll('.summon__actions button')]
      .map((b) => ({ txt: b.textContent.replace(/\s+/g, ' ').trim(), off: b.disabled }));
    return { on, btns, free: btns.some((b) => /GRATIS/.test(b.txt)) };
  });
  const ten = m.btns.find((b) => /×10/.test(b.txt));
  check('nieuwe speler opent op een banner die hij kan trekken', !!ten && !ten.off,
    JSON.stringify(m.btns.map((b) => b.txt)));
  check('de gratis dagelijkse summon staat er meteen', m.free);
  check('geen fouten op het summonscherm', page.errs.length === 0, page.errs.join(' | '));
  await page.close();
}

/* ---------------- 8. save migration from an old schema ---------------- */
{
  const page = await makePage();
  // Seed before any app code runs. Writing it after a load and reloading
  // races the store's own debounced first write, which lands 600ms after
  // boot and would quietly replace the old profile with a fresh one — the
  // test then "passes" against defaults, or fails for no reason at all.
  await page.addInitScript(() => {
    localStorage.setItem('astrafall.profile.v1', JSON.stringify({
      v: 1,
      currency: { stardust: 999, shards: 1 },
      collection: { pip: { stars: 2 } },
      equipped: 'pip',
      stats: { runs: 5 },
      daily: {}, settings: {}, flags: {}, account: { level: 2, xp: 10 },
      meta: { upgrades: {} }, gacha: {}, history: [],
    }));
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const m = await page.evaluate(() => {
    const p = globalThis.ASTRAFALL.save.profile;
    return { v: p.v, dust: p.currency.stardust, runs: p.stats.runs, ach: !!p.achievements, loadout: p.loadout, seedScores: !!p.daily.seedScores, bestiary: !!p.bestiary };
  });
  check('oud profiel migreert zonder verlies', m.v === 5 && m.dust === 999 && m.runs === 5 && m.ach && m.seedScores && m.bestiary, JSON.stringify(m));
  check('geen fouten na migratie', page.errs.length === 0, page.errs.join(' | '));
  await page.close();
}

/* ---------------- 9. reduced motion ---------------- */
{
  const page = await makePage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await page.click('.play');
  await page.waitForTimeout(2500);
  check('reduced-motion draait zonder fouten', page.errs.length === 0, page.errs.join(' | '));
  if (OUT) await page.screenshot({ path: `${OUT}/qa-reduced.png` });
  await page.close();
}

/* ---------------- 10. localStorage unavailable ---------------- */
{
  const page = await makePage();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('denied', 'SecurityError'); },
    });
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const m = await page.evaluate(() => ({ booted: !!globalThis.ASTRAFALL?.save?.profile, avail: globalThis.ASTRAFALL?.save?.available }));
  check('zonder localStorage start het spel alsnog', m.booted && m.avail === false, JSON.stringify(m));
  await page.close();
}

console.log('\n' + '='.repeat(60));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} geslaagd`);
if (failed.length) console.log('FAILED:\n' + failed.map((f) => ' - ' + f.name + ' :: ' + f.detail).join('\n'));
await browser.close();
process.exit(failed.length ? 1 : 0);
