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
/**
 * Make sure a live run scene exists.
 *
 * The suite got long enough that the player can die partway through it, and a
 * later block that assumed `scene.enemies` then failed on the results screen
 * rather than on the thing it was testing.
 */
async function ensureRun(page) {
  const ok = await page.evaluate(() => !!globalThis.ASTRAFALL.scene?.enemies);
  if (!ok) {
    await page.evaluate(() => globalThis.ASTRAFALL.startRun({}));
    await page.waitForTimeout(2800);
  }
  // And keep it alive: a block that spans several seconds of real play can
  // otherwise lose its scene halfway through and fail on the wrong thing.
  await page.evaluate(() => {
    const run = globalThis.ASTRAFALL.scene;
    if (!run?.player) return;
    run.player.invuln = 1e6;
    run.player.hp = run.player.maxHp;
  });
}

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

/* ---------------- ult text matches the ult recipe ---------------- */
{
  const r = await page.evaluate(async () => {
    const { ASTRA } = await import('./src/data/astra.js');
    const { RECIPES } = await import('./src/game/Ults.js');
    // A number in an ult's line is a promise. The recipe is the only place it
    // can be kept, so it has to appear there — as a duration, a count, a
    // multiplier, anything. Six numbers in this build did not: one ult claimed
    // four seconds of a six-second ring, another claimed two seconds for a
    // volley that lands in under one.
    const WORDS = {
      twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8,
      negen: 9, tien: 10, elf: 11, twaalf: 12, dertien: 13, veertien: 14,
    };
    // Counts the recipe expresses structurally rather than as an argument.
    const STRUCTURAL = { crossfire: [2] };   // twee losse P.zone-aanroepen
    const bad = [];
    for (const a of ASTRA) {
      const u = a.ult;
      const src = String(RECIPES[u.key] ?? '');
      if (!src) { bad.push(`${a.id}: geen recept voor ${u.key}`); continue; }
      const claimed = new Set();
      for (const m of u.desc.matchAll(/(\d+(?:[.,]\d+)?)/g)) claimed.add(parseFloat(m[1].replace(',', '.')));
      for (const w in WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(u.desc)) claimed.add(WORDS[w]);
      const literals = new Set([...src.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1])));
      const ok = new Set(STRUCTURAL[u.key] ?? []);
      const missing = [...claimed].filter((n) => !literals.has(n) && !ok.has(n));
      if (missing.length) bad.push(`${u.key}: ${missing.join(',')} staat niet in het recept — "${u.desc}"`);
    }
    return { count: ASTRA.length, bad };
  });
  check(`elk getal in de ${r.count} ultimate-teksten staat ook in het recept`,
    r.bad.length === 0, r.bad.slice(0, 6).join(' | '));
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

/* ---------------- card text tells the truth at every stack ---------------- */
{
  const r = await page.evaluate(async () => {
    const { CARDS } = await import('./src/data/cards.js');
    // Cards whose line is an increment ("+18% schade"): the same sentence is
    // true at every stack, because every pick adds exactly that much. Anything
    // NOT on this list must say something different once you own one — either
    // the number moves, or the card scales silently and the player can't tell.
    const INCREMENTAL = new Set([
      'power', 'rate', 'hp', 'speed', 'magnet', 'xp', 'multishot', 'pierce',
      'crit', 'critdmg', 'bulletsize', 'bulletspeed', 'iframes', 'ultcharge',
      'luck', 'scavenge', 'gambler', 'chain', 'longshot', 'prismlens',
    ]);
    const bad = [];
    for (const c of CARDS) {
      const at = (s) => (typeof c.desc === 'function' ? c.desc(s) : c.desc);
      const lines = [];
      for (let s = 0; s < c.max; s++) {
        let t;
        try { t = at(s); } catch (e) { bad.push(`${c.id}@${s}: ${e.message}`); continue; }
        if (typeof t !== 'string' || !t.trim()) { bad.push(`${c.id}@${s}: leeg`); continue; }
        // A description is read while a boss is on screen. One line, no holes.
        if (/undefined|NaN|Infinity/.test(t)) bad.push(`${c.id}@${s}: "${t}"`);
        if (/(^|[^\d])\+?0(\.0+)?\s*[%×x]/.test(t)) bad.push(`${c.id}@${s}: belooft niets — "${t}"`);
        if (t.length > 64) bad.push(`${c.id}@${s}: ${t.length} tekens — "${t}"`);
        lines.push(t);
      }
      if (c.max > 1 && !INCREMENTAL.has(c.id) && new Set(lines).size === 1) {
        bad.push(`${c.id}: zelfde tekst op stapel 1 t/m ${c.max}`);
      }
      if (c.max === 1 && INCREMENTAL.has(c.id)) bad.push(`${c.id}: stapelt niet, hoort niet op de lijst`);
    }
    return { count: CARDS.length, bad };
  });
  check(`alle ${r.count} kaartteksten kloppen op elke stapel`, r.bad.length === 0,
    r.bad.slice(0, 6).join(' | '));
}

