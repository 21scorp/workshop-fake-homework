/**
 * systems.mjs — exercises every branch the UI can reach but a playthrough won't.
 *
 * A run only ever fires one Astra's weapon and one ultimate. That leaves 20
 * ult recipes, 14 firing patterns, every enemy AI and every sound effect that
 * have never executed — and all three of those subsystems fail *quietly*
 * (Sfx swallows errors, a thrown ult is caught, an AI branch just does
 * nothing). So this drives all of them once and fails loudly on anything.
 *
 * Usage:  node tests/systems.mjs        (see tests/README.md)
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.AF_URL ?? 'http://127.0.0.1:8080/index.html';

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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, isMobile: true, hasTouch: true });

const problems = [];
page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') problems.push('ERROR ' + t);
  // These three warn instead of throwing, which is exactly why they need catching here.
  if (m.type() === 'warning' && /\[audio\]|\[ult\]|\[assets\] no sprite/.test(t)) problems.push('WARN ' + t);
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

/**
 * Resolve any pending level-up before measuring anything.
 *
 * Firing twenty-one ultimates in a row wipes the screen, and every wipe is
 * XP — the run parks in state 'levelup' waiting for a card and stops
 * simulating. A later block would then measure a frozen world and blame the
 * subsystem it was testing.
 */
async function settle(page) {
  for (let i = 0; i < 12; i++) {
    const state = await page.evaluate(() => {
      const run = globalThis.ASTRAFALL.scene;
      if (run?.state === 'levelup') run.pickCard(run.pendingCards[0]);
      return run?.state;
    });
    if (state !== 'levelup') return state;
    await page.waitForTimeout(320);
  }
  return 'levelup';
}

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2400);
// A real gesture so the AudioContext actually unlocks; otherwise every SFX
// short-circuits and this whole file proves nothing.
await page.mouse.click(206, 700);
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector('.welcome .btn')?.click());
await page.waitForTimeout(600);

const audioReady = await page.evaluate(() => globalThis.ASTRAFALL.Sfx && !!document.querySelector('.play'));
check('audio-context ontgrendeld door een gebaar', audioReady);

/* ---------------- every sound effect ---------------- */
{
  const r = await page.evaluate(async () => {
    const { Sfx, engine } = await import('./src/core/Audio.js');
    engine.init();
    const state = engine.ctx?.state;
    const names = Sfx.names;
    for (const n of names) {
      // gate:false so nothing is throttled away and every branch really runs.
      Sfx.play(n, { gate: false, rarity: 4, size: 1.4, pitch: 1.2, step: 12, dur: 0.2 });
    }
    return { state, count: names.length, voices: engine.ctx?.state };
  });
  await page.waitForTimeout(900);
  check(`alle ${r.count} geluiden spelen zonder fout`, r.count >= 15 && r.state === 'running',
    `ctx=${r.state}`);
}

/* ---------------- every rarity of reveal sound ---------------- */
{
  await page.evaluate(async () => {
    const { Sfx } = await import('./src/core/Audio.js');
    for (let rarity = 0; rarity <= 4; rarity++) Sfx.play('reveal', { rarity, gate: false });
  });
  await page.waitForTimeout(500);
  check('reveal-geluid voor elke zeldzaamheid', true);
}

/* ---------------- every weapon pattern ---------------- */
{
  await page.click('.play');
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async () => {
    const { PATTERNS } = await import('./src/game/Weapons.js');
    const { ASTRA } = await import('./src/data/astra.js');
    const run = globalThis.ASTRAFALL.scene;
    const fired = [];
    const failed = [];
    for (const type of Object.keys(PATTERNS)) {
      // Use a real Astra that owns this pattern so the config is realistic.
      const astra = ASTRA.find((a) => a.weapon.type === type) ?? ASTRA[0];
      try {
        PATTERNS[type]({ run, player: run.player, stats: run.stats, weapon: astra.weapon, dt: 1 / 60 });
        fired.push(type);
      } catch (e) { failed.push(`${type}: ${e.message}`); }
    }
    return { fired, failed, bullets: run.bullets.count };
  });
  check(`alle ${r.fired.length} wapenpatronen vuren`, r.failed.length === 0, r.failed.join(' | '));
}

