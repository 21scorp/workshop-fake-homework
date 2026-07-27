/**
 * Home.js — the base screen.
 *
 * Everything above the fold answers one question: *what do I press to play?*
 * The equipped Astra is the hero because it's what the player pulled for, and
 * the daily seed sits directly under the play button because that's the loop we
 * most want people to enter.
 */

import { el, countTo, pulse } from '../dom.js';
import {
  currencyRail, playerStrip, button, statTile, iconButton, sheet, progressBar,
  astraCard, emptyState,
} from '../components/Chrome.js';
import { SpriteCanvas } from '../components/SpriteCanvas.js';
import { save } from '../../core/Save.js';
import { getAstra, STARTER_ID, astraSprite } from '../../data/astra.js';
import { RARITY_INFO, ELEMENT } from '../../data/constants.js';
import { abbrev, grouped, durationStr } from '../../core/Math2.js';
import {
  streakState, claimDaily, todaysQuests, claimQuest, dailySeed, dailyBest,
  msUntilReset, freePullAvailable, trialAstra, trialStars, trialUsed, consumeTrial,
} from '../../systems/Daily.js';
import { list as achievementList, summary as achievementSummary, GROUPS } from '../../systems/Achievements.js';
import { bestiaryProgress } from '../../systems/Bestiary.js';
import { collectionStats } from '../../systems/Gacha.js';
import { supports, setSupport, totals as supportTotals, supportBonus, SUPPORT_SLOTS } from '../../systems/Loadout.js';
import { ASTRA } from '../../data/astra.js';
import { SKINS, unlockLabel } from '../../data/skins.js';
import { isUnlocked, currentSkinId, setSkin, skinSummary } from '../../systems/Skins.js';
import { leaderboard } from '../../systems/Economy.js';
import { Sfx } from '../../core/Audio.js';
import { haptic } from '../../core/Input.js';
import { bus, EV } from '../../core/Events.js';

