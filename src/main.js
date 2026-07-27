/**
 * main.js — bootstrap.
 *
 * Wires the engine, the art registry, the scenes and the UI together, then gets
 * out of the way. Everything below is composition; no game logic lives here.
 */

import { Game } from './core/Game.js';
import { bus, EV } from './core/Events.js';
import { save } from './core/Save.js';
import { engine, Music, Sfx } from './core/Audio.js';
import { setHaptics } from './core/Input.js';
import Assets from './core/AssetRegistry.js';
import { randomSeedCode, normalizeSeedCode } from './core/RNG.js';

import { registerAstraArt } from './art/astra.js';
import { registerEntityArt } from './art/entities.js';

import { RunScene } from './game/RunScene.js';
import { MenuScene } from './game/MenuScene.js';

import { Router } from './ui/Router.js';
import { HUD } from './ui/HUD.js';
import { Toasts } from './ui/Toasts.js';
import { CardPicker } from './ui/CardPicker.js';
import { Onboarding, welcomeSheet } from './ui/Onboarding.js';
import { HomeScreen } from './ui/screens/Home.js';
import { SummonScreen } from './ui/screens/Summon.js';
import { CollectionScreen } from './ui/screens/Collection.js';
import { ShopScreen } from './ui/screens/Shop.js';
import { ResultsScreen } from './ui/screens/Results.js';
import { SettingsScreen } from './ui/screens/Settings.js';

import { commitRun } from './systems/Economy.js';
import { progressQuests } from './systems/Daily.js';
import { evaluate as evaluateAchievements } from './systems/Achievements.js';
import { readSeedFromUrl, clearSeedFromUrl, shareRun } from './systems/Share.js';
import { getAstra, STARTER_ID } from './data/astra.js';

/* ============================================================
   BOOT
   ============================================================ */

const bootEl = document.getElementById('boot');
const bootBar = document.getElementById('bootBar');
const bootHint = document.getElementById('bootHint');

const BOOT_STEPS = [
  ['sterrenkaart laden', 12],
  ['Astra registreren', 34],
  ['audio kalibreren', 58],
  ['profiel herstellen', 78],
  ['de val voorbereiden', 94],
];

function bootProgress(pct, text) {
  if (bootBar) bootBar.style.width = pct + '%';
  if (text && bootHint) bootHint.textContent = text;
}

async function boot() {
  const t0 = performance.now();

  bootProgress(BOOT_STEPS[0][1], BOOT_STEPS[0][0]);
  await frame();

  /* ---- art ---- */
  bootProgress(BOOT_STEPS[1][1], BOOT_STEPS[1][0]);
  registerAstraArt();
  registerEntityArt();
  // If a real sprite atlas has been dropped in, use it. If not, the procedural
  // drawers registered above stay in charge and nothing else changes.
  await Assets.loadAtlas('./assets/sprites/core.json').catch(() => false);
  await frame();

  /* ---- audio ---- */
  bootProgress(BOOT_STEPS[2][1], BOOT_STEPS[2][0]);
  engine.bindUnlock();
  setHaptics(save.profile.settings.haptics);
  await frame();

  /* ---- profile ---- */
  bootProgress(BOOT_STEPS[3][1], BOOT_STEPS[3][0]);
  ensureStarter();
  await frame();

  /* ---- game ---- */
  bootProgress(BOOT_STEPS[4][1], BOOT_STEPS[4][0]);
  const app = createApp();
  await frame();

  bootProgress(100, 'klaar');
  document.getElementById('stage').hidden = false;

  // A boot that's too fast reads as broken; hold the logo for a beat.
  const elapsed = performance.now() - t0;
  await sleep(Math.max(0, 850 - elapsed));

  bootEl.dataset.done = '1';
  setTimeout(() => bootEl.remove(), 700);

  app.start();
  bus.emit(EV.BOOT_DONE);
}