/* ---------------- the shop's promise equals the run's maths ---------------- */
{
  await ensureRun(page);
  const r = await page.evaluate(async () => {
    const { META_UPGRADES } = await import('./src/data/shop.js');
    const { save } = await import('./src/core/Save.js');
    const { blankMods } = await import('./src/data/cards.js');
    const run = globalThis.ASTRAFALL.scene;
    const keep = { ...(save.profile.meta.upgrades || {}) };
    const keepMods = run.mods;
    const bad = [];
    // Cores are spent on a number printed on a button. Whatever the run engine
    // then folds in has to be that number — measured, not read off the source.
    for (const up of META_UPGRADES) {
      for (let l = 0; l < up.max; l++) {
        save.profile.meta.upgrades = { [up.id]: l + 1 };
        const before = blankMods();
        run.mods = blankMods();
        run.applyMetaUpgrades();
        const moved = Object.keys(before).filter((k) => run.mods[k] !== before[k]);
        if (moved.length !== 1) { bad.push(`${up.id}@${l + 1}: raakt ${moved.length} velden`); continue; }
        const field = moved[0];
        const delta = run.mods[field] - before[field];
        const text = up.desc(l);
        const num = parseFloat((text.match(/(\d+(?:\.\d+)?)/) ?? [])[1]);
        const promised = /%/.test(text) ? num / 100 : num;
        if (Math.abs(promised - delta) > 1e-9) {
          bad.push(`${up.id}@${l + 1}: "${text}" maar ${field} ${delta > 0 ? '+' : ''}${delta.toFixed(3)}`);
        }
      }
    }
    save.profile.meta.upgrades = keep;
    run.mods = keepMods;
    run.resolveStats();
    return { count: META_UPGRADES.length, bad };
  });
  check(`alle ${r.count} winkelupgrades leveren precies wat ze beloven`,
    r.bad.length === 0, r.bad.slice(0, 5).join(' | '));
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

/* ---------------- the banner sheet is the deal the roller honours ---------- */
{
  const r = await page.evaluate(async () => {
    const { BANNERS, ssrChanceAt } = await import('./src/data/banners.js');
    const { preview } = await import('./src/systems/Gacha.js');
    const { ASTRA } = await import('./src/data/astra.js');
    const { RARITY } = await import('./src/data/constants.js');
    const byId = new Map(ASTRA.map((a) => [a.id, a]));
    const bad = [];
    const shares = [];
    for (const b of BANNERS) {
      if (!(b.featured ?? []).length) continue;
      // Drive the shipped roller, not a reimplementation of it — the whole
      // point is that the sheet in the UI and the code agree.
      const res = preview(b.id, 20000, `deal-${b.id}`);
      // The 50/50 lives on the tier the rate-up is actually on. Pulling an
      // Ultra on a banner whose rate-up is a Stellar is not a miss — it is the
      // best outcome in the game, and the roller keeps your guarantee armed.
      const featTiers = new Set(b.featured.map((id) => byId.get(id))
        .filter((a) => a && a.rarity >= RARITY.SSR).map((a) => a.rarity));
      if (!featTiers.size) { bad.push(`${b.id}: geen rate-up op Stellar of hoger`); continue; }
      const ssr = res.filter((x) => featTiers.has(x.tier));
      let missAgo = false;
      for (const x of ssr) {
        if (x.featured && !b.featured.includes(x.astra.id)) {
          bad.push(`${b.id}: ${x.astra.id} heet rate-up maar staat niet op de banner`);
        }
        // "Zo niet, dan is de volgende Stellar+ gegarandeerd rate-up."
        if (!x.featured && missAgo) bad.push(`${b.id}: twee keer op rij naast de rate-up`);
        missAgo = !x.featured;
      }
      // A boost b with a guarantee after a loss settles at 1 / (2 - b).
      const share = ssr.filter((x) => x.featured).length / Math.max(1, ssr.length);
      const want = 1 / (2 - (b.featuredBoost ?? 0.5));
      shares.push(`${b.id} ${(share * 100).toFixed(1)}% (verwacht ${(want * 100).toFixed(1)}%)`);
      if (Math.abs(share - want) > 0.035) bad.push(`${b.id}: rate-up aandeel ${(share * 100).toFixed(1)}% vs ${(want * 100).toFixed(1)}%`);

      // "Vanaf pull <soft> stijgt de kans elke pull tot 100% op pull <hard>."
      const base = b.rates[RARITY.SSR] + b.rates[RARITY.UR];
      if (Math.abs(ssrChanceAt(b, b.pity.soft - 2) - base) > 1e-9) bad.push(`${b.id}: kans stijgt al voor pull ${b.pity.soft}`);
      if (ssrChanceAt(b, b.pity.hard - 1) !== 1) bad.push(`${b.id}: pull ${b.pity.hard} is geen 100%`);
      for (let n = b.pity.soft; n < b.pity.hard; n++) {
        if (ssrChanceAt(b, n) < ssrChanceAt(b, n - 1)) { bad.push(`${b.id}: kans daalt bij pull ${n + 1}`); break; }
      }
    }
    return { banners: BANNERS.length, bad, shares };
  });
  check(`de ${r.banners} banners keren uit wat hun tabel belooft`, r.bad.length === 0,
    r.bad.length ? r.bad.slice(0, 4).join(' | ') : r.shares.join('  ·  '));
}

/* ---------------- no data describes behaviour nobody implements ----------------
 * Two bugs this build were the same shape: a field in the data that reads
 * like a feature and that no code ever looks at. OUROBOROS's passive and the
 * vampiric elite's heal aura both sat there for the whole build. Neither
 * threw, neither showed up in a playthrough, and both were advertised in the
 * UI. So sweep every data surface for fields nothing reads.
 *
 * Searches for *property access* (`.field`), not for the bare name: a
 * definition is `field:`, so it can never match itself and mark itself read. */
{
  const r = await page.evaluate(async () => {
    const grab = (f) => fetch(f).then((r2) => r2.text());
    const READERS = [
      './src/game/RunScene.js', './src/game/Weapons.js', './src/game/Ults.js',
      './src/game/WaveDirector.js', './src/art/entities.js', './src/systems/Loadout.js',
      './src/systems/Bestiary.js', './src/ui/screens/Bestiary.js',
      './src/data/enemies.js', './src/data/cards.js',
    ];
    const code = (await Promise.all(READERS.map(grab))).join('\n');

    const enemies = await grab('./src/data/enemies.js');
    const cards = await grab('./src/data/cards.js');
    const fields = new Set();
    for (const m of enemies.matchAll(/^ {4}(\w+):/gm)) fields.add(m[1]);
    for (const m of enemies.matchAll(/(gun|charge|trail|splitInto|minions):\s*\{([^}]*)\}/g)) {
      for (const f of m[2].matchAll(/(\w+):/g)) fields.add(f[1]);
    }
    const bag = cards.slice(cards.indexOf('export function blankMods'));
    for (const m of bag.matchAll(/^ {4}(\w+):/gm)) fields.add(m[1]);

    // Presentation only — nothing in the simulation should read these.
    const COSMETIC = new Set(['name', 'desc', 'color', 'color2', 'icon', 'subtitle',
                              'id', 'sprite', 'note', 'tag', 'form', 'at', 'pattern']);
    const dead = [...fields].filter((f) => !COSMETIC.has(f) &&
      !new RegExp(`\\.${f}\\b`).test(code));
    return { dead, checked: fields.size };
  });
  check(`alle ${r.checked} datavelden worden ergens gelezen`, r.dead.length === 0,
    r.dead.slice(0, 6).join(', '));
}

