/**
 * balance.mjs — pacing instrument, not a test.
 *
 * A bot plays the real game in the real engine with a realistic "invested
 * player" loadout, and reports the timeline: wave, level, kills, score, HP,
 * enemy count, damage and framerate.
 *
 * This is how three problems were found that you cannot read out of the code:
 * waves that stalled for forty seconds, enemies that circled out of reach
 * forever, and a kill rate far too low for the genre.
 *
 * Re-run it after any balance change.
 *
 * Usage:  node tests/balance.mjs        (see tests/README.md)
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.AF_URL ?? 'http://127.0.0.1:8080/index.html';
const DURATION = Number(process.env.AF_SECONDS ?? process.argv[2] ?? 150);

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

const b = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await b.newPage({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message, (e.stack||'').split('\n')[1]));
page.on('console', (m) => { if (m.type()==='error' && !m.text().includes('404')) console.log('CONSOLE-ERR', m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2400);

await page.evaluate(() => {
  const A = globalThis.ASTRAFALL;
  A.save.profile.settings.sfx = 0; A.save.profile.settings.music = 0;
  // A realistic "invested player": SSR at 4 stars plus a maxed yard.
  A.save.profile.collection.aurelia = { stars: 4, dupes: 0, obtainedAt: Date.now(), uses: 0 };
  A.save.profile.equipped = 'aurelia';
  A.save.profile.meta.upgrades = { hp: 3, power: 8, rate: 8, magnet: 5, xp: 6, ult: 5, luck: 4 };
  A.save.touch();
  document.querySelector('.welcome .btn')?.click();
});
await page.waitForTimeout(600);
await page.evaluate(() => {
  const A = globalThis.ASTRAFALL;
  A.__log = []; A.__done = false;
  document.querySelector('.play').click();
  // Prefer offence so the bot keeps up with the curve.
  const RANK = ['power','rate','multishot','crit','critdmg','orbitals','explode','chain','pierce','hp'];
  const loop = () => {
    const s = A.scene;
    if (s?.name === 'run') {
      if (s.state === 'levelup' && s.pendingCards) {
        const rank = (c) => { const i = RANK.indexOf(c.id); return i < 0 ? 999 : i; };
        const best = s.pendingCards.slice().sort((a, c) => rank(a) - rank(c))[0];
        s.pickCard(best ?? s.pendingCards[0]);
      }
      if (s.state === 'play') {
        const p = s.player, view = s.view;
        let best = null, bestScore = -Infinity;
        for (let gx = 0; gx < 11; gx++) for (let gy = 0; gy < 6; gy++) {
          const x = 40 + (view.w - 80) * (gx / 10);
          const y = view.h * 0.42 + (view.h * 0.53) * (gy / 5);
          let sc = -Math.hypot(p.x - x, p.y - y) * 0.25;
          s.enemies.each((e) => {
            const d = Math.hypot(e.x - x, e.y - y);
            if (d < 170) sc -= (170 - d) * 2.6;
            if (e.y < y - 60 && Math.abs(e.x - x) < 50) sc += 230 - Math.abs(e.x - x) * 2;
          });
          s.ebullets.each((bb) => { const d = Math.hypot(bb.x - x, bb.y - y); if (d < 130) sc -= (130 - d) * 4; });
          s.pickups.each((k) => { const d = Math.hypot(k.x - x, k.y - y); if (d < 300) sc += (300 - d) * 0.3; });
          if (sc > bestScore) { bestScore = sc; best = { x, y }; }
        }
        if (best) { p.x += (best.x - p.x) * 0.22; p.y += (best.y - p.y) * 0.22; }
        if (s.ult >= s.ultMax && (s.enemies.count > 6 || s.player.hp <= 1)) s.tryUlt();
        A.__log.push({ t: +s.time.toFixed(1), wave: s.director.wave, lvl: s.level, kills: s.kills,
                       score: Math.round(s.score), hp: p.hp, maxHp: p.maxHp, en: s.enemies.count,
                       eb: s.ebullets.count, dmg: +s.stats.damage.toFixed(1), fps: +A.game.fps.toFixed(0) });
      }
      if (s.state === 'dead') { A.__done = true; A.__cards = (s.cards ?? []).map(c => c.name); }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

const start = Date.now();
while (Date.now() - start < DURATION * 1000) {
  await page.waitForTimeout(2500);
  if (await page.evaluate(() => globalThis.ASTRAFALL.__done)) break;
}
const log = await page.evaluate(() => globalThis.ASTRAFALL.__log);
const seen = new Set(); const rows = [];
for (const e of log) { const k = Math.floor(e.t / 10); if (seen.has(k)) continue; seen.add(k); rows.push(e); }
console.log('t     wave lvl kills  score  hp   en  eb   dmg fps');
for (const r of rows) console.log(String(r.t).padStart(5), String(r.wave).padStart(4), String(r.lvl).padStart(3),
  String(r.kills).padStart(5), String(r.score).padStart(7), `${r.hp}/${r.maxHp}`.padStart(5),
  String(r.en).padStart(4), String(r.eb).padStart(3), String(r.dmg).padStart(6), String(r.fps).padStart(3));
console.log('\nlast:', JSON.stringify(log[log.length-1]));
console.log('cards:', await page.evaluate(() => (globalThis.ASTRAFALL.__cards ?? []).join(', ')));
await b.close();