/* ---------------- every ultimate recipe ---------------- */
{
  const r = await page.evaluate(async () => {
    const { RECIPES } = await import('./src/game/Ults.js');
    const { fireUlt } = await import('./src/game/Ults.js');
    const { ASTRA } = await import('./src/data/astra.js');
    const run = globalThis.ASTRAFALL.scene;
    const failed = [];
    const keys = Object.keys(RECIPES);
    for (const key of keys) {
      const astra = ASTRA.find((a) => a.ult.key === key) ?? ASTRA[0];
      try {
        // Star 5 so the "upgraded ultimate" echo path runs too.
        fireUlt(run, astra, 5);
      } catch (e) { failed.push(`${key}: ${e.message}`); }
    }
    return { count: keys.length, failed };
  });
  await page.waitForTimeout(1600);
  check(`alle ${r.count} ultimates vuren`, r.failed.length === 0, r.failed.join(' | '));
}

/* ---------------- every enemy type and AI ---------------- */
{
  const state = await settle(page);
  check('run simuleert weer na de ultimate-storm', state === 'play', `state=${state}`);
  const r = await page.evaluate(async () => {
    const { ENEMY } = await import('./src/data/enemies.js');
    const run = globalThis.ASTRAFALL.scene;
    run.enemies.clear();
    const ids = Object.keys(ENEMY);
    ids.forEach((id, i) => run.director.spawnAt(id, 60 + (i % 6) * 100, 120 + Math.floor(i / 6) * 120));
    return { spawned: run.enemies.count, ids: ids.length };
  });
  // Let every AI branch tick, including charge wind-ups and gun cooldowns.
  await page.waitForTimeout(5000);
  const after = await page.evaluate(() => {
    const run = globalThis.ASTRAFALL.scene;
    return { alive: run.enemies.count, ebullets: run.ebullets.count, hazards: run.hazards.count };
  });
  check(`alle ${r.ids} vijandtypes spawnen en updaten`, r.spawned === r.ids,
    `${r.spawned}/${r.ids} gespawnd, ${after.ebullets} kogels, ${after.hazards} zones`);
}

/* ---------------- every gun actually fires ----------------
 * The sweep above lets the player shoot back, so a gunner can die before its
 * first cooldown elapses and prove nothing. This one keeps them alive: only
 * the gunned archetypes, HP inflated past anything the vessel can do in the
 * window, so an empty bullet pool means a broken gun and not a fast kill. */
{
  await settle(page);
  const r = await page.evaluate(async () => {
    const { ENEMY } = await import('./src/data/enemies.js');
    const run = globalThis.ASTRAFALL.scene;
    run.enemies.clear();
    run.ebullets.clear();
    const gunners = Object.keys(ENEMY).filter((id) => ENEMY[id].gun);
    gunners.forEach((id, i) => {
      const e = run.director.spawnAt(id, 120 + i * 90, 200 + (i % 2) * 90);
      if (e) { e.hp = e.maxHp = 1e6; }
    });
    return { alive: run.enemies.count, gunners };
  });
  // Longest cooldown is 3.2s plus a 1.0s charge; give every gun two windows.
  // The director keeps spawning its own wave alongside, so count by id — and
  // keep settling, because those kills level the player mid-window and a
  // waiting card screen would freeze the very thing being measured.
  let after = { alive: [], ebullets: 0, state: '?' };
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(1000);
    await settle(page);
    const s = await page.evaluate((ids) => {
      const run = globalThis.ASTRAFALL.scene;
      const seen = new Set();
      run.enemies.each((e) => { if (ids.includes(e.def?.id)) seen.add(e.def.id); });
      return { alive: [...seen], ebullets: run.ebullets.count, state: run.state };
    }, r.gunners);
    after = { ...s, ebullets: Math.max(after.ebullets, s.ebullets) };
  }
  check(`alle ${r.gunners.length} schietende vijanden vuren echt`,
    after.alive.length === r.gunners.length && after.ebullets > 0,
    `${after.alive.length}/${r.gunners.length} in leven, ${after.ebullets} kogels, state=${after.state}`);
}