/* ---------------- every elite modifier is read ----------------
 * `healAura: true` sat in the data for the whole build and nothing read it,
 * while the bestiary screen advertised it. Same class as the passives: data
 * that describes behaviour nobody implements. */
{
  await ensureRun(page);
  const r = await page.evaluate(async () => {
    const { ELITE_MODS } = await import('./src/data/enemies.js');
    const sources = await Promise.all(
      ['./src/game/RunScene.js', './src/game/WaveDirector.js']
        .map((f) => fetch(f).then((r2) => r2.text())));
    const code = sources.join('\n');
    const bad = [];
    for (const [key, mod] of Object.entries(ELITE_MODS)) {
      for (const field of Object.keys(mod)) {
        if (['name', 'color'].includes(field)) continue;
        if (!new RegExp(`\\b${field}\\b`).test(code)) bad.push(`${key}.${field} wordt nergens gelezen`);
      }
    }

    // And the heal actually heals: hurt a neighbour, wait for a pulse.
    const run = globalThis.ASTRAFALL.scene;
    run.enemies.clear();
    const healer = run.director.spawnAt('tank', 300, 300, { elite: 'vampiric' });
    const hurt = run.director.spawnAt('drone', 340, 320);
    if (!healer || !hurt) bad.push('kon geen elite + buur spawnen');
    else {
      // Tough enough to still be there when the pulse lands — otherwise the
      // check passes because the patient died, which proves nothing.
      hurt.maxHp = 50000;
      hurt.hp = 10000;
      healer.hp = healer.maxHp = 50000;
      healer.auraT = 0.05;
      return { bad, before: hurt.hp, id: hurt.id };
    }
    return { bad, before: -1, id: -1 };
  });
  await page.waitForTimeout(1200);
  const after = await page.evaluate((id) => {
    const run = globalThis.ASTRAFALL.scene;
    let hp = -1;
    run.enemies.each((e) => { if (e.id === id) hp = e.hp; });
    return hp;
  }, r.id);
  check('elke elite-modifier wordt gelezen, en de heal geneest echt',
    r.bad.length === 0 && after > r.before,
    r.bad.slice(0, 3).join(' | ') || `hp ${r.before} → ${after}`);
}

/* ---------------- every passive is kept by something ----------------
 * A passive key with no implementation is a character whose whole selling
 * point is a lie, and nothing throws. Three of them are honestly kept by the
 * weapon config instead of by a `passiveKey` branch — those are listed here
 * explicitly, so the exception is visible rather than invisible. */
{
  const r = await page.evaluate(async () => {
    const { ASTRA } = await import('./src/data/astra.js');
    // Kept by the weapon rather than by a code branch: burn, slow and the
    // beam's own heat ramp. Each one is verified below against the weapon.
    const BY_WEAPON = {
      ignite: (w) => w.burn > 0,
      flow: (w) => w.slow > 0,
      daybreak: (w) => w.type === 'beam',
    };
    const sources = await Promise.all(
      ['./src/game/RunScene.js', './src/game/Weapons.js', './src/game/Ults.js']
        .map((f) => fetch(f).then((r2) => r2.text())));
    const code = sources.join('\n');
    const bad = [];
    for (const a of ASTRA) {
      const k = a.passive?.key;
      if (!k) { bad.push(`${a.id}: geen passive`); continue; }
      if (new RegExp(`['\`]${k}['\`]`).test(code)) continue;
      const via = BY_WEAPON[k];
      if (!via) bad.push(`${a.id}: passive "${k}" wordt nergens waargemaakt`);
      else if (!via(a.weapon)) bad.push(`${a.id}: "${k}" zou uit het wapen komen, maar dat klopt niet`);
    }
    return { bad, count: ASTRA.length };
  });
  check(`elke passive van de ${r.count} Astra wordt waargemaakt`, r.bad.length === 0,
    r.bad.slice(0, 4).join(' | '));
}