export function HomeScreen(ctx) {
  const p = save.profile;
  const astra = getAstra(p.equipped) ?? getAstra(STARTER_ID);
  const entry = p.collection[astra.id];
  const info = RARITY_INFO[astra.rarity];
  const elem = ELEMENT[astra.element];

  ctx.backdrop?.setAccent(astra.colors.primary, info.color);
  ctx.backdrop?.setIntensity(0);

  const seed = dailySeed();
  const best = dailyBest();
  const streak = streakState();
  const quests = todaysQuests();
  const questsReady = quests.filter((q) => !q.claimed && q.progress >= q.target).length;
  const cstats = collectionStats();
  const ach = achievementSummary();
  const bes = bestiaryProgress();
  const skins = skinSummary();

  /* ---------------- hero ---------------- */

  const heroSprite = new SpriteCanvas(astraSprite(astra, 'idle'), {
    size: 240,
    tint: astra.colors.primary,
    tint2: astra.colors.secondary,
    scale: 1.0,
    speed: 0.9,
  });

  const hero = el('div.hero', { style: { '--c': astra.colors.primary, '--c2': info.color } },
    el('div.hero__aura'),
    el('div.hero__ring'),
    el('div.hero__art', null, heroSprite.canvas),
    el('div.hero__meta', null,
      el('div.hero__rarity', { dataset: { r: info.key.toLowerCase() }, text: info.name.toUpperCase() }),
      el('h2.hero__name', { text: astra.name }),
      el('div.hero__title', { text: astra.title }),
      el('div.hero__tags', null,
        el('span.tag', { style: { '--c': elem.color } }, elem.icon, ' ', elem.name),
        el('span.tag.tag--stars', null,
          ...Array.from({ length: info.stars }, (_, i) =>
            el('span', { dataset: { on: i < (entry?.stars ?? 1) ? '1' : '0' }, text: '★' })),
        ),
      ),
    ),
    el('div.hero__actions', null,
      el('button.hero__swap', {
        onclick: () => { Sfx.play('tap'); haptic('light'); ctx.go('collection'); },
      }, '⇄ Wissel'),
      el('button.hero__swap', {
        onclick: () => { Sfx.play('tap'); haptic('light'); openSkins(); },
      }, `⬡ Romp ${skins.have}/${skins.total}`),
    ),
  );

  function openSkins() {
    const cur = currentSkinId();
    const list = el('div.skins', null, ...SKINS.map((sk) => {
      const un = isUnlocked(sk);
      return el('button.skin', {
        dataset: { on: sk.id === cur ? '1' : '0', locked: un ? '0' : '1' },
        style: { '--a': sk.hull[0], '--b': sk.hull[1], '--c': sk.hull[2], '--t': sk.trim },
        onclick: () => {
          if (!un) { Sfx.play('error'); bus.emit(EV.TOAST, { text: unlockLabel(sk), tone: 'info' }); return; }
          setSkin(sk.id);
          sh.close();
          ctx.go('home', { force: true, replace: true });
        },
      },
        el('div.skin__swatch'),
        el('div.skin__mid', null,
          el('div.skin__name', { text: sk.name }),
          el('div.skin__desc', { text: un ? sk.desc : unlockLabel(sk) }),
        ),
        sk.id === cur ? el('div.skin__on', { text: '✓' }) : (un ? null : el('div.skin__lock', { text: '🔒' })),
      );
    }));
    const sh = sheet('Rompafwerking', el('div', null,
      el('p.sheet__lead', { text: 'Alleen uiterlijk. Een beloning die een getal verandert maakt van de Starpass een machtsaankoop; een beloning die je schip anders laat staan in een clip is het jagen waard zonder het spel scheef te trekken.' }),
      list,
    ));
    node.appendChild(sh);
  }

  /* ---------------- play ---------------- */

  const playBtn = el('button.play', {
    onclick: () => {
      Sfx.play('confirm');
      haptic('medium');
      ctx.startRun({ astraId: astra.id });
    },
  },
    el('span.play__glow'),
    el('span.play__label', null,
      el('b', { text: 'SPEEL' }),
      el('i', { text: astra.name }),
    ),
    el('span.play__chev', { text: '▶' }),
  );

  /* ---------------- daily seed ---------------- */

  const dailyCard = el('div.dcard', null,
    el('div.dcard__top', null,
      el('div', null,
        el('div.dcard__eyebrow', { text: 'DAGELIJKSE SEED' }),
        el('div.dcard__seed', { text: seed }),
      ),
      el('div.dcard__timer', { text: durationStr(msUntilReset()) }),
    ),
    el('div.dcard__body', { text: 'Iedereen speelt vandaag exact dezelfde run. Verslaan je vrienden jouw score?' }),
    el('div.dcard__row', null,
      el('div.dcard__best', null,
        el('span', { text: 'Jouw beste' }),
        el('b', { text: best ? grouped(best) : '—' }),
      ),
      button('Speel seed', {
        variant: 'ghost', size: 'sm', icon: '◈',
        onclick: () => ctx.startRun({ astraId: astra.id, seed, daily: true }),
      }),
      iconButton('↗', { label: 'Deel', onclick: () => ctx.share({ seed, score: best }) }),
    ),
  );

  /* ---------------- loadout ---------------- */

  const supportSprites = [];
  const loadoutStrip = buildLoadout();

  function buildLoadout() {
    const ids = supports();
    const tot = supportTotals();
    const strip = el('div.loadout');

    for (let i = 0; i < SUPPORT_SLOTS; i++) {
      const id = ids[i];
      const sa = id ? getAstra(id) : null;
      let art = null;
      if (sa) {
        const sc = new SpriteCanvas(astraSprite(sa, 'idle'), {
          size: 56, tint: sa.colors.primary, tint2: sa.colors.secondary, scale: 1.25,
        });
        supportSprites.push(sc);
        art = sc.canvas;
      }
      strip.appendChild(el('button.slot', {
        dataset: { filled: sa ? '1' : '0' },
        style: sa ? { '--c': RARITY_INFO[sa.rarity].color } : null,
        onclick: () => openSupportPicker(i),
      },
        art ?? el('span.slot__plus', { text: '+' }),
        el('span.slot__label', { text: sa ? sa.name : 'Steun' }),
      ));
    }

    strip.appendChild(el('div.loadout__sum', null,
      el('div.loadout__sumt', { text: 'STEUNBONUS' }),
      el('div.loadout__sumv', { text: tot.damage || tot.fireRate
        ? `+${Math.round(tot.damage * 100)}% schade · +${Math.round(tot.fireRate * 100)}% tempo`
        : 'Geen steun uitgerust' }),
      tot.elements.length
        ? el('div.loadout__els', null, ...tot.elements.map((e) =>
            el('span.tag', { style: { '--c': ELEMENT[e.element].color } },
              `${ELEMENT[e.element].icon} ${ELEMENT[e.element].name}`)))
        : null,
    ));
    return strip;
  }

  function openSupportPicker(slot) {
    const owned = ASTRA.filter((a) => p.collection[a.id] && a.id !== p.equipped)
      .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
    const current = supports()[slot];

    const grid = el('div.cgrid');
    const sprites = [];
    for (const a of owned) {
      const b = supportBonus(a, p.collection[a.id]?.stars ?? 1);
      const card = astraCard(a, p.collection[a.id], {
        size: 76,
        equipped: current === a.id,
        onclick: () => {
          setSupport(slot, current === a.id ? null : a.id);
          sh.close();
          ctx.go('home', { force: true, replace: true });
        },
      });
      card.appendChild(el('div.acard__sup', {
        text: `+${Math.round(b.damage * 100)}% / +${Math.round(b.fireRate * 100)}%`,
      }));
      grid.appendChild(card);
    }

    const sh = sheet(`Steunslot ${slot + 1}`, el('div', null,
      el('p.sheet__lead', { text: 'Steun-Astra vechten niet mee, maar geven stats en lenen hun element aan je treffers. Je hoofd-Astra kan niet ook steun zijn.' }),
      current ? button('Slot leegmaken', {
        variant: 'quiet', size: 'sm',
        onclick: () => { setSupport(slot, null); sh.close(); ctx.go('home', { force: true, replace: true }); },
      }) : null,
      owned.length ? grid : emptyState('◈', 'Nog geen andere Astra', 'Summon er een om steunslots te vullen.'),
    ));
    node.appendChild(sh);
  }

  /* ---------------- trial flight ---------------- */

  const trial = trialAstra();
  const trialDone = trialUsed();
  const trialInfo = RARITY_INFO[trial.rarity];
  const trialSprite = new SpriteCanvas(astraSprite(trial, 'idle'), {
    size: 92, tint: trial.colors.primary, tint2: trial.colors.secondary, scale: 1,
  });

  const trialCard = el('button.trial', {
    dataset: { used: trialDone ? '1' : '0' },
    style: { '--c': trial.colors.primary, '--r': trialInfo.color },
    onclick: () => {
      if (trialDone) {
        bus.emit(EV.TOAST, { text: 'Proefvlucht is vandaag al gebruikt', tone: 'info' });
        return;
      }
      Sfx.play('confirm');
      haptic('medium');
      consumeTrial();
      ctx.startRun({ astraId: trial.id, trial: true, stars: trialStars() });
    },
  },
    el('div.trial__art', null, trialSprite.canvas),
    el('div.trial__mid', null,
      el('div.trial__eyebrow', { text: trialDone ? 'PROEFVLUCHT GEBRUIKT' : 'GRATIS PROEFVLUCHT' }),
      el('div.trial__name', { text: trial.name }),
      el('div.trial__desc', { text: trialDone ? 'Morgen weer een andere Astra' : `Vlieg ${trial.name} één run op ★${trialStars()}` }),
    ),
    el('div.trial__go', { text: trialDone ? '✓' : '▶' }),
  );

  /* ---------------- daily strip ---------------- */

  const streakBtn = el('button.pill.pill--streak', {
    dataset: { ready: streak.claimedToday ? '0' : '1' },
    onclick: () => openStreak(),
  },
    el('span.pill__icon', { text: '🔥' }),
    el('span.pill__text', null, el('b', { text: `Dag ${streak.streak}` }), el('i', { text: streak.claimedToday ? 'Geclaimd' : 'Claim nu' })),
    streak.claimedToday ? null : el('span.pill__dot'),
  );

  const questBtn = el('button.pill', {
    dataset: { ready: questsReady ? '1' : '0' },
    onclick: () => openQuests(),
  },
    el('span.pill__icon', { text: '◎' }),
    el('span.pill__text', null,
      el('b', { text: 'Opdrachten' }),
      el('i', { text: `${quests.filter((q) => q.claimed).length}/${quests.length} klaar` }),
    ),
    questsReady ? el('span.pill__dot') : null,
  );

  const summonBtn = el('button.pill.pill--summon', {
    dataset: { ready: freePullAvailable() ? '1' : '0' },
    onclick: () => ctx.go('summon'),
  },
    el('span.pill__icon', { text: '✦' }),
    el('span.pill__text', null,
      el('b', { text: 'Summon' }),
      el('i', { text: freePullAvailable() ? 'Gratis pull!' : 'Sterrenval' }),
    ),
    freePullAvailable() ? el('span.pill__dot') : null,
  );

  /* ---------------- stats ---------------- */

  const stats = el('div.stiles', null,
    statTile('Beste score', abbrev(p.stats.bestScore), { color: '#fbbf24' }),
    statTile('Beste golf', String(p.stats.bestWave), { color: '#f43f5e' }),
    statTile('Astra', `${cstats.owned}/${cstats.total}`, { color: '#a855f7' }),
    statTile('Runs', String(p.stats.runs), { color: '#22d3ee' }),
  );

  /* ---------------- sheets ---------------- */

  function openStreak() {
    const list = el('div.streak', null,
      ...streak.rewards.map((r, i) => {
        const done = streak.streak % 7 > i || (streak.streak % 7 === 0 && streak.streak > 0 && i < 7);
        const isNext = !streak.claimedToday && i === (streak.streak % 7);
        return el('div.streak__day', { dataset: { done: done ? '1' : '0', next: isNext ? '1' : '0', big: r.big ? '1' : '0' } },
          el('div.streak__n', { text: `Dag ${r.day}` }),
          el('div.streak__r', { text: rewardText(r.bag) }),
          r.label ? el('div.streak__label', { text: r.label }) : null,
          done ? el('div.streak__check', { text: '✓' }) : null,
        );
      }),
    );
    const s = sheet('Inlogreeks', el('div', null,
      el('p.sheet__lead', { text: `Reeks: ${streak.streak} dagen · Record: ${streak.bestStreak}` }),
      list,
      streak.claimedToday
        ? el('div.sheet__note', { text: 'Kom morgen terug voor de volgende beloning.' })
        : button('Claim dag ' + (streak.streak + 1), {
            variant: 'gold', full: true, size: 'lg', sfx: 'confirm',
            onclick: () => { claimDaily(); s.close(); ctx.go('home', { force: true, replace: true }); },
          }),
    ));
    node.appendChild(s);
  }

  function openQuests() {
    const list = el('div.quests', null,
      ...quests.map((q) => {
        const ready = !q.claimed && q.progress >= q.target;
        return el('div.quest', { dataset: { done: q.claimed ? '1' : '0', ready: ready ? '1' : '0' } },
          el('div.quest__mid', null,
            el('div.quest__text', { text: q.text }),
            progressBar(Math.min(1, q.progress / q.target), {
              color: ready ? '#fbbf24' : '#22d3ee',
              label: `${Math.min(q.progress, q.target)}/${q.target}`,
            }),
          ),
          q.claimed
            ? el('div.quest__done', { text: '✓' })
            : button(ready ? 'Claim' : rewardText(q.bag), {
                variant: ready ? 'gold' : 'quiet', size: 'sm', disabled: !ready,
                onclick: () => { claimQuest(q.id); s.close(); ctx.go('home', { force: true, replace: true }); },
              }),
        );
      }),
    );
    const s = sheet('Dagelijkse opdrachten', el('div', null,
      el('p.sheet__lead', { text: `Reset over ${durationStr(msUntilReset())}` }),
      list,
    ));
    node.appendChild(s);
  }

  function openAchievements() {
    const all = achievementList();
    const body = el('div', null,
      el('p.sheet__lead', { text: `${ach.done} van de ${ach.total} behaald. Beloningen worden automatisch uitgekeerd.` }),
      progressBar(ach.pct, { color: '#fbbf24', height: 8 }),
      ...GROUPS.map((g) => {
        const items = all.filter((a) => a.group === g);
        if (!items.length) return null;
        return el('div.achgroup', null,
          el('h3.sheet__h3', { text: g }),
          ...items.map((a) => el('div.ach', { dataset: { done: a.done ? '1' : '0' } },
            el('div.ach__icon', { text: a.icon }),
            el('div.ach__mid', null,
              el('div.ach__name', { text: a.name }),
              el('div.ach__desc', { text: a.desc }),
              a.done ? null : progressBar(a.progress, { color: '#22d3ee', height: 4 }),
            ),
            el('div.ach__reward', { text: a.done ? '✓' : rewardText(a.reward) }),
          )),
        );
      }),
    );
    node.appendChild(sheet('Prestaties', body));
  }

  function openLeaderboard() {
    const rows = leaderboard(10);
    const body = rows.length
      ? el('div.lb', null, ...rows.map((r, i) => el('div.lb__row', { dataset: { top: i < 3 ? '1' : '0' } },
          el('span.lb__i', { text: String(i + 1) }),
          el('span.lb__astra', { text: getAstra(r.astraId)?.name ?? '—' }),
          el('span.lb__wave', { text: `G${r.wave}` }),
          el('span.lb__score', { text: grouped(r.score) }),
        )))
      : el('div.empty', null, el('div.empty__icon', { text: '◈' }), el('div.empty__title', { text: 'Nog geen runs' }));
    node.appendChild(sheet('Jouw beste runs', body));
  }

  /* ---------------- assemble ---------------- */

  const node = el('div.home', null,
    el('div.topbar', null,
      playerStrip(),
      currencyRail(['stardust', 'shards', 'echoes']),
    ),
    el('div.home__scroll', null,
      hero,
      playBtn,
      loadoutStrip,
      el('div.pills', null, streakBtn, questBtn, summonBtn),
      trialCard,
      dailyCard,
      el('div.home__statshead', null,
        el('h3', { text: 'Statistieken' }),
        el('div.home__statslinks', null,
          el('button.linkbtn', { text: `Prestaties ${ach.done}/${ach.total} ›`, onclick: openAchievements }),
          el('button.linkbtn', { text: 'Beste runs ›', onclick: openLeaderboard }),
          el('button.linkbtn', { text: `Bestiarium ${bes.have}/${bes.total} ›`, onclick: () => ctx.go('bestiary') }),
        ),
      ),
      stats,
      el('div.home__foot', null,
        el('button.linkbtn', { text: '⚙ Instellingen', onclick: () => ctx.go('settings') }),
        el('span.home__ver', { text: 'ASTRAFALL v0.10' }),
      ),
    ),
  );

  return {
    node,
    dispose() {
      heroSprite.destroy();
      trialSprite.destroy();
      while (supportSprites.length) supportSprites.pop().destroy();
    },
  };
}

function rewardText(bag) {
  const sym = { stardust: '✦', shards: '◈', echoes: '◉', cores: '⬢' };
  return Object.entries(bag).map(([k, v]) => `${sym[k] ?? ''}${abbrev(v)}`).join('  ');
}