/* ---------------- every boss and every phase pattern ---------------- */
{
  const r = await page.evaluate(async () => {
    const { BOSSES } = await import('./src/data/enemies.js');
    const run = globalThis.ASTRAFALL.scene;
    const failed = [];
    let patterns = 0;
    for (const boss of BOSSES) {
      run.enemies.clear();
      run.onBossWave(boss);
      const e = run.bossRef;
      e.entering = false;
      for (const phase of boss.phases) {
        try { run.bossAttack(e, phase.pattern); patterns++; }
        catch (err) { failed.push(`${boss.id}/${phase.pattern}: ${err.message}`); }
      }
    }
    return { bosses: BOSSES.length, patterns, failed };
  });
  await page.waitForTimeout(2000);
  check(`alle ${r.patterns} boss-patronen vuren`, r.failed.length === 0, r.failed.join(' | '));
}

/* ---------------- every card applies ---------------- */
{
  const r = await page.evaluate(async () => {
    const { CARDS, blankMods } = await import('./src/data/cards.js');
    const failed = [];
    for (const c of CARDS) {
      const mods = blankMods();
      const stacks = {};
      try {
        // Apply to max so per-stack maths and any clamping runs.
        for (let i = 0; i < c.max; i++) { c.apply(mods, stacks); stacks[c.id] = i + 1; }
        const text = typeof c.desc === 'function' ? c.desc(1) : c.desc;
        if (!text) failed.push(`${c.id}: lege beschrijving`);
        for (const k in mods) if (!Number.isFinite(mods[k])) failed.push(`${c.id}: ${k} is ${mods[k]}`);
      } catch (e) { failed.push(`${c.id}: ${e.message}`); }
    }
    return { count: CARDS.length, failed };
  });
  check(`alle ${r.count} kaarten passen toe zonder NaN`, r.failed.length === 0, r.failed.join(' | '));
}

/* ---------------- every Astra is renderable and coherent ---------------- */
{
  const r = await page.evaluate(async () => {
    const Assets = (await import('./src/core/AssetRegistry.js')).default;
    const { ASTRA, astraSprite } = await import('./src/data/astra.js');
    const { PATTERNS } = await import('./src/game/Weapons.js');
    const { RECIPES } = await import('./src/game/Ults.js');
    const { ELEMENT } = await import('./src/data/constants.js');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const failed = [];
    for (const a of ASTRA) {
      for (const state of ['idle', 'cast', 'hurt', 'portrait']) {
        const key = astraSprite(a, state);
        if (!Assets.has(key)) { failed.push(`${a.id}: sprite ${key} ontbreekt`); continue; }
        try { Assets.draw(ctx, key, 64, 64, { t: 0.7, scale: 0.6, tint: a.colors.primary, tint2: a.colors.secondary }); }
        catch (e) { failed.push(`${a.id}/${state}: ${e.message}`); }
      }
      if (!PATTERNS[a.weapon.type]) failed.push(`${a.id}: onbekend wapenpatroon ${a.weapon.type}`);
      if (!RECIPES[a.ult.key]) failed.push(`${a.id}: onbekende ultimate ${a.ult.key}`);
      if (!ELEMENT[a.element]) failed.push(`${a.id}: onbekend element ${a.element}`);
      if (!a.lore || !a.title) failed.push(`${a.id}: mist lore of titel`);
    }
    return { count: ASTRA.length, failed, missing: Assets.report().missing };
  });
  check(`alle ${r.count} Astra tekenen en verwijzen naar bestaande systemen`,
    r.failed.length === 0 && r.missing.length === 0,
    [...r.failed, ...r.missing].join(' | '));
}

/* ---------------- gacha statistics ---------------- */
{
  const r = await page.evaluate(async () => {
    const { RNG } = await import('./src/core/RNG.js');
    const { getBanner, ssrChanceAt } = await import('./src/data/banners.js');
    const banner = getBanner('standard');

    // Reimplement pity locally so the test measures the published rules, not
    // the profile's live state.
    const rng = new RNG('stat-check');
    let sinceSSR = 0, ssrCount = 0, worst = 0, run = 0;
    const N = 60000;
    for (let i = 0; i < N; i++) {
      sinceSSR++;
      run++;
      if (rng.float() < ssrChanceAt(banner, sinceSSR - 1)) {
        ssrCount++;
        worst = Math.max(worst, sinceSSR);
        sinceSSR = 0;
      }
    }
    return { rate: ssrCount / N, worst, expected: banner.rates[3] + banner.rates[4], hard: banner.pity.hard };
  });
  // With soft pity the effective rate lands well above the base rate.
  check('Stellar+ effectieve rate ligt boven de basisrate',
    r.rate > r.expected && r.rate < 0.12, `${(r.rate * 100).toFixed(2)}% vs basis ${(r.expected * 100).toFixed(2)}%`);
  check('pity garandeert binnen de harde grens', r.worst <= r.hard, `slechtste reeks ${r.worst}, grens ${r.hard}`);
}