/* ---------------- new cards actually land ----------------
 * The NaN sweep proves a card applies without breaking the bag; it does not
 * prove the bag is ever read. Three of these were dead on the starter Astra
 * because `passiveDamageMul` returned early for its passive, and nothing
 * noticed. So check the effect, not the field. */
{
  await ensureRun(page);
  const r = await page.evaluate(async () => {
    const { getCard } = await import('./src/data/cards.js');
    const run = globalThis.ASTRAFALL.scene;
    const bad = [];
    for (const id of ['longshot', 'prismlens', 'retaliate', 'crescendo', 'overwhelm', 'ultrefund']) {
      const c = getCard(id);
      if (!c) { bad.push(`${id} bestaat niet`); continue; }
      for (let i = 0; i < c.max; i++) c.apply(run.mods, run.cardStacks ?? {});
    }
    run.stats = run.resolveStats();

    if (!(run.mods.bulletLife > 1)) bad.push('longshot doet niets');
    if (!(run.mods.prismValue > 1)) bad.push('prismlens doet niets');

    // Crescendo has to move the shot multiplier with time untouched.
    run.untouchedT = 0;
    const cold = run.passiveDamageMul;
    run.untouchedT = 8;
    const hot = run.passiveDamageMul;
    if (!(hot > cold * 1.2)) bad.push(`crescendo beweegt niet: ${cold} → ${hot}`);
    run.untouchedT = 0;

    // Overmacht has to move it with enemies on screen. Clear first: it caps,
    // and a field that is already full proves nothing.
    run.enemies.clear();
    const empty = run.passiveDamageMul;
    for (let i = 0; i < 6; i++) run.director.spawnAt('swarm', 100 + i * 40, 200);
    const full = run.passiveDamageMul;
    if (!(full > empty)) bad.push(`overmacht beweegt niet: ${empty} → ${full}`);

    // TERUGSLAG has to leave part of the bar.
    run.ult = run.ultMax;
    run.tryUlt();
    if (!(run.ult > 0)) bad.push('ultrefund geeft niets terug');

    // Weerslag has to put a shockwave on the field.
    const before = run.hazards.count;
    run.player.invuln = 0;
    run.hitPlayer(1, run.player.x, run.player.y - 20);
    if (run.hazards.count <= before) bad.push('weerslag zet geen schokgolf');
    run.player.invuln = 1e6;
    return { bad };
  });
  check('de nieuwe kaarten hebben echt effect', r.bad.length === 0, r.bad.join(' | '));
}

/* ---------------- anomalies ----------------
 * They ride on multipliers the run already applies, so a broken one silently
 * does nothing rather than throwing. Drive every single one and check the
 * numbers actually move — and that the draw stays seeded, because the daily
 * seed stops being a fair comparison the moment it does not. */
{
  const r = await page.evaluate(async () => {
    const { ANOMALIES, blankMods, foldMods, getAnomaly } = await import('./src/data/anomalies.js');
    const { RNG } = await import('./src/core/RNG.js');
    const bad = [];

    const neutral = blankMods();
    for (const a of ANOMALIES) {
      if (!a.name || !a.desc || !a.icon || !a.color) bad.push(`${a.id}: mist presentatie`);
      if (getAnomaly(a.id) !== a) bad.push(`${a.id}: niet opzoekbaar`);
      const m = foldMods([a]);
      let moved = 0;
      for (const k in neutral) {
        if (!Number.isFinite(m[k])) { bad.push(`${a.id}.${k} = ${m[k]}`); continue; }
        if (m[k] !== neutral[k]) moved++;
        if (k !== 'grantHp' && m[k] <= 0) bad.push(`${a.id}.${k} <= 0`);
      }
      if (!moved) bad.push(`${a.id} verandert niets`);
      for (const k in a.mods) if (!(k in neutral)) bad.push(`${a.id}: onbekende mod "${k}"`);
    }

    // Half of them have to be on the player's side, or it is just a tax.
    const boons = ANOMALIES.filter((a) => a.boon).length;
    if (boons < 2) bad.push(`maar ${boons} gunstige anomalieën`);

    // Stacking two must compose, not overwrite.
    const both = foldMods([ANOMALIES[0], ANOMALIES[1]]);
    for (const k in neutral) {
      const want = foldMods([ANOMALIES[0]])[k] * foldMods([ANOMALIES[1]])[k] / (k === 'grantHp' ? 1 : 1);
      if (k !== 'grantHp' && Math.abs(both[k] - want) > 1e-9) bad.push(`stapelen klopt niet voor ${k}`);
    }

    // Seeded draw: same seed, same order, and never the same one twice.
    const draw = () => {
      const rng = new RNG('run|ANOMCHECK');
      const taken = new Set(); const out = [];
      for (let i = 0; i < ANOMALIES.length; i++) {
        const pool = ANOMALIES.filter((a) => !taken.has(a.id));
        const a = rng.pick(pool); taken.add(a.id); out.push(a.id);
      }
      return out;
    };
    const a1 = draw(), a2 = draw();
    if (a1.join() !== a2.join()) bad.push('trekking is niet deterministisch');
    if (new Set(a1).size !== ANOMALIES.length) bad.push('trekking herhaalt zichzelf');
    return { bad, count: ANOMALIES.length, boons };
  });
  check(`alle ${r.count} anomalieën veranderen echt iets en trekken gezaaid`,
    r.bad.length === 0, r.bad.slice(0, 4).join(' | '));
}