/** Everyone starts with one Astra so the first run works immediately. */
function ensureStarter() {
  const p = save.profile;
  if (!Object.keys(p.collection).length) {
    p.collection[STARTER_ID] = {
      stars: 1, dupes: 0, echoes: 0, obtainedAt: Date.now(), uses: 0, favourite: false,
    };
    p.equipped = STARTER_ID;
    save.touch();
  }
  if (!p.equipped || !p.collection[p.equipped]) {
    p.equipped = Object.keys(p.collection)[0] ?? STARTER_ID;
    save.touch();
  }
}

/* ============================================================
   APP
   ============================================================ */

function createApp() {
  const canvas = document.getElementById('gameCanvas');
  const stage = document.getElementById('stage');
  const uiRoot = document.getElementById('ui');
  const hudRoot = document.getElementById('hud');
  const toastRoot = document.getElementById('toasts');

  const game = new Game({ canvas, stage, uiRoot });
  globalThis.__afGame = game;

  const toasts = new Toasts(toastRoot);
  const hud = new HUD(hudRoot, game);
  const cardPicker = new CardPicker(uiRoot);
  const onboarding = new Onboarding(uiRoot);
  game.onboarding = onboarding;

  /** Overlay root for things that must sit above the router (pull reveal). */
  const overlayRoot = document.createElement('div');
  overlayRoot.className = 'overlay-root';
  stage.appendChild(overlayRoot);

  let menuScene = null;
  let router = null;

  /* ---------- scenes ---------- */

  game.register('menu', (g) => {
    const scene = new MenuScene(g);
    menuScene = scene;
    return scene;
  });

  game.register('run', (g) => new RunScene(g));

  /* ---------- navigation helpers ---------- */

  const ctx = {
    game,
    get backdrop() { return menuScene; },
    overlayRoot,
    startRun,
    share: (o) => shareRun(o),
    go: (n, p) => router?.go(n, p),
    back: () => router?.back(),
  };

  function buildRouter() {
    router = new Router(uiRoot, ctx);
    router
      .register('home', HomeScreen)
      .register('summon', SummonScreen)
      .register('collection', CollectionScreen)
      .register('shop', ShopScreen)
      .register('results', ResultsScreen)
      .register('settings', SettingsScreen);
    router.mount();
    return router;
  }

  function toMenu(screen = 'home', params = {}) {
    game.go('menu');
    // The scene swap clears uiRoot, so the router must be rebuilt after it.
    requestAnimationFrame(() => {
      buildRouter().go(screen, { ...params, replace: true });
    });
  }

  function startRun(params = {}) {
    router?.destroy();
    router = null;
    hud.onPause = () => togglePause();
    hud.onUlt = () => runScene()?.tryUlt();
    cardPicker.resetRerolls();
    game.go('run', {
      astraId: params.astraId ?? save.profile.equipped ?? STARTER_ID,
      seed: params.seed ?? randomSeedCode(),
      daily: !!params.daily,
      // A trial flight loans an Astra the player does not own, at a fixed
      // star level, so both have to survive the hand-off to the scene.
      trial: !!params.trial,
      stars: params.stars,
    });
  }

  const runScene = () => (game.scene instanceof RunScene ? game.scene : null);

  /* ---------- pause ---------- */

  let pauseNode = null;
  function togglePause() {
    const run = runScene();
    if (!run) return;
    if (pauseNode) { closePause(); return; }
    game.pause('menu');
    pauseNode = buildPauseMenu();
    uiRoot.appendChild(pauseNode);
    Sfx.play('back');
  }
  function closePause() {
    pauseNode?.remove();
    pauseNode = null;
    game.input.reset();
    game.resume('menu');
  }
  function buildPauseMenu() {
    const wrap = document.createElement('div');
    wrap.className = 'pause';
    wrap.innerHTML = `
      <div class="pause__scrim"></div>
      <div class="pause__panel">
        <h2>Gepauzeerd</h2>
        <button class="btn btn--primary btn--lg btn--full" data-act="resume">
          <span class="btn__label"><span class="btn__main">Verder spelen</span></span></button>
        <button class="btn btn--ghost btn--md btn--full" data-act="restart">
          <span class="btn__label"><span class="btn__main">Opnieuw</span></span></button>
        <button class="btn btn--quiet btn--md btn--full" data-act="quit">
          <span class="btn__label"><span class="btn__main">Verlaat run</span></span></button>
      </div>`;
    wrap.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act && !e.target.closest('.pause__panel')) { closePause(); return; }
      if (act === 'resume') closePause();
      if (act === 'restart') {
        const run = runScene();
        const p = { astraId: run.astraId, seed: run.seed, daily: run.isDaily };
        closePause();
        startRun(p);
      }
      if (act === 'quit') {
        const run = runScene();
        closePause();
        run?.finish(false);
      }
    });
    return wrap;
  }

  /* ---------- run events ---------- */

  bus.on(EV.LEVEL_UP, ({ level, cards }) => {
    const run = runScene();
    if (!run) return;
    const show = (list) => cardPicker.open(list, {
      level, stacks: run.cardStacks,
      onPick: (c) => run.pickCard(c),
      onReroll: () => show(run.drawCards(3)),
    });
    show(cards);
  });

  // Safety net: the picker normally closes from its own callback, but the run
  // can also resolve a card by other means (tools, future auto-pick). If a card
  // is applied and the overlay is still up, it would trap the player.
  bus.on(EV.CARD_PICKED, () => cardPicker.close());

  bus.on(EV.RUN_END, (result) => {
    hud.hide();
    cardPicker.close();
    const { rewards, levels } = commitRun(result);
    progressQuests(result);
    evaluateAchievements(result);
    toMenu('results', { run: result, rewards, levels });
  });

  // Collection milestones can complete outside a run.
  bus.on(EV.GACHA_DONE, () => evaluateAchievements());
  bus.on(EV.ASTRA_NEW, () => evaluateAchievements());
  bus.on(EV.ASTRA_STAR, () => evaluateAchievements());

  bus.on(EV.SCENE_ENTER, (name) => {
    if (name === 'run') hud.show();
  });

  // Hardware back / escape.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (runScene()) togglePause();
    else router?.back();
  });

  /* ---------- fps counter ---------- */
  const fpsEl = document.createElement('div');
  fpsEl.className = 'fpsmeter';
  stage.appendChild(fpsEl);
  document.body.dataset.fps = save.profile.settings.showFps ? '1' : '0';
  setInterval(() => {
    if (document.body.dataset.fps !== '1') return;
    fpsEl.textContent = `${game.fps.toFixed(0)}fps · ${game.avgFrameCost.toFixed(1)}ms`;
  }, 500);

  /* ---------- entry point ---------- */

  return {
    start() {
      const urlSeed = readSeedFromUrl();
      const firstEver = !save.profile.flags.tutorialDone && save.profile.stats.runs === 0;
      // The loop must be running before the first scene swap, because the swap
      // is what clears the UI root — the router has to mount after it.
      game.start();
      toMenu('home');

      // A brand-new player gets one screen explaining the loop, then plays.
      if (firstEver && !urlSeed) {
        setTimeout(() => overlayRoot.appendChild(welcomeSheet()), 900);
      }
      if (urlSeed) {
        clearSeedFromUrl();
        const seed = normalizeSeedCode(urlSeed);
        setTimeout(() => {
          bus.emit(EV.TOAST, { text: `Uitdaging geladen: ${seed}`, tone: 'gold', ttl: 3000 });
          startRun({ seed });
        }, 700);
      }
    },
    game, toMenu, startRun,
  };
}

/* ============================================================
   UTIL
   ============================================================ */

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ============================================================
   PWA
   ============================================================ */

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      console.info('[pwa] service worker not registered:', e.message);
    });
  });
}

/* ============================================================
   ERROR SAFETY NET
   ============================================================ */

window.addEventListener('error', (e) => {
  console.error('[fatal]', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled]', e.reason);
});

boot().catch((err) => {
  console.error('[boot] failed', err);
  if (bootHint) {
    bootHint.textContent = 'opstarten mislukt — ververs de pagina';
    bootHint.style.color = '#f43f5e';
  }
});

// Expose for console tinkering during development.
globalThis.ASTRAFALL = {
  save, Assets, bus, EV, Music, Sfx,
  get game() { return globalThis.__afGame; },
  get scene() { return globalThis.__afGame?.scene; },
};