/* ---------------- the sprite swap, end to end ----------------
 * The entire renderer rests on one promise: drop an atlas in and the game
 * draws artwork instead of vectors, with nothing else changed. Left untested
 * that is a guess, and the first real bake proved it: geometry and timing
 * were pixel-perfect, and every sprite came out white because the atlas path
 * dropped the runtime tint.
 *
 * assets/sprites/pickups.json is a small real atlas baked by
 * tools/bake-atlas.mjs, kept for exactly this check. It is deliberately not
 * listed in atlases.json — the shipped game stays procedural.
 * Runs last: loading an atlas changes rendering for good. */
{
  const r = await page.evaluate(async () => {
    const A = globalThis.ASTRAFALL.Assets;
    const ok = await A.loadAtlas('./assets/sprites/pickups.json');
    const key = 'pickup/prism';
    const before = A.stats.atlasDraws;

    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const ctx = cv.getContext('2d');
    const paint = (tint) => {
      ctx.clearRect(0, 0, 96, 96);
      A.draw(ctx, key, 48, 48, { tint, t: 0 });
      return ctx.getImageData(0, 0, 96, 96).data;
    };
    const red = paint('#ff2020');
    const cyan = paint('#20ffff');

    // Ink in the same places, different colour: the tint is being applied and
    // the silhouette is not being flattened away.
    let inked = 0, differs = 0, sameAlpha = 0;
    for (let i = 3; i < red.length; i += 4) {
      if (red[i] > 8) inked++;
      if (red[i] === cyan[i]) sameAlpha++;
      if (red[i] > 8 && (red[i - 3] !== cyan[i - 3] || red[i - 1] !== cyan[i - 1])) differs++;
    }

    const atlasDef = A.frames.get(key)?.def;
    const vectorDef = A.defs.get(key);
    return {
      ok, frames: A.frames.size, unresolved: A.unresolvedAnimations(),
      drew: A.stats.atlasDraws - before, inked, differs,
      alphaMatch: sameAlpha === red.length / 4,
      // The blit covers the vector version's box plus the glow that spills
      // past it, trimmed back to the ink. Under 1 would clip the halo; over
      // the bleed factor means the trim did nothing.
      sizeRatio: atlasDef && vectorDef ? +(atlasDef.w / vectorDef.w).toFixed(2) : 0,
      atlasFrameCount: atlasDef?.frames ?? 0,
      vectorFrameCount: vectorDef?.frames ?? 0,
    };
  });
  check('atlas laadt en levert frames', r.ok && r.frames > 0 && r.unresolved.length === 0,
    `${r.frames} frames, ${r.unresolved.length} onopgelost`);
  check('sprite komt uit de atlas, niet uit de vectortekenaar', r.drew === 2, `${r.drew} atlas-draws`);
  check('atlas-sprite neemt de kleur van de entiteit over',
    r.inked > 200 && r.differs > r.inked * 0.5 && r.alphaMatch,
    `${r.inked} px inkt, ${r.differs} verkleurd, alfa gelijk: ${r.alphaMatch}`);
  check('atlas-frame houdt de maat en het aantal frames van het vectorformaat',
    // 1.85 is the bleed; the extra hundredth is the ceil() to a whole pixel.
    r.sizeRatio >= 1 && r.sizeRatio <= 1.9 && r.atlasFrameCount === r.vectorFrameCount,
    `${r.sizeRatio}× nominaal, ${r.atlasFrameCount}/${r.vectorFrameCount} frames`);
}

/* ---------------- nothing leaked to the console ---------------- */
check('geen fouten of stille waarschuwingen', problems.length === 0, problems.slice(0, 6).join(' | '));

console.log('\n' + '='.repeat(60));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} geslaagd`);
if (failed.length) console.log('FAILED:\n' + failed.map((f) => ' - ' + f.name + ' :: ' + f.detail).join('\n'));
await browser.close();
process.exit(failed.length ? 1 : 0);