/* ---------------- loadout, skins and rewards ----------------
 * Three formula-driven systems with no UI of their own to fail in. A support
 * bonus that inverts, a skin that unlocks itself, or a reward that goes
 * negative would all ship silently. */
{
  const r = await page.evaluate(async () => {
    const { save } = await import('./src/core/Save.js');
    const { ASTRA, getAstra } = await import('./src/data/astra.js');
    const L = await import('./src/systems/Loadout.js');
    const S = await import('./src/systems/Skins.js');
    const { SKINS } = await import('./src/data/skins.js');
    const { runRewards } = await import('./src/systems/Economy.js');
    const bad = [];

    // --- support bonus: monotonic in rarity and in stars, never negative ---
    const byRarity = [0, 1, 2, 3, 4].map((tier) => {
      const a = ASTRA.find((x) => x.rarity === tier);
      return a ? L.supportBonus(a, 1).damage : null;
    }).filter((v) => v !== null);
    for (let i = 1; i < byRarity.length; i++) {
      if (!(byRarity[i] > byRarity[i - 1])) bad.push(`steunbonus stijgt niet met zeldzaamheid: ${byRarity}`);
    }
    const a5 = ASTRA.find((x) => x.rarity === 4) ?? ASTRA[0];
    for (let s = 2; s <= 5; s++) {
      if (!(L.supportBonus(a5, s).damage > L.supportBonus(a5, s - 1).damage)) {
        bad.push(`steunbonus stijgt niet van ster ${s - 1} naar ${s}`);
      }
    }
    for (const a of ASTRA) {
      const b = L.supportBonus(a, 5);
      for (const k of ['damage', 'fireRate', 'magnet', 'ultCharge', 'elementPower']) {
        if (!Number.isFinite(b[k]) || b[k] < 0) bad.push(`${a.id}.${k} = ${b[k]}`);
      }
    }
    if (L.supportBonus(null) !== null) bad.push('supportBonus(null) geeft geen null');

    // --- the lead Astra can never also sit in a support slot ---
    save.profile.equipped = ASTRA[0].id;
    save.profile.loadout = [ASTRA[0].id, ASTRA[1].id];
    L.clearLeadFromSupports();
    if (L.supports().includes(save.profile.equipped)) bad.push('leider staat nog in een steunslot');

    // --- skins: unlocks are derived, so a wipe must relock them ---
    save.profile.achievements = {};
    save.profile.pass = null;
    save.profile.entitlements = {};
    const lockedNow = SKINS.filter((s) => !S.isUnlocked(s)).length;
    if (lockedNow !== SKINS.length - 1) bad.push(`${SKINS.length - lockedNow} skins vrij op een leeg profiel`);
    save.profile.skin = SKINS[SKINS.length - 1].id;         // pretend we own a locked one
    if (S.currentSkinId() !== 'standard') bad.push('een vergrendelde skin blijft actief');
    save.profile.achievements = { wave_15: true };
    const voidSkin = SKINS.find((s) => s.unlock.type === 'achievement' && s.unlock.id === 'wave_15');
    if (voidSkin && !S.isUnlocked(voidSkin)) bad.push('prestatie ontgrendelt de skin niet');
    // Een vergrendelde skin die alleen "Prestatie" zegt is een deur zonder
    // sleutelgat. Het doel staat in de data, dus het moet ook bestaan.
    const { ACHIEVEMENTS } = await import('./src/systems/Achievements.js');
    const { unlockLabel } = await import('./src/data/skins.js');
    for (const sk of SKINS) {
      if (sk.unlock.type !== 'achievement') continue;
      const goal = ACHIEVEMENTS.find((a) => a.id === sk.unlock.id);
      if (!goal) { bad.push(`${sk.id}: verwijst naar prestatie ${sk.unlock.id} die niet bestaat`); continue; }
      if (!unlockLabel(sk, goal.desc).includes(goal.desc)) bad.push(`${sk.id}: noemt zijn doel niet`);
    }

    // --- run rewards: never negative, never NaN, more run pays more ---
    const zero = runRewards({});
    for (const k of ['stardust', 'shards', 'cores', 'xp']) {
      if (!Number.isFinite(zero[k]) || zero[k] < 0) bad.push(`lege run: ${k}=${zero[k]}`);
    }
    const small = runRewards({ score: 1000, wave: 2, time: 20, kills: 30 });
    const big = runRewards({ score: 900000, wave: 18, time: 240, kills: 1200, bossesKilled: 3 });
    if (!(big.stardust > small.stardust && big.xp > small.xp)) bad.push('grotere run betaalt niet meer');
    if (!(runRewards({ score: 1000, wave: 2, time: 20, kills: 30, isDaily: true }).stardust > small.stardust)) {
      bad.push('dagelijkse bonus doet niets');
    }
    return { bad, skins: SKINS.length };
  });
  check('loadout, skins en runbeloningen gedragen zich', r.bad.length === 0,
    r.bad.slice(0, 4).join(' | '));
}

