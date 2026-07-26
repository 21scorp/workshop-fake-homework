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
} from '../components/Chrome.js';
import { SpriteCanvas } from '../components/SpriteCanvas.js';
import { save } from '../../core/Save.js';
import { getAstra, STARTER_ID, astraSprite } from '../../data/astra.js';
import { RARITY_INFO, ELEMENT } from '../../data/constants.js';
import { abbrev, grouped, durationStr } from '../../core/Math2.js';
import {
  streakState, claimDaily, todaysQuests, claimQuest, dailySeed, dailyBest,
  msUntilReset, freePullAvailable,
} from '../../systems/Daily.js';
import { collectionStats } from '../../systems/Gacha.js';
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
    el('button.hero__swap', {
      onclick: () => { Sfx.play('tap'); haptic('light'); ctx.go('collection'); },
    }, '⇄ Wissel'),
  );

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
      el('div.pills', null, streakBtn, questBtn, summonBtn),
      dailyCard,
      el('div.home__statshead', null,
        el('h3', { text: 'Statistieken' }),
        el('button.linkbtn', { text: 'Beste runs ›', onclick: openLeaderboard }),
      ),
      stats,
      el('div.home__foot', null,
        el('button.linkbtn', { text: '⚙ Instellingen', onclick: () => ctx.go('settings') }),
        el('span.home__ver', { text: 'ASTRAFALL v0.9' }),
      ),
    ),
  );

  return {
    node,
    dispose() { heroSprite.destroy(); },
  };
}

function rewardText(bag) {
  const sym = { stardust: '✦', shards: '◈', echoes: '◉', cores: '⬢' };
  return Object.entries(bag).map(([k, v]) => `${sym[k] ?? ''}${abbrev(v)}`).join('  ');
}