/* ---------------- every achievement predicate, both extremes ----------------
 * `list()` wraps each predicate in try/catch and reports 0 on a throw, so a
 * broken goal looks exactly like an unearned one — forever. Evaluate all of
 * them against an empty profile and a maxed one, and fail on anything that is
 * not a finite 0..1. */
{
  const r = await page.evaluate(async () => {
    const { save } = await import('./src/core/Save.js');
    const { ASTRA } = await import('./src/data/astra.js');
    const { ACHIEVEMENTS, list, summary, evaluate } = await import('./src/systems/Achievements.js');
    const bad = [];

    const sweep = (label) => {
      for (const a of ACHIEVEMENTS) {
        let v;
        try { v = a.progress(makeCtx()); }
        catch (e) { bad.push(`${label}/${a.id}: ${e.message}`); continue; }
        if (!Number.isFinite(v) || v < 0 || v > 1) bad.push(`${label}/${a.id}: ${v}`);
        if (!a.name || !a.desc || !a.group) bad.push(`${label}/${a.id}: mist tekst`);
      }
    };
    // The module's own ctx builder isn't exported; rebuild the shape it uses.
    const makeCtx = () => {
      const p = save.profile;
      const owned = Object.keys(p.collection).length;
      const byTier = [0, 0, 0, 0, 0];
      for (const id in p.collection) {
        const a = ASTRA.find((x) => x.id === id);
        if (a) byTier[a.rarity]++;
      }
      return { p, run: lastRun, owned, byTier };
    };

    let lastRun = null;
    save.profile.collection = {};
    save.profile.bestiary = {};
    sweep('leeg');

    // Maxed: every Astra at ★5, every stat huge, every enemy met, a huge run.
    for (const a of ASTRA) save.profile.collection[a.id] = { stars: 5, dupes: 99, obtainedAt: 1, uses: 9 };
    Object.assign(save.profile.stats, {
      runs: 9999, kills: 1e6, deaths: 500, bestScore: 5e6, bestWave: 40, bestCombo: 500,
      bestTime: 3600, totalTime: 1e6, totalScore: 1e8, pulls: 5000, ssrCount: 90,
      urCount: 12, cardsPicked: 9000, bossesKilled: 800, ultsFired: 4000,
    });
    save.profile.daily.streak = 60;
    lastRun = { score: 5e6, wave: 40, kills: 5000, time: 900, maxCombo: 400,
                level: 60, hitsTaken: 0, ultsFired: 0, bossesKilled: 8,
                astraId: 'pip', cards: [], died: false };
    sweep('vol');

    const sum = summary();
    return { bad, count: ACHIEVEMENTS.length, done: sum.done, listed: list().length };
  });
  check(`alle ${r.count} prestaties evalueren tot een geldig getal`, r.bad.length === 0,
    r.bad.slice(0, 4).join(' | '));
  check('de prestatielijst is compleet', r.listed === r.count, `${r.listed}/${r.count}`);
}

/* ---------------- achievement text matches its predicate ---------------- */
{
  const r = await page.evaluate(async () => {
    const { ACHIEVEMENTS } = await import('./src/systems/Achievements.js');
    // A goal is a contract with a number in it. The predicate is the only place
    // that number lives, so the line has to quote it — a doel that says "golf
    // 15" and tests for 12 pops early, and one that tests for 20 never pops at
    // all. Neither throws, and neither is visible until someone complains.
    const WORDS = {
      één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8,
      negen: 9, tien: 10, twaalf: 12, twintig: 20, vijftig: 50, honderd: 100,
    };
    const bad = [];
    for (const a of ACHIEVEMENTS) {
      const src = String(a.progress);
      // "100 000 punten" is one number to a reader; join the groups first.
      const norm = a.desc.replace(/(\d)[\s.](?=\d{3}\b)/g, '$1');
      const claimed = new Set();
      for (const m of norm.matchAll(/(\d+(?:[.,]\d+)?)/g)) claimed.add(parseFloat(m[1].replace(',', '.')));
      for (const w in WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(a.desc)) claimed.add(WORDS[w]);
      const literals = new Set([...src.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1])));
      const missing = [...claimed].filter((n) => !literals.has(n));
      if (missing.length) bad.push(`${a.id}: ${missing.join(',')} staat niet in de voorwaarde — "${a.desc}"`);
      if (!a.desc?.trim()) bad.push(`${a.id}: geen omschrijving`);
      if (!a.reward || !Object.values(a.reward).some((v) => v > 0)) bad.push(`${a.id}: beloont niets`);
    }
    return { count: ACHIEVEMENTS.length, bad };
  });
  check(`elk getal in de ${r.count} prestatieteksten staat ook in de voorwaarde`,
    r.bad.length === 0, r.bad.slice(0, 5).join(' | '));
}

/* ---------------- dailies: streak, quests, trial, reset ---------------- */
{
  const r = await page.evaluate(async () => {
    const { save } = await import('./src/core/Save.js');
    const D = await import('./src/systems/Daily.js');
    const bad = [];

    save.profile.daily = { streak: 0, lastClaimDay: null, bestStreak: 0, quests: null,
                           questDay: null, freePullDay: null, trialDay: null, seedScores: {} };

    if (D.streakState().claimedToday) bad.push('verse dag telt al als geclaimd');
    const dust0 = save.profile.currency.stardust;
    if (!D.claimDaily().ok) bad.push('eerste claim mislukt');
    if (save.profile.currency.stardust <= dust0) bad.push('claim betaalde niets uit');
    if (D.claimDaily().ok) bad.push('tweede claim op dezelfde dag lukte wel');
    if (save.profile.daily.streak !== 1) bad.push(`streak ${save.profile.daily.streak} na één claim`);

    const q = D.todaysQuests();
    if (q.length !== 3) bad.push(`${q.length} opdrachten in plaats van 3`);
    if (q.some((x) => !x.text || !x.target || !x.bag)) bad.push('opdracht mist tekst, doel of beloning');
    if (new Set(q.map((x) => x.id)).size !== q.length) bad.push('dubbele opdracht op één dag');
    // Two of the nine are cumulative (three runs, ten cards), so a single run
    // can't finish the set no matter how big it is — feed it several.
    for (let i = 0; i < 5; i++) {
      D.progressQuests({ score: 5e6, wave: 40, kills: 5000, time: 900, maxCombo: 400,
                         level: 60, bossesKilled: 8, ultsFired: 40, cards: [1, 2, 3],
                         isDaily: true, died: true });
    }
    const q2 = D.todaysQuests();
    const ready = q2.filter((x) => x.progress >= x.target).length;
    if (ready !== 3) bad.push(`${ready}/3 opdrachten klaar na vijf maximale runs`);
    for (const x of q2) if (!D.claimQuest(x.id).ok) bad.push(`opdracht ${x.id} niet claimbaar`);
    if (D.claimQuest(q2[0].id).ok) bad.push('opdracht twee keer claimbaar');
    if (!D.questsComplete()) bad.push('questsComplete blijft false na alles claimen');

    if (!D.freePullAvailable()) bad.push('gratis pull niet beschikbaar op een verse dag');
    D.consumeFreePull();
    if (D.freePullAvailable()) bad.push('gratis pull bleef beschikbaar');

    if (D.trialUsed()) bad.push('proefvlucht al gebruikt op een verse dag');
    // Two branches, and the second one is deliberate: with an empty collection
    // the trial must be something you do not own, and with a full one it
    // degrades to a high-star loan of an SSR+ rather than disappearing.
    const full = save.profile.collection;
    save.profile.collection = {};
    const t1 = D.trialAstra();
    if (!t1) bad.push('geen proef-Astra bij een lege collectie');
    else if (save.profile.collection[t1.id]) bad.push('proef-Astra is er een die je al bezit');
    else if (t1.rarity < 2) bad.push(`proef-Astra is maar rarity ${t1.rarity}`);
    save.profile.collection = full;
    const t2 = D.trialAstra();
    if (!t2 || t2.rarity < 3) bad.push('volle collectie geeft geen SSR+ leen-Astra');
    D.consumeTrial();
    if (!D.trialUsed()) bad.push('proefvlucht niet verbruikt');

    const seed = D.dailySeed();
    if (!seed || seed !== D.dailySeed()) bad.push('dagelijkse seed is niet stabiel');
    const ms = D.msUntilReset();
    if (!(ms > 0 && ms <= 24 * 3600 * 1000)) bad.push(`reset over ${ms}ms`);
    return { bad, seed, quests: D.todaysQuests().map((x) => x.id) };
  });
  check('dagelijkse laag: streak, opdrachten, gratis pull, proefvlucht en seed',
    r.bad.length === 0, r.bad.slice(0, 4).join(' | '));
}

/* ---------------- starpass: the promise it makes ----------------
 * The pass promises three things in writing — the free track runs to the end,
 * buying late pays out retroactively, and nothing pays twice. All three are
 * economy-critical and none of them throws when broken. */
{
  const r = await page.evaluate(async () => {
    const { save } = await import('./src/core/Save.js');
    const P = await import('./src/systems/Starpass.js');
    save.profile.pass = null;
    save.profile.entitlements = {};
    const out = { fresh: P.pending().total };

    for (let i = 0; i < 400 && P.progress().tier < 15; i++) {
      P.addRunXp({ score: 200000, wave: 12, kills: 500, time: 200, bossesKilled: 2 });
    }
    out.tier = P.progress().tier;

    const dust0 = save.profile.currency.stardust;
    out.freeClaimed = P.claimAll().count;
    out.freePaid = save.profile.currency.stardust - dust0;
    out.afterFree = P.pending().total;

    // Buying the pass at tier 15 must make all fifteen premium tiers claimable.
    save.profile.entitlements.starpass_season = { season: P.SEASON.id, at: 1 };
    out.premiumPending = P.pending().total;
    out.premiumClaimed = P.claimAll().count;

    // And claiming again must pay nothing.
    const dust1 = save.profile.currency.stardust;
    P.claimAll();
    out.doublePaid = save.profile.currency.stardust - dust1;

    for (let i = 0; i < 300; i++) P.addRunXp({ score: 400000, wave: 20, kills: 900, time: 300, bossesKilled: 4 });
    out.maxTier = P.progress().tier;
    out.tiers = P.TIERS.length;
    return out;
  });
  check('starpass: gratis spoor keert uit tot waar je staat',
    r.fresh === 0 && r.tier === 15 && r.freeClaimed === 15 && r.freePaid > 0 && r.afterFree === 0,
    JSON.stringify({ tier: r.tier, claimed: r.freeClaimed, paid: r.freePaid }));
  check('starpass: later kopen keert met terugwerkende kracht uit',
    r.premiumPending === 15 && r.premiumClaimed === 15, `${r.premiumClaimed} van ${r.premiumPending}`);
  check('starpass: twee keer ophalen betaalt niet twee keer', r.doublePaid === 0, `+${r.doublePaid}`);
  check('starpass: tier stopt bij het einde van de tabel', r.maxTier === r.tiers,
    `${r.maxTier}/${r.tiers}`);
}

/* ---------------- music follows the screen ----------------
 * Five tracks exist; three of them were only reachable by accident. The boss
 * track never handed back, so every wave after the first boss sounded like a
 * boss fight, and the summon screen — the one where you decide to spend —
 * played the home track. None of that throws, so nothing caught it. */
{
  await ensureRun(page);
  const seen = [];
  const track = () => page.evaluate(async () => (await import('./src/core/Audio.js')).Music.trackName);

  await page.evaluate(async () => {
    const { Music } = await import('./src/core/Audio.js');
    Music.start('menu');
  });
  seen.push(['menu', await track()]);

  await ensureRun(page);
  await page.evaluate(async () => {
    const { BOSSES } = await import('./src/data/enemies.js');
    const run = globalThis.ASTRAFALL.scene;
    run.enemies.clear();
    run.onBossWave(BOSSES[0]);
  });
  seen.push(['boss', await track()]);

  await page.evaluate(() => {
    const run = globalThis.ASTRAFALL.scene;
    if (run.bossRef) run.killEnemy(run.bossRef);
  });
  await page.waitForTimeout(2200);
  seen.push(['run', await track()]);

  const wrong = seen.filter(([want, got]) => want !== got);
  check('muziek volgt het scherm en geeft de bazentrack terug',
    wrong.length === 0, seen.map(([w, g]) => `${w}→${g}`).join(' '));
}

/* ---------------- bestiary: marks match behaviour ----------------
 * The whole point of the role marks is that they cannot lie: the sprite is
 * drawn from the archetype's own definition. That only holds while the two
 * agree, so check every archetype both ways — every gun has a barrel, and
 * nothing without a gun claims one. */
{
  const r = await page.evaluate(async () => {
    const { ENEMY, BOSSES } = await import('./src/data/enemies.js');
    const { marksFor } = await import('./src/art/entities.js');
    const A = globalThis.ASTRAFALL.Assets;
    const wrong = [];
    const ids = new Set();
    for (const id in ENEMY) {
      const def = ENEMY[id];
      const marks = marksFor(def);
      if (!!def.gun !== marks.includes('barrel')) wrong.push(`${id}: gun/barrel`);
      if ((def.ai === 'charge') !== marks.includes('lance')) wrong.push(`${id}: charge/lance`);
      if (!!def.splitInto !== marks.includes('seam')) wrong.push(`${id}: split/seam`);
      if (!A.has(def.sprite)) wrong.push(`${id}: geen sprite ${def.sprite}`);
      if (!def.desc) wrong.push(`${id}: geen omschrijving`);
      ids.add(def.sprite);
    }
    for (const b of BOSSES) if (!A.has(b.sprite)) wrong.push(`${b.id}: geen sprite`);
    return { count: Object.keys(ENEMY).length, unique: ids.size, wrong };
  });
  check(`alle ${r.count} vijanden hebben een eigen sprite`, r.unique === r.count,
    `${r.unique} unieke keys voor ${r.count} archetypes`);
  check('rolmarkeringen komen overeen met het gedrag', r.wrong.length === 0, r.wrong.join(' | '));
}

/* ---------------- bestiary screen renders every row ---------------- */
{
  const r = await page.evaluate(async () => {
    const { save } = await import('./src/core/Save.js');
    save.profile.bestiary = { drone: { seen: 9, kills: 8 }, 'boss/warden': { seen: 2, kills: 1 } };
    const { bestiaryProgress, enemyRows, bossRows } = await import('./src/systems/Bestiary.js');
    const pr = bestiaryProgress();
    const rows = [...enemyRows(), ...bossRows()];
    return { have: pr.have, total: pr.total, rows: rows.length, named: rows.every((x) => x.def.name) };
  });
  check('bestiarium telt ontdekkingen en kent elke rij', r.have === 2 && r.total === r.rows && r.named,
    `${r.have}/${r.total} ontdekt, ${r.rows} rijen`);
}

/* ---------------- rank + share card ----------------
 * The card is the artifact that actually leaves the phone, so it has to
 * render at full size for any run — including a zero-score one, which is what
 * a first-time player who dies in wave one will try to share. */
{
  const r = await page.evaluate(async () => {
    const { RANKS, rankFor } = await import('./src/systems/Rank.js');
    const { renderShareCard } = await import('./src/systems/Share.js');
    const bad = [];

    // Monotonic, and every threshold lands on its own letter.
    let prev = -1;
    for (const t of RANKS) {
      const got = rankFor(t.at).key;
      if (got !== t.key) bad.push(`${t.at} → ${got}, verwacht ${t.key}`);
      if (t.at <= prev) bad.push(`drempel ${t.at} niet oplopend`);
      prev = t.at;
    }
    if (rankFor(0).key !== RANKS[0].key) bad.push('score 0 valt niet in de laagste rang');
    if (rankFor(1e12).next !== null) bad.push('hoogste rang heeft nog een volgende');

    // Cards for the extremes.
    const sizes = [];
    for (const run of [
      { score: 0, wave: 1, kills: 0, time: 4, maxCombo: 0, astraId: 'pip' },
      { score: 1500000, wave: 22, kills: 2000, time: 300, maxCombo: 140,
        astraId: 'kairos', seed: 'ABC123', personalBest: true,
        // Every anomaly at once: the chip row has to survive more of them
        // than the card is ever asked to show.
        anomalies: (await import('./src/data/anomalies.js')).ANOMALIES.map((a) => a.id) },
    ]) {
      const { canvas, blob } = await renderShareCard(run);
      sizes.push(`${canvas.width}x${canvas.height}:${blob ? blob.size > 1000 : false}`);
    }
    // The collection card too, at both extremes: nothing owned and all of it.
    const { save } = await import('./src/core/Save.js');
    const { ASTRA } = await import('./src/data/astra.js');
    const { renderCollectionCard } = await import('./src/systems/Share.js');
    const coll = [];
    for (const own of [false, true]) {
      save.profile.collection = {};
      if (own) for (const a of ASTRA) save.profile.collection[a.id] = { stars: 5, dupes: 9, obtainedAt: 1, uses: 1 };
      const c = await renderCollectionCard();
      coll.push(`${c.canvas.width}x${c.canvas.height}:${c.blob ? c.blob.size > 1000 : false}`);
    }
    return { bad, sizes, coll, tiers: RANKS.length };
  });
  check(`${r.tiers} rangen lopen op en kloppen op hun drempel`, r.bad.length === 0, r.bad.join(' | '));
  check('sharekaart rendert voor een lege én een maximale run',
    r.sizes.every((s) => s === '1080x1920:true'), r.sizes.join(' | '));
  check('verzamelkaart rendert leeg én vol', r.coll.every((s) => s === '1080x1920:true'),
    r.coll.join(' | '));
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
